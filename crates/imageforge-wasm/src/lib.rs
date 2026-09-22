//! Minimal, dependency-free binary helpers for ImageForge.
//!
//! The module exposes a plain C ABI so the browser can instantiate it directly with
//! WebAssembly.instantiate, without wasm-bindgen or any third-party crate.

use std::alloc::{alloc as rust_alloc, dealloc as rust_dealloc, Layout};

const VERSION: u32 = 0x0001_0000;

const HEAP_ALIGN: usize = 8;

#[no_mangle]
pub extern "C" fn imageforge_version() -> u32 {
    VERSION
}

/// Allocates the requested number of bytes inside the module heap and returns the pointer.
#[no_mangle]
pub unsafe extern "C" fn alloc(size: usize) -> *mut u8 {
    if size == 0 {
        return std::ptr::null_mut();
    }
    match Layout::from_size_align(size, HEAP_ALIGN) {
        Ok(layout) => rust_alloc(layout),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Releases memory previously returned by alloc.
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    if ptr.is_null() || size == 0 {
        return;
    }
    if let Ok(layout) = Layout::from_size_align(size, HEAP_ALIGN) {
        rust_dealloc(ptr, layout);
    }
}

/// Table-free CRC-32 (reflected, polynomial 0xEDB88320) over a heap buffer.
#[no_mangle]
pub unsafe extern "C" fn imageforge_crc32(ptr: *const u8, len: usize) -> u32 {
    let mut crc: u32 = 0xffff_ffff;
    let data = std::slice::from_raw_parts(ptr, len);
    for byte in data {
        crc ^= *byte as u32;
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xedb8_8320 & mask);
        }
    }
    !crc
}

/// Upper bound of the decompressed size of an LZ4 block (LZ4 worst case).
#[no_mangle]
pub extern "C" fn imageforge_lz4_block_max_size(src_len: usize) -> usize {
    src_len.saturating_mul(255).saturating_add(16)
}

/// Decompresses one raw LZ4 block into dst, returning the number of bytes written
/// or a negative value when the block is malformed or the destination is too small.
///
/// The first prefix_len bytes of dst must already hold the previous window (at most
/// 64 KiB). Matches may reach back into that window, which is what LZ4 frames with
/// dependent blocks require. Pass 0 for independent blocks.
#[no_mangle]
pub unsafe extern "C" fn imageforge_lz4_decompress_block(
    src: *const u8,
    src_len: usize,
    dst: *mut u8,
    dst_cap: usize,
    prefix_len: usize,
) -> i64 {
    let input = std::slice::from_raw_parts(src, src_len);
    let output = std::slice::from_raw_parts_mut(dst, dst_cap);
    if prefix_len > dst_cap {
        return -1;
    }
    match lz4_decompress_block_with_prefix(input, output, prefix_len) {
        Some(written) => written as i64,
        None => -1,
    }
}

fn lz4_decompress_block(input: &[u8], output: &mut [u8]) -> Option<usize> {
    lz4_decompress_block_with_prefix(input, output, 0)
}

fn lz4_decompress_block_with_prefix(input: &[u8], output: &mut [u8], prefix_len: usize) -> Option<usize> {
    let mut sp = 0usize;
    let mut dp = prefix_len;

    while sp < input.len() {
        let token = input[sp];
        sp += 1;

        let mut literal_len = (token >> 4) as usize;
        if literal_len == 15 {
            loop {
                if sp >= input.len() {
                    return None;
                }
                let next = input[sp] as usize;
                sp += 1;
                literal_len += next;
                if next != 255 {
                    break;
                }
            }
        }

        if sp + literal_len > input.len() || dp + literal_len > output.len() {
            return None;
        }
        output[dp..dp + literal_len].copy_from_slice(&input[sp..sp + literal_len]);
        sp += literal_len;
        dp += literal_len;

        if sp >= input.len() {
            break;
        }
        if sp + 2 > input.len() {
            return None;
        }
        let offset = (input[sp] as usize) | ((input[sp + 1] as usize) << 8);
        sp += 2;
        if offset == 0 || offset > dp {
            return None;
        }

        let mut match_len = (token & 0x0f) as usize;
        if match_len == 15 {
            loop {
                if sp >= input.len() {
                    return None;
                }
                let next = input[sp] as usize;
                sp += 1;
                match_len += next;
                if next != 255 {
                    break;
                }
            }
        }
        match_len += 4;
        if dp + match_len > output.len() {
            return None;
        }

        let src_pos = dp - offset;
        for i in 0..match_len {
            output[dp + i] = output[src_pos + i];
        }
        dp += match_len;
    }

    Some(dp - prefix_len)
}

// ---------------------------------------------------------------------------
// LZ4 block compression
//
// A plain greedy matcher: it is deterministic, dependency free and produces a
// valid LZ4 block. The TypeScript fallback implements the exact same algorithm,
// so both paths produce identical bytes.
// ---------------------------------------------------------------------------

