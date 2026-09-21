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
#[no_mangle]
pub unsafe extern "C" fn imageforge_lz4_decompress_block(
    src: *const u8,
    src_len: usize,
    dst: *mut u8,
    dst_cap: usize,
) -> i64 {
    let input = std::slice::from_raw_parts(src, src_len);
    let output = std::slice::from_raw_parts_mut(dst, dst_cap);
    match lz4_decompress_block(input, output) {
        Some(written) => written as i64,
        None => -1,
    }
}

fn lz4_decompress_block(input: &[u8], output: &mut [u8]) -> Option<usize> {
    let mut sp = 0usize;
    let mut dp = 0usize;

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

    Some(dp)
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
    fn decodes_an_overlapping_match() {
        // token 0x22: two literals then a match of length 2 + 4 = 6 at offset 2
        let input = [0x22u8, b'a', b'b', 0x02, 0x00];
        let mut output = [0u8; 8];
        let written = lz4_decompress_block(&input, &mut output).unwrap();
        assert_eq!(written, 8);
        assert_eq!(&output[..8], b"abababab");
    }
}
