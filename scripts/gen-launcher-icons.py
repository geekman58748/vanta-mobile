#!/usr/bin/env python3
"""
gen-launcher-icons.py — build the Android launcher icon set from the master mark.

WHY THIS EXISTS
---------------
The webshell template shipped the stock **Android robot** as the adaptive-icon
foreground (`drawable/ic_launcher_foreground.xml`) and the template's WebP
bitmaps in every `mipmap-*dpi` folder. Someone had already fixed the *colours*
(`launcher_icon_background` = #2A2150 violet, `splash_background` = #060509) but
not the artwork, so the app still installed showing the robot — the single most
visible thing on a judge's home screen.

The master mark is pure monochrome white on transparency, so it needs no tinting
and works on the violet tile as-is.

Outputs
-------
  mipmap-*/ic_launcher_foreground.png   adaptive foreground, 108dp, mark in the safe zone
  mipmap-*/ic_launcher.webp             legacy square, violet rounded tile
  mipmap-*/ic_launcher_round.webp       legacy circle

The adaptive XML keeps pointing at @drawable/ic_launcher_background (the violet
colour) and now at @mipmap/ic_launcher_foreground for BOTH foreground and
monochrome — Android 13+ tints the alpha silhouette for themed icons.

Run:  python3 scripts/gen-launcher-icons.py [/path/to/master.png]
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android/app/src/main/res'
MASTER = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
    '/Users/mac/Desktop/vantalogo.png'
)

# Keep in step with android/app/src/main/res/values/colors.xml
TILE = (0x2A, 0x21, 0x50, 255)      # launcher_icon_background — deep violet

# Android's adaptive-icon safe zone: the outer 18dp of the 108dp canvas on each
# side can be masked away, so all artwork must live inside the inner 72dp — and
# in practice inside ~66dp to survive aggressive masks.
# 0.60 of the 108dp canvas = ~65dp of visible mark, which sits comfortably inside
# the 72dp safe zone while still reading at launcher size. The mark is a sparse
# thin-line design, so it needs more room than a solid glyph would before it
# starts looking small on a home screen.
FOREGROUND_FRACTION = 0.60

DENSITIES = {          # folder -> scale factor vs mdpi
    'mdpi': 1,
    'hdpi': 1.5,
    'xhdpi': 2,
    'xxhdpi': 3,
    'xxxhdpi': 4,
}


def load_mark():
    """The master, cropped to its visible bounds (it is mostly empty padding)."""
    im = Image.open(MASTER).convert('RGBA')
    bbox = im.getbbox()
    if bbox is None:
        raise SystemExit('✗ master image has no visible pixels')
    return im.crop(bbox)


def paste_centred(canvas, mark, target_h):
    """Scale the mark to `target_h` tall and centre it on `canvas`."""
    ratio = mark.width / mark.height
    size = (max(1, round(target_h * ratio)), round(target_h))
    resized = mark.resize(size, Image.LANCZOS)
    canvas.paste(
        resized,
        ((canvas.width - resized.width) // 2, (canvas.height - resized.height) // 2),
        resized,
    )
    return canvas


def rounded_mask(size, radius, circle=False):
    m = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(m)
    if circle:
        d.ellipse((0, 0, size - 1, size - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return m


def main():
    mark = load_mark()
    print(f'master mark: {mark.width}x{mark.height} from {MASTER}')
    written = []

    for folder, scale in DENSITIES.items():
        d = RES / f'mipmap-{folder}'
        if not d.is_dir():
            print(f'  ⚠ {d} missing — skipped')
            continue

        # ── adaptive foreground: 108dp canvas, mark inside the safe zone ──
        fg_px = round(108 * scale)
        fg = Image.new('RGBA', (fg_px, fg_px), (0, 0, 0, 0))
        paste_centred(fg, mark, round(fg_px * FOREGROUND_FRACTION))
        fg.save(d / 'ic_launcher_foreground.png', optimize=True)
        written.append(f'mipmap-{folder}/ic_launcher_foreground.png')

        # ── legacy bitmaps: violet tile + mark, masked square and circle ──
        leg_px = round(48 * scale)
        # The mark reads a touch small on a legacy tile; legacy icons are shown
        # whole (no mask), so it can sit closer to the edges than the adaptive one.
        for name, circle in (('ic_launcher.webp', False), ('ic_launcher_round.webp', True)):
            tile = Image.new('RGBA', (leg_px, leg_px), TILE)
            paste_centred(tile, mark, round(leg_px * 0.62))
            tile.putalpha(rounded_mask(leg_px, round(leg_px * 0.22), circle))
            tile.save(d / name, format='WEBP', lossless=True, quality=100)
            written.append(f'mipmap-{folder}/{name}')

    for w in written:
        print('  ✓', w)
    print(f'\n{len(written)} files written.')
    print('\nNOTE: drawable/ic_launcher_foreground.xml (the Android robot vector) and')
    print('mipmap-anydpi/ic_launcher*.xml must point at @mipmap/ic_launcher_foreground.')


if __name__ == '__main__':
    main()
