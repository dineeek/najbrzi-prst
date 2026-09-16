import struct
import zlib
from pathlib import Path

BOLT = [(0.58, 0.08), (0.30, 0.55), (0.48, 0.55), (0.40, 0.92), (0.72, 0.42), (0.54, 0.42)]
BACKGROUND = (11, 18, 32)
ACCENT = (255, 204, 0)


def is_inside(x, y):
    hit = False
    j = len(BOLT) - 1
    for i in range(len(BOLT)):
        xi, yi = BOLT[i]
        xj, yj = BOLT[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def png_chunk(kind, data):
    body = kind + data
    return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)


def render(size):
    rows = []
    radius = size * 0.2
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            cx = min(px, size - 1 - px)
            cy = min(py, size - 1 - py)
            is_corner = cx < radius and cy < radius and (radius - cx) ** 2 + (radius - cy) ** 2 > radius ** 2
            if is_corner:
                row += bytes([0, 0, 0, 0])
                continue
            samples = 0
            for sx in (0.25, 0.75):
                for sy in (0.25, 0.75):
                    if is_inside((px + sx) / size, (py + sy) / size):
                        samples += 1
            mix = samples / 4
            color = tuple(round(b * (1 - mix) + a * mix) for b, a in zip(BACKGROUND, ACCENT))
            row += bytes(color) + bytes([255])
        rows.append(bytes(row))
    raw = b''.join(rows)
    header = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', header) + png_chunk(b'IDAT', zlib.compress(raw, 9)) + png_chunk(b'IEND', b'')


out = Path(__file__).resolve().parent.parent / 'public' / 'icons'
out.mkdir(parents=True, exist_ok=True)
for size in (16, 32, 48, 128):
    (out / f'icon{size}.png').write_bytes(render(size))
    print(f'wrote icon{size}.png')
