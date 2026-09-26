#!/usr/bin/env python3
"""
Pixel-probe rasterised receipts.

A PDF can be perfectly valid and still render nothing. This asserts the four
things that would otherwise be taken on faith:

  1. canvas is dark      -> the background rectangle actually painted
  2. text present        -> near-white glyph pixels exist
  3. accent present      -> the amethyst masthead bar / accent type painted
  4. waves present       -> TopoWaves strokes painted in the band they target

Usage:  python3 scripts/pdf-receipt-analyze.py /tmp/vanta-receipt-check/*.png
Exit:   non-zero if any probe fails.
"""

import sys
from PIL import Image

# WAVE = [0.17, 0.15, 0.28] -> (43, 38, 71). A thin 0.7pt stroke antialiases, so
# probe a band around it rather than an exact match. Keyed on blue dominating,
# which neither the dark canvas nor white type satisfies.
def is_wave(r, g, b):
    return 45 <= b <= 130 and b >= r + 14 and r < 85 and g < 75


def is_accent(r, g, b):
    # #8b79f0 = (139, 121, 240)
    return 110 <= r <= 175 and 95 <= g <= 155 and b >= 205


def is_ink(r, g, b):
    return r < 24 and g < 24 and b < 30


def analyze(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()

    ink = white = accent = wave = 0
    # Wave field is anchored at the top of the page and sweeps downward
    # (pdf-lib negates SVG Y), so it lives in roughly the upper half.
    band_top, band_bot = int(h * 0.04), int(h * 0.52)
    wave_in_band = 0

    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if is_ink(r, g, b):
                ink += 1
            if r > 200 and g > 200 and b > 200:
                white += 1
            if is_accent(r, g, b):
                accent += 1
            if is_wave(r, g, b):
                wave += 1
                if band_top <= y <= band_bot:
                    wave_in_band += 1

    total = w * h
    results = [
        ("canvas dark", ink / total > 0.55, f"{ink/total:.1%} ink px"),
        ("text present", white > 300, f"{white} white px"),
        ("accent present", accent > 300, f"{accent} accent px"),
        ("waves present", wave > 400, f"{wave} wave px"),
        ("waves in band", wave_in_band > 300, f"{wave_in_band} in upper band"),
    ]
    return w, h, results


def main():
    if len(sys.argv) < 2:
        print("usage: pdf-receipt-analyze.py <png>...")
        return 2

    failed = 0
    for path in sys.argv[1:]:
        w, h, results = analyze(path)
        name = path.rsplit("/", 1)[-1]
        print(f"\n{name}  {w}x{h}")
        for label, ok, detail in results:
            print(f"  [{'PASS' if ok else 'FAIL'}] {label:<16} {detail}")
            if not ok:
                failed += 1

    print(f"\n{len(sys.argv) - 1} file(s), {failed} failed probe(s)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
