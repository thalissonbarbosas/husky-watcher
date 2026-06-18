"""
Generate neutral extension icons — a pink monitoring dot on a dark purple
square, matching the popup theme. No external dependencies, no brand assets.
Run once: python3 generate_icons.py
"""
import struct, zlib, os

BG = (31, 15, 43)       # dark purple (#1f0f2b)
DOT = (233, 70, 197)    # pink (#E946C5)

def make_png(size, filename):
    cx = cy = (size - 1) / 2
    radius = size * 0.34

    rows = b''
    for y in range(size):
        row = b'\x00'  # filter type = None
        for x in range(size):
            # Filled circle in the center, dark purple elsewhere.
            inside = (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
            r, g, b = DOT if inside else BG
            row += bytes([r, g, b])
        rows += row

    def chunk(name, data):
        c = struct.pack('>I', len(data)) + name + data
        return c + struct.pack('>I', zlib.crc32(name + data) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', ihdr)
           + chunk(b'IDAT', zlib.compress(rows))
           + chunk(b'IEND', b''))

    with open(filename, 'wb') as f:
        f.write(png)
    print(f'  created {filename}')

os.makedirs('icons', exist_ok=True)
for size in (16, 48, 128):
    make_png(size, f'icons/icon{size}.png')
print('Done.')