const LZ4_MIN_MATCH: usize = 4;
const LZ4_LAST_LITERALS: usize = 5;
const LZ4_MF_LIMIT: usize = 12;
const LZ4_MAX_OFFSET: usize = 65535;
const LZ4_HASH_LOG: u32 = 16;

fn lz4_hash4(value: u32) -> usize {
    (value.wrapping_mul(2654435761) >> (32 - LZ4_HASH_LOG)) as usize
}

fn read_u32_le(data: &[u8], index: usize) -> u32 {
    u32::from_le_bytes([data[index], data[index + 1], data[index + 2], data[index + 3]])
}

fn write_length(output: &mut [u8], mut pos: usize, mut length: usize) -> Option<usize> {
    while length >= 255 {
        if pos >= output.len() {
            return None;
        }
        output[pos] = 255;
        pos += 1;
        length -= 255;
    }
    if pos >= output.len() {
        return None;
    }
    output[pos] = length as u8;
    Some(pos + 1)
}

/// Compresses one raw LZ4 block, returning the number of bytes written or a negative
/// value when the destination is too small.
#[no_mangle]
pub unsafe extern "C" fn imageforge_lz4_compress_block(
    src: *const u8,
    src_len: usize,
    dst: *mut u8,
    dst_cap: usize,
) -> i64 {
    let input = std::slice::from_raw_parts(src, src_len);
    let output = std::slice::from_raw_parts_mut(dst, dst_cap);
    match lz4_compress_block(input, output) {
        Some(written) => written as i64,
        None => -1,
    }
}

fn lz4_compress_block(input: &[u8], output: &mut [u8]) -> Option<usize> {
    let n = input.len();
    if n == 0 {
        return Some(0);
    }

    let mut table = vec![0u32; 1usize << LZ4_HASH_LOG];
    let mut pos = 0usize;
    let mut anchor = 0usize;
    let mut i = 0usize;
    let match_limit = n.saturating_sub(LZ4_LAST_LITERALS);

    while i + LZ4_MF_LIMIT <= n {
        let sequence = read_u32_le(input, i);
        let slot = lz4_hash4(sequence);
        let candidate = table[slot] as usize;
        table[slot] = i as u32;

        if candidate < i && i - candidate <= LZ4_MAX_OFFSET && read_u32_le(input, candidate) == sequence {
            let mut match_len = LZ4_MIN_MATCH;
            while i + match_len < match_limit && input[candidate + match_len] == input[i + match_len] {
                match_len += 1;
            }

            let literal_len = i - anchor;
            let match_code = match_len - LZ4_MIN_MATCH;
            if pos >= output.len() {
                return None;
            }
            let token_pos = pos;
            pos += 1;
            output[token_pos] = ((if literal_len >= 15 { 15 } else { literal_len } as u8) << 4)
                | (if match_code >= 15 { 15 } else { match_code } as u8);

            if literal_len >= 15 {
                pos = write_length(output, pos, literal_len - 15)?;
            }
            if pos + literal_len > output.len() {
                return None;
            }
            output[pos..pos + literal_len].copy_from_slice(&input[anchor..anchor + literal_len]);
            pos += literal_len;

            if pos + 2 > output.len() {
                return None;
            }
            let offset = (i - candidate) as u16;
            output[pos] = (offset & 0xff) as u8;
            output[pos + 1] = (offset >> 8) as u8;
            pos += 2;

            if match_code >= 15 {
                pos = write_length(output, pos, match_code - 15)?;
            }

            i += match_len;
            anchor = i;
        } else {
            i += 1;
        }
    }

    let literal_len = n - anchor;
    if pos >= output.len() {
        return None;
    }
    let token_pos = pos;
    pos += 1;
    output[token_pos] = (if literal_len >= 15 { 15 } else { literal_len } as u8) << 4;
    if literal_len >= 15 {
        pos = write_length(output, pos, literal_len - 15)?;
    }
    if pos + literal_len > output.len() {
        return None;
    }
    output[pos..pos + literal_len].copy_from_slice(&input[anchor..n]);
    pos += literal_len;

    Some(pos)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crc32_matches_known_vector() {
        let data = b"123456789";
        let crc = unsafe { imageforge_crc32(data.as_ptr(), data.len()) };
        assert_eq!(crc, 0xcbf4_3926);
    }

    #[test]
    fn decodes_a_literal_only_block() {
        let input = [0x50u8, b'h', b'e', b'l', b'l', b'o'];
        let mut output = [0u8; 8];
        let written = lz4_decompress_block(&input, &mut output).unwrap();
        assert_eq!(written, 5);
        assert_eq!(&output[..5], b"hello");
    }

    #[test]
    fn compresses_and_decompresses_round_trip() {
        let mut input = Vec::new();
        for i in 0..4096u32 {
            input.extend_from_slice(b"imageforge-imageforge-");
            input.push((i % 251) as u8);
        }
        let mut compressed = vec![0u8; input.len() * 2 + 64];
        let written = lz4_compress_block(&input, &mut compressed).unwrap();
        assert!(written < input.len(), "compression should shrink repetitive data");

        let mut output = vec![0u8; input.len()];
        let decoded = lz4_decompress_block(&compressed[..written], &mut output).unwrap();
        assert_eq!(decoded, input.len());
        assert_eq!(output, input);
    }

    #[test]
    fn compresses_incompressible_data_losslessly() {
        let mut state = 12345u32;
        let input: Vec<u8> = (0..2048)
            .map(|_| {
                state = state.wrapping_mul(1103515245).wrapping_add(12345);
                (state >> 16) as u8
            })
            .collect();
        let mut compressed = vec![0u8; input.len() * 2 + 64];
        let written = lz4_compress_block(&input, &mut compressed).unwrap();

        let mut output = vec![0u8; input.len()];
        let decoded = lz4_decompress_block(&compressed[..written], &mut output).unwrap();
        assert_eq!(decoded, input.len());
        assert_eq!(output, input);
    }

    #[test]
    fn decodes_a_block_that_matches_into_the_previous_window() {
        // prefix "abcdefgh", then a literal-only block must not disturb it, and a
        // block whose match reaches into the prefix must resolve correctly.
        let prefix = b"abcdefgh";
        let mut buffer = vec![0u8; prefix.len() + 32];
        buffer[..prefix.len()].copy_from_slice(prefix);

        // token 0x00: no literals, match length 4 + extension 0 at offset 8 -> "abcd"
        let block = [0x00u8, 0x08, 0x00];
        let written = lz4_decompress_block_with_prefix(&block, &mut buffer, prefix.len()).unwrap();
        assert_eq!(written, 4);
        assert_eq!(&buffer[prefix.len()..prefix.len() + 4], b"abcd");
    }

    #[test]
    fn decodes_an_overlapping_match() {
        // token 0x22: two literals then a match of length 2 + 4 = 6 at offset 2
        let input = [0x22u8, b'a', b'b', 0x02, 0x00];
        let mut output = [0u8; 8];
        let written = lz4_decompress_block(&input, &mut output).unwrap();
        assert_eq!(written, 8);
        assert_eq!(&output[..8], b"abababab");
    }
}
// --- xz / LZMA2 ------------------------------------------------------------------------------
//
// Magisk's magiskboot compresses its ramdisk payloads with xz, and XZ is also one of the
// containers Android kernels and ramdisks use, so the module has to be able to read and write it.
// The codec comes from lzma-rust2, the crate magiskboot itself uses, with the same settings
// (preset 6 and a CRC32 check). magiskboot also prepends a BCJ filter for the target architecture;
// omitting it produces a slightly larger but equally standard stream that every decoder reads.

