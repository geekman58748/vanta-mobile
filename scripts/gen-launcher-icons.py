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

SIZE — the mark is a diamond, so it is fitted to the SAFE CIRCLE
----------------------------------------------------------------
The foreground was previously drawn at a flat 60% of the 108dp canvas. That is
the right number for a *square* glyph and the wrong one for this mark: the Vanta
prism is a diamond-ish shape whose extreme points sit on the DIAGONALS (the outer
corners of the left bar, and the tip of the chevron), and a launcher mask is a
circle / squircle — it eats exactly those corners. 60% put the mark's furthest
pixel 44.6dp from centre against a safe radius of 33dp, so ~1/4 of the artwork's
reach was outside the mask: the prism installed with its points cut off, and on
the splash screen (same asset, larger render) it read as a zoomed-in, off-centre
logo.

So the height is no longer hardcoded. The script measures the mark's real radial
extent and scales it until every opaque pixel fits inside Android's 66dp safe
circle — the same number the splash needs, since the splash's inner circle is
2/3 of its icon area, which is the ratio the launcher's 72dp-of-108dp visible box
already uses. One asset, correct on both surfaces, and it stays correct if the
artwork is ever redrawn.

Outputs
-------
  mipmap-*/ic_launcher_foreground.png   adaptive foreground, 108dp, mark in the safe circle
  mipmap-*/ic_launcher.webp             legacy square, violet rounded tile
  mipmap-*/ic_launcher_round.webp       legacy circle

The adaptive XML keeps pointing at @drawable/ic_launcher_background (the violet
colour) and at @mipmap/ic_launcher_foreground for BOTH foreground and
monochrome — Android 13+ tints the alpha silhouette for themed icons.

Run:  python3 scripts/gen-launcher-icons.py [path/to/master.png]
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android/app/src/main/res'
# Defaults to the app's own logo, so the launcher icon and the mark on the
# splash / connect screen can never drift apart. The 1254px desktop master can
# still be passed explicitly.
MASTER = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'src/assets/vanta-logo.png'

# Keep in step with android/app/src/main/res/values/colors.xml
TILE = (0x2A, 0x21, 0x50, 255)      # launcher_icon_background — deep violet

# Android's adaptive-icon geometry, in dp. The 108dp canvas is masked down to a
# 72dp visible square, and artwork is only guaranteed to survive inside a 66dp
# circle centred on the canvas — anything nearer the corners can be clipped by
# the launcher's mask. That is the constraint the mark has to satisfy.
CANVAS_DP = 108.0
VISIBLE_DP = 72.0
SAFE_CIRCLE_DP = 66.0

# Alpha below this counts as empty. The master has soft, anti-aliased edges and
# has been through at least one resample; counting only near-opaque pixels would
# under-measure the mark's reach and let a faint edge poke out of the mask.
ALPHA_FLOOR = 16

# Headroom on the safe circle. The reach is measured on the SOURCE mark and then
# the art is resampled to each density, whose anti-aliased edge reads a pixel or
# two wider, so a mark that exactly touches 66dp lands a hair outside it once
# drawn. 4% keeps it inside at every density without visibly shrinking it.
SAFE_MARGIN = 0.96

# How big the mark is allowed to LOOK, as its share of the 72dp visible box.
# The safe circle is a correctness limit — nothing may cross it — but it is not a
# composition: a diamond that merely touches the circle reads as cramped, because
# its points are the only thing you see reaching for the edge. Sitting the mark
# at 58% of the visible box leaves the prism visibly inside the circle (its
# furthest point lands at ~86% of the safe radius) while still reading as the
# icon rather than as an icon with a border of empty tile around it. This is the
# knob to turn for "a bit bigger" / "a bit smaller" — the safe circle stays the
# clamp, so turning it up can never reintroduce the clipping.
VISIBLE_FILL = 0.58

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


def mark_height_fraction(mark):
    """`mark height / canvas` — the composition size, clamped to the safe circle.

    Walks the mark's opaque pixels once and takes the furthest one from the
    mark's centre, expressed as a multiple of the mark's own height. For this
    artwork that lands on a corner of the left bar, which is the point a circular
    mask cuts first. Returns (fraction, drawn_dp, note) so the run log says which
    of the two limits decided it.
    """
    w, h = mark.size
    cx, cy = w / 2, h / 2
    alpha = mark.split()[-1].load()

    max_radius = 0.0
    for y in range(h):
        for x in range(w):
            if alpha[x, y] > ALPHA_FLOOR:
                r = math.hypot(x - cx, y - cy)
                if r > max_radius:
                    max_radius = r

    if max_radius == 0:
        raise SystemExit('✗ master image has no opaque pixels')

    # radius, per unit of drawn mark height
    reach = max_radius / h
    safe_dp = ((SAFE_CIRCLE_DP / 2) * SAFE_MARGIN) / reach
    composed_dp = VISIBLE_DP * VISIBLE_FILL
    drawn_dp = min(safe_dp, composed_dp)
    note = ('the safe circle' if safe_dp < composed_dp
            else f'{VISIBLE_FILL:.0%} of the visible box')
    return drawn_dp / CANVAS_DP, drawn_dp, note, reach


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
    fg_fraction, fg_dp, note, reach = mark_height_fraction(mark)
    print(f'master mark: {mark.width}x{mark.height} from {MASTER}')
    print(f'  mark drawn {fg_dp:.1f}dp tall ({fg_fraction:.3f} of the {CANVAS_DP:.0f}dp '
          f'canvas) — set by {note}')
    print(f'  furthest point {fg_dp * reach:.1f}dp from centre; safe radius is '
          f'{SAFE_CIRCLE_DP / 2:.0f}dp')

    # Legacy tiles are shown whole — no launcher mask over them — so they carry
    # the same *apparent* size as the adaptive icon instead: the mark fills the
    # same share of the 72dp visible box that the adaptive one does.
    legacy_fraction = fg_fraction * CANVAS_DP / VISIBLE_DP
    written = []

    for folder, scale in DENSITIES.items():
        d = RES / f'mipmap-{folder}'
        if not d.is_dir():
            print(f'  ⚠ {d} missing — skipped')
            continue

        # ── adaptive foreground: 108dp canvas, mark inside the safe circle ──
        fg_px = round(CANVAS_DP * scale)
        fg = Image.new('RGBA', (fg_px, fg_px), (0, 0, 0, 0))
        paste_centred(fg, mark, round(fg_px * fg_fraction))
        fg.save(d / 'ic_launcher_foreground.png', optimize=True)
        written.append(f'mipmap-{folder}/ic_launcher_foreground.png')

        # ── legacy bitmaps: violet tile + mark, masked square and circle ──
        leg_px = round(48 * scale)
        for name, circle in (('ic_launcher.webp', False), ('ic_launcher_round.webp', True)):
            tile = Image.new('RGBA', (leg_px, leg_px), TILE)
            paste_centred(tile, mark, round(leg_px * legacy_fraction))
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
