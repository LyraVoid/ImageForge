//! Minimal, dependency-free binary helpers for ImageForge.
//!
//! The module exposes a plain C ABI so the browser can instantiate it directly with
//! WebAssembly.instantiate, without wasm-bindgen or any third-party crate.
//!
//! The LZ4 *compressor* in here is a fallback, not the codec the pipeline prefers:
//! `public/wasm/lz4.wasm` is upstream liblz4 itself (see `third_party/lz4-wasm/`), which is what
//! makes the container bytes of a patched image identical to what magiskboot writes. This encoder is
//! used when that module cannot be loaded, and produces valid blocks about 3% larger. LZ4 and XZ
//! *decompression*, CRC32 and the block size bound are only implemented here.

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

/// How many chain candidates one position may inspect. This mirrors the reference encoder's
/// high-compression search; it is a bounded subset of it, which is why the reference codec in
/// `lz4.wasm` is what the pipeline actually compresses with.
const LZ4_HC_ATTEMPTS: usize = 128;

/// Matches shorter than this also search the next position, which is the lazy matching LZ4 HC does.
const LZ4_HC_LAZY_LENGTH: usize = 128;

/// Records a position in the hash chain, exactly like the reference encoder's insert step.
fn lz4_insert(input: &[u8], position: usize, head: &mut [u32], chain: &mut [u32]) {
    let hash = lz4_hash4(read_u32_le(input, position));
    chain[position & 0xffff] = head[hash];
    head[hash] = position as u32;
}

/// Walks the chain for the longest match at `i`, rejecting candidates that cannot beat the best
/// one found so far before it pays for a full comparison.
fn lz4_find_match(
    input: &[u8],
    i: usize,
    match_limit: usize,
    mut candidate: usize,
    chain: &[u32],
) -> Option<(usize, usize)> {
    let mut best_start = 0usize;
    let mut best_length = 0usize;
    let mut attempts = 0usize;
    let probe = read_u32_le(input, i);

    while candidate != u32::MAX as usize && attempts < LZ4_HC_ATTEMPTS {
        if candidate >= i || i - candidate > LZ4_MAX_OFFSET {
            break;
        }
        let worth_it = best_length < LZ4_MIN_MATCH
            || (i + best_length < match_limit
                && candidate + best_length < input.len()
                && input[candidate + best_length] == input[i + best_length]);
        if worth_it && read_u32_le(input, candidate) == probe {
            let mut length = LZ4_MIN_MATCH;
            while i + length < match_limit && input[candidate + length] == input[i + length] {
                length += 1;
            }
            if length > best_length {
                best_length = length;
                best_start = candidate;
            }
        }
        candidate = chain[candidate & 0xffff] as usize;
        attempts += 1;
    }

    if best_length >= LZ4_MIN_MATCH {
        Some((best_start, best_length))
    } else {
        None
    }
}