use lzma_rust2::{CheckType, XzOptions, XzReader, XzWriter};
use std::io::{Read, Write};

/// Upper bound for the compressed size of `src_len` bytes, comfortably above LZMA2's worst case.
#[no_mangle]
pub extern "C" fn imageforge_xz_compress_bound(src_len: usize) -> usize {
    src_len.saturating_add(src_len / 3).saturating_add(512)
}

/// Compresses one payload into an xz stream. Returns the bytes written, or -1 when the
/// destination is too small or the encoder failed.
#[no_mangle]
pub unsafe extern "C" fn imageforge_xz_compress(
    src: *const u8,
    src_len: usize,
    dst: *mut u8,
    dst_cap: usize,
) -> i64 {
    let input = std::slice::from_raw_parts(src, src_len);
    let output = std::slice::from_raw_parts_mut(dst, dst_cap);

    let mut options = XzOptions::with_preset(6);
    options.set_check_sum_type(CheckType::Crc32);
    let mut writer = match XzWriter::new(Vec::<u8>::with_capacity(src_len / 3 + 256), options) {
        Ok(writer) => writer,
        Err(_) => return -1,
    };
    if writer.write_all(input).is_err() {
        return -1;
    }
    let compressed = match writer.finish() {
        Ok(bytes) => bytes,
        Err(_) => return -1,
    };
    if compressed.len() > dst_cap {
        return -1;
    }
    output[..compressed.len()].copy_from_slice(&compressed);
    compressed.len() as i64
}

/// Expands one xz stream into `dst`. Returns the bytes written, -1 on a malformed stream, or -2
/// when the destination is too small so the caller can retry with a larger buffer.
#[no_mangle]
pub unsafe extern "C" fn imageforge_xz_decompress(
    src: *const u8,
    src_len: usize,
    dst: *mut u8,
    dst_cap: usize,
) -> i64 {
    let input = std::slice::from_raw_parts(src, src_len);
    let mut reader = XzReader::new(std::io::Cursor::new(input), true);
    let mut expanded = Vec::<u8>::new();
    if reader.read_to_end(&mut expanded).is_err() {
        return -1;
    }
    if expanded.len() > dst_cap {
        return -2;
    }
    if !expanded.is_empty() {
        std::slice::from_raw_parts_mut(dst, expanded.len()).copy_from_slice(&expanded);
    }
    expanded.len() as i64
}
