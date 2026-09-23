#!/usr/bin/env python3
"""Recover ELF payloads that a Rust program embedded into its own binary.

Some KernelSU-family managers embed their `ksuinit` wrapper and their loadable modules inside
`libksud.so` (`rust-embed` + `include-flate`, which stores each asset as a raw DEFLATE stream) and
publish only the APK, so the payloads exist nowhere else and have to be recovered from the binary.
This is that recovery: find the DEFLATE streams that inflate to a whole ELF, and report each one with
its digest and its `.modinfo`, which is what names a module and the kernel it was built for.

    python3 scripts/scan-embedded-elf.py <binary> [--extract <dir>]

Inflating SukiSU's `libksud.so` yields bytes equal to its published `*-lkm.zip` and
`ksuinit-aarch64.zip` archives, which is what validates this scan. Everything recovered this way is
recorded in THIRD_PARTY_LICENSES/kernelsu/.
"""
import hashlib
import os
import struct
import sys
import zlib

ELF_MAGIC = b"\x7fELF"
PROBE = 4096
# Nothing embedded here comes close: the largest payload in any of these managers is about 1.6 MB.
MAX_OUTPUT = 16 * 1024 * 1024


def sections(data: bytes):
    """Section headers, or None when the bytes are not a 64 bit little endian ELF."""
    if len(data) < 0x40 or data[:4] != ELF_MAGIC or data[4] != 2 or data[5] != 1:
        return None
    shoff = struct.unpack_from("<Q", data, 0x28)[0]
    shentsize, shnum, shstrndx = struct.unpack_from("<HHH", data, 0x3A)
    if shnum == 0 or shoff + shnum * shentsize > len(data):
        return None
    entries = []
    for index in range(shnum):
        base = shoff + index * shentsize
        name_offset, _type, _flags, _addr, offset, size = struct.unpack_from("<IIQQQQ", data, base)
        entries.append((name_offset, offset, size))
    try:
        names_offset = entries[shstrndx][1]
    except IndexError:
        return None

    def name_at(offset: int) -> str:
        start = names_offset + offset
        end = data.index(b"\0", start)
        return data[start:end].decode("latin1")

    return [(name_at(name_offset), offset, size) for name_offset, offset, size in entries]


def modinfo(data: bytes):
    """The .modinfo fields of a loadable module, {} for a plain ELF, None for a non-ELF."""
    listed = sections(data)
    if listed is None:
        return None
    for name, offset, size in listed:
        if name == ".modinfo":
            fields = {}
            for item in data[offset:offset + size].split(b"\0"):
                if b"=" in item:
                    key, value = item.split(b"=", 1)
                    fields[key.decode()] = value.decode("latin1")
            return fields
    return {}


def scan(path: str):
    data = memoryview(open(path, "rb").read())
    size = len(data)
    found = []
    offset = 0
    while offset < size:
        probe = zlib.decompressobj(-15)
        try:
            head = probe.decompress(data[offset:offset + PROBE], 64 * 1024)
        except zlib.error:
            offset += 1
            continue
        if len(head) < 4 or head[:4] != ELF_MAGIC:
            offset += 1
            continue
        whole = zlib.decompressobj(-15)
        try:
            body = whole.decompress(data[offset:], MAX_OUTPUT)
            body += whole.flush()
        except zlib.error:
            offset += 1
            continue
        if not whole.eof or sections(body) is None:
            offset += 1
            continue
        consumed = size - offset - len(whole.unused_data)
        found.append((offset, body))
        offset += max(consumed, 1)
    return found


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__.strip())
        return 2
    source = argv[0]
    directory = None
    if "--extract" in argv:
        directory = argv[argv.index("--extract") + 1]
        os.makedirs(directory, exist_ok=True)

    hits = scan(source)
    for offset, body in hits:
        info = modinfo(body) or {}
        digest = hashlib.sha256(body).hexdigest()
        print(
            f"offset={offset} size={len(body)} sha256={digest}"
            f" name={info.get('name', '-')}"
            f" vermagic={info.get('vermagic', '-')}"
            + (f" license={info['license']}" if "license" in info else "")
        )
        if directory:
            name = info.get("name") or "elf"
            open(os.path.join(directory, f"{name}.{len(body)}.{offset}.bin"), "wb").write(body)
    print(f"scanned {source}: {len(hits)} ELF streams")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
