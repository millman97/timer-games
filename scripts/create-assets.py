"""Generate original seven-segment outlines and icons. No downloaded artwork.

TTF generation uses only Python's standard library; icon generation uses Pillow.
Run from the repository root. The generated files are committed, so players and
production exports do not need Python or Pillow.
"""
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parent.parent

def u16(*values):
    return struct.pack('>' + 'H' * len(values), *values)

def i16(*values):
    return struct.pack('>' + 'h' * len(values), *values)

def u32(*values):
    return struct.pack('>' + 'I' * len(values), *values)

def checksum(data):
    data += b'\0' * (-len(data) % 4)
    return sum(struct.unpack('>' + 'I' * (len(data) // 4), data)) & 0xffffffff

def rect(x, y, w, h):
    return [(x, y), (x, y + h), (x + w, y + h), (x + w, y)]

def font():
    segments = {
        'a': rect(110, 650, 400, 70), 'g': rect(110, 330, 400, 70),
        'd': rect(110, 10, 400, 70), 'f': rect(30, 410, 70, 230),
        'b': rect(520, 410, 70, 230), 'e': rect(30, 90, 70, 230),
        'c': rect(520, 90, 70, 230),
    }
    patterns = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg']
    contours = [[], []] + [[segments[s] for s in pattern] for pattern in patterns] + [[rect(520, 10, 70, 70)], [rect(110, 330, 400, 70)]]
    cmap = {32: 1, **{48 + i: 2 + i for i in range(10)}, 46: 12, 45: 13}
    glyphs, offsets = b'', [0]
    for shape in contours:
        if shape:
            points = [p for contour in shape for p in contour]
            glyph = i16(len(shape), min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points))
            glyph += u16(*[4 * (i + 1) - 1 for i in range(len(shape))]) + u16(0) + b'\x01' * len(points)
            for axis in range(2):
                previous = 0
                for point in points:
                    glyph += i16(point[axis] - previous)
                    previous = point[axis]
        else:
            glyph = i16(0, 0, 0, 0, 0) + u16(0)
        glyph += b'\0' * (-len(glyph) % 4)
        glyphs += glyph
        offsets.append(len(glyphs))
    count = len(contours)
    head = u32(0x10000, 0x10000, 0, 0x5f0f3cf5) + u16(3, 1000) + b'\0' * 16 + i16(0, 0, 620, 740) + u16(0, 8) + i16(2, 1, 0)
    hhea = u32(0x10000) + i16(800, -200, 100) + u16(700) + i16(0, 0, 620, 1, 0, 0, 0, 0, 0, 0, 0) + u16(count)
    maxp = u32(0x10000) + u16(count, 28, 7, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0)
    names = {0: 'Copyright 2026 Timer Imposter contributors. MIT License.', 1: 'TimerDigits', 2: 'Regular', 3: 'TimerDigits-1.0', 4: 'TimerDigits Regular', 5: 'Version 1.0', 6: 'TimerDigits-Regular', 13: 'MIT License; see LICENSE.txt supplied with this font.'}
    records, strings = b'', b''
    for key, value in names.items():
        encoded = value.encode('utf-16-be')
        records += u16(3, 1, 0x409, key, len(encoded), len(strings))
        strings += encoded
    name = u16(0, len(names), 6 + len(records)) + records + strings
    # Format 4, one contiguous mapping segment for each supported character.
    codes = sorted(cmap) + [0xffff]
    n = len(codes)
    power = 2 ** (n.bit_length() - 1)
    subtable = u16(4, 16 + 8 * n, 0, 2 * n, 2 * power, power.bit_length() - 1, 2 * n - 2 * power)
    subtable += u16(*codes) + u16(0) + u16(*codes) + u16(*[(cmap[c] - c) & 0xffff if c != 0xffff else 1 for c in codes]) + u16(*([0] * n))
    charmap = u16(0, 1, 3, 1) + u32(12) + subtable
    os2 = bytearray(78)
    struct.pack_into('>HhHHH', os2, 0, 0, 700, 400, 5, 0)
    struct.pack_into('>I', os2, 42, 1)
    os2[58:62] = b'TIMP'
    struct.pack_into('>HHHhhhHH', os2, 62, 0x40, 32, 57, 800, -200, 100, 800, 200)
    tables = {'OS/2': bytes(os2), 'cmap': charmap, 'glyf': glyphs, 'head': head, 'hhea': hhea, 'hmtx': b''.join(u16(700, 0) for _ in contours), 'loca': u32(*offsets), 'maxp': maxp, 'name': name, 'post': u32(0x30000) + b'\0' * 28}
    total = len(tables)
    directory = u32(0x10000) + u16(total, 128, 3, total * 16 - 128)
    offset = 12 + total * 16
    body, head_offset = b'', 0
    for tag, data in sorted(tables.items()):
        directory += tag.encode('ascii') + u32(checksum(data), offset, len(data))
        if tag == 'head':
            head_offset = offset
        padded = data + b'\0' * (-len(data) % 4)
        body += padded
        offset += len(padded)
    binary = bytearray(directory + body)
    struct.pack_into('>I', binary, head_offset + 8, (0xb1b0afba - checksum(bytes(binary))) & 0xffffffff)
    destination = ROOT / 'assets/fonts'
    destination.mkdir(parents=True, exist_ok=True)
    (destination / 'TimerDigits.ttf').write_bytes(binary)

BACKGROUND = '#080B08'
ACCENT = '#8DFF3F'
# Shared vector geometry for PNG, SVG, and platform-specific icon layers.
STOPWATCH_LINES = [
    ((50, 17, 50, 27), 5),       # Crown stem
    ((42, 14, 58, 14), 6),       # Crown
    ((71, 35, 76, 30), 5),       # Side button stem
    ((73, 27, 80, 34), 5),       # Side button
    ((50, 34, 50, 39), 2.5),     # Dial marks
    ((72, 56, 67, 56), 2.5),
    ((50, 78, 50, 73), 2.5),
    ((28, 56, 33, 56), 2.5),
    ((50, 56, 62, 44), 5),       # Single stopwatch hand
]


def stopwatch(size, *, foreground=ACCENT, transparent=False, inset=1):
    from PIL import Image, ImageDraw

    scale = 4
    image = Image.new('RGBA', (size * scale, size * scale), (0, 0, 0, 0) if transparent else BACKGROUND)
    draw = ImageDraw.Draw(image)
    unit = size * scale / 100 * inset
    offset = size * scale * (1 - inset) / 2

    def point(x, y):
        return (x * unit + offset, y * unit + offset)

    def circle(x, y, radius, **options):
        draw.ellipse((*point(x - radius, y - radius), *point(x + radius, y + radius)), **options)

    # Draw the rim first; all details stay inside the central maskable safe area.
    circle(50, 56, 33.5, outline=foreground, width=round(5 * unit))
    for (x1, y1, x2, y2), width in STOPWATCH_LINES:
        draw.line((point(x1, y1), point(x2, y2)), fill=foreground, width=max(1, round(width * unit)))
        for x, y in [(x1, y1), (x2, y2)]:
            circle(x, y, width / 2, fill=foreground)
    circle(50, 56, 3.5, fill=foreground)

    image = image.resize((size, size), Image.Resampling.LANCZOS)
    return image if transparent else image.convert('RGB')


def stopwatch_svg():
    lines = '\n'.join(
        f'    <path d="M{x1} {y1}L{x2} {y2}" stroke-width="{width}" />'
        for (x1, y1, x2, y2), width in STOPWATCH_LINES
    )
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="{BACKGROUND}" />
  <g fill="none" stroke="{ACCENT}" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="50" cy="56" r="31" stroke-width="5" />
{lines}
  </g>
  <circle cx="50" cy="56" r="3.5" fill="{ACCENT}" />
</svg>
'''


def icons():
    from PIL import Image

    output = ROOT / 'public/icons'
    native = ROOT / 'assets/images'
    output.mkdir(parents=True, exist_ok=True)
    native.mkdir(parents=True, exist_ok=True)
    for filename, size in [
        ('icon-192.png', 192), ('icon-512.png', 512),
        ('maskable-192.png', 192), ('maskable-512.png', 512),
        ('apple-touch-icon.png', 180), ('favicon-16.png', 16), ('favicon-32.png', 32),
    ]:
        stopwatch(size).save(output / filename)
    (output / 'stopwatch.svg').write_text(stopwatch_svg(), encoding='utf-8')
    stopwatch(256).save(ROOT / 'public/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    stopwatch(1024).save(native / 'icon.png')
    stopwatch(32).save(native / 'favicon.png')
    stopwatch(1024, transparent=True).save(native / 'splash-icon.png')
    # Android's foreground layer needs more padding for launcher masks/motion.
    stopwatch(1024, transparent=True, inset=0.75).save(native / 'android-icon-foreground.png')
    stopwatch(1024, foreground='#FFFFFF', transparent=True, inset=0.75).save(native / 'android-icon-monochrome.png')
    Image.new('RGB', (1024, 1024), BACKGROUND).save(native / 'android-icon-background.png')

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--icons-only', action='store_true', help='Regenerate icons without changing the digit font.')
    args = parser.parse_args()
    if not args.icons_only:
        font()
    icons()
