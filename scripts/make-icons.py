#!/usr/bin/env python3
"""Generate the PWA raster icons.

iOS ignores SVG for apple-touch-icon and the web app manifest wants PNGs, so
we render them here instead of committing binaries with no source. Pure stdlib
(zlib + struct) so there's nothing to install — the artwork is simple enough
that a real image library would be overkill.

Usage: python3 scripts/make-icons.py
"""

import struct
import zlib
from pathlib import Path

BG = (0x10, 0x13, 0x1A)
ACCENT = (0x4A, 0xDE, 0x80)
ACCENT_2 = (0x60, 0xA5, 0xFA)

SS = 3  # supersampling factor, for cheap anti-aliasing


def shade(x, y, size):
    """Colour for a point in icon space: a rounded square with two dots."""
    r = size * 0.22
    # Rounded-square mask: outside the corner radius, the pixel is transparent.
    cx = min(max(x, r), size - r)
    cy = min(max(y, r), size - r)
    if (x - cx) ** 2 + (y - cy) ** 2 > r * r:
        return None

    # Big accent dot, offset up-left; smaller blue dot down-right.
    if (x - size * 0.42) ** 2 + (y - size * 0.42) ** 2 < (size * 0.20) ** 2:
        return ACCENT
    if (x - size * 0.66) ** 2 + (y - size * 0.66) ** 2 < (size * 0.12) ** 2:
        return ACCENT_2
    return BG


def render(size):
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0
            for sy in range(SS):
                for sx in range(SS):
                    c = shade(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS, size)
                    if c is not None:
                        r += c[0]
                        g += c[1]
                        b += c[2]
                        a += 255
            n = SS * SS
            # Premultiplied averages would darken the edge; divide colour by
            # the number of covered samples instead, alpha by all of them.
            covered = a // 255 or 1
            row += bytes((r // covered, g // covered, b // covered, a // n))
        rows.append(bytes(row))
    return rows


def write_png(path, size):
    raw = b"".join(b"\x00" + row for row in render(size))

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    print(f"wrote {path} ({size}x{size}, {len(png)} bytes)")


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    write_png(root / "icon-180.png", 180)
    write_png(root / "icon-512.png", 512)