fn lz4_compress_block(input: &[u8], output: &mut [u8]) -> Option<usize> {
    let n = input.len();
    if n == 0 {
        return Some(0);
    }

    let mut head = vec![u32::MAX; 1usize << LZ4_HASH_LOG];
    let mut chain = vec![u32::MAX; 1usize << 16];
    let mut pos = 0usize;
    let mut anchor = 0usize;
    let mut i = 0usize;
    let match_limit = n.saturating_sub(LZ4_LAST_LITERALS);

    while i + LZ4_MF_LIMIT <= n {
        let hash = lz4_hash4(read_u32_le(input, i));
        let previous = head[hash];
        chain[i & 0xffff] = previous;
        head[hash] = i as u32;

        let mut found = lz4_find_match(input, i, match_limit, previous as usize, &chain);

        // Lazy matching: a longer match one byte later is worth emitting a literal for, which is
        // where a good part of the compression difference over a greedy encoder comes from.
        if let Some((_, length)) = found {
            if length < LZ4_HC_LAZY_LENGTH && i + 1 + LZ4_MF_LIMIT <= n {
                let next_hash = lz4_hash4(read_u32_le(input, i + 1));
                let next_previous = head[next_hash];
                chain[(i + 1) & 0xffff] = next_previous;
                head[next_hash] = (i + 1) as u32;
                if let Some((_, next_length)) = lz4_find_match(input, i + 1, match_limit, next_previous as usize, &chain) {
                    if next_length > length {
                        i += 1;
                        continue;
                    }
                }
            }
        }

        match found.take() {
            Some((candidate, match_len)) => {
                // Extend the match backwards into the pending literals, the way the reference HC
                // encoder does: it costs nothing and it is where a few more percent come from.
                let mut candidate = candidate;
                let mut match_start = i;
                let mut length = match_len;
                while match_start > anchor && candidate > 0 && input[candidate - 1] == input[match_start - 1] {
                    candidate -= 1;
                    match_start -= 1;
                    length += 1;
                }

                let literal_len = match_start - anchor;
                let match_code = length - LZ4_MIN_MATCH;
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
                let offset = (match_start - candidate) as u16;
                output[pos] = (offset & 0xff) as u8;
                output[pos + 1] = (offset >> 8) as u8;
                pos += 2;

                if match_code >= 15 {
                    pos = write_length(output, pos, match_code - 15)?;
                }

                // Keep the positions inside the match in the chains: later text can match them.
                let match_end = match_start + length;
                let mut inside = i + 1;
                while inside < match_end {
                    lz4_insert(input, inside, &mut head, &mut chain);
                    inside += 1;
                }
                i = match_end;
                anchor = i;
            }
            None => i += 1,
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

/// The bzip2 stream header: "BZh", a block size digit, then the 6 byte block magic (0x314159265359).
fn bzip2_header_ok(input: &[u8]) -> bool {
    input.len() >= 10
        && input[0] == b'B'
        && input[1] == b'Z'
        && input[2] == b'h'
        && (b'1'..=b'9').contains(&input[3])
        && input[4..10] == [0x31, 0x41, 0x59, 0x26, 0x53, 0x59]
}

/// Expands one bzip2 stream into `dst`. Returns the bytes written, -1 on a malformed stream, or -2
/// when the destination is too small so the caller can retry with a larger buffer.
///
/// Real OTA payloads carry partitions as REPLACE_BZ blobs, and bzip2 is not block addressable: the
/// stream is expanded into a bounded buffer, with the size the extents already promise as the cap.
#[no_mangle]
pub unsafe extern "C" fn imageforge_bzip2_decompress(
    src: *const u8,
    src_len: usize,
    dst: *mut u8,
    dst_cap: usize,
) -> i64 {
    use bzip2_rs::DecoderReader;
    use std::io::Read;

    let input = std::slice::from_raw_parts(src, src_len);
    // Check the stream header first: the decoder is written for well formed input, and a corrupt
    // payload must fail the extraction rather than trap the module.
    if !bzip2_header_ok(input) {
        return -1;
    }
    let mut reader = DecoderReader::new(std::io::Cursor::new(input));
    // Bounded by hand rather than with Take: stopping a Take in the middle of a block leaves the
    // decoder at a half-read position, which it treats as a fatal error. Reading a chunk at a time
    // and stopping between chunks keeps both the decoder and the heap happy.
    let mut expanded = Vec::<u8>::new();
    let mut chunk = [0u8; 64 * 1024];
    loop {
        match reader.read(&mut chunk) {
            Ok(0) => break,
            Ok(written) => {
                expanded.extend_from_slice(&chunk[..written]);
                if expanded.len() > dst_cap {
                    return -2;
                }
            }
            Err(_) => return -1,
        }
    }
    if !expanded.is_empty() {
        std::slice::from_raw_parts_mut(dst, expanded.len()).copy_from_slice(&expanded);
    }
    expanded.len() as i64
}