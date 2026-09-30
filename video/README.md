# Vanta — video

The launch film and demo cut for Vanta, rendered **from code**. No After Effects, no CapCut,
no subscription, and no binary project file that only one machine can open.

## Why it is built this way

A video tool that a coding agent cannot drive is a bottleneck. Remotion renders real MP4s
through headless Chrome, so the video is a **React component**: it is diffable, reviewable,
re-renderable, and it reuses the product's own design tokens instead of approximating them.

The typography and palette are copied from the app (`src/index.css`), and the fonts are the
same `woff2` files the app ships. That is why the film looks like the product rather than
like stock footage with a logo on it.

## Commands

```bash
cd video
npm install                 # first time only

npm run studio              # live preview in the browser — edit and scrub
npm run render:launch       # out/launch-film.mp4  16:9  36s
npm run render:loop         # out/launch-loop.mp4  1:1    5s
npm run render:all
```

First render downloads Chrome Headless Shell (~94 MB) once.

## Compositions

| ID | Size | Length | Use |
|---|---|---|---|
| `LaunchFilm` | 1920×1080 | 36s | Pinned post, landing page, submission intro |
| `LaunchLoop` | 1080×1080 | 5s | Reply clip, avatar video, loop-friendly |

## The film, scene by scene

Every number on screen comes from the verified devnet shield — signature `24QLsSqc…cxbRe`,
slot `505745892`. Nothing here is illustrative.

| Frames | Scene | Focal point |
|---|---|---|
| 0–150 | **Hook** | "Every wallet says it's private." |
| 150–300 | **Turn** | "This one tells you where it isn't." |
| 300–570 | **Demo** | Public 50 → 40 · Private 0 → 10 · vault 49 → 59 dUSDC |
| 570–780 | **Receipt** | amount hidden ✓ · recipient hidden ✓ · fee payer visible ⚠ |
| 780–960 | **Chain** | `sppU489…`, slot, `err: None` — the only program invoked |
| 960–1080 | **CTA** | Vanta · Raise publicly. Spend privately. · vanta-mobile.xyz |

## Visual system

One effect family, applied consistently: **analog tape**. Mixing effect families is the
fastest way to make generated video look generated.

| Primitive | File | What it does |
|---|---|---|
| `Chroma` | `src/vhs.tsx` | True RGB channel split via `feOffset` + `feBlend screen` — the aberration a tape actually has |
| `TapeTear` | `src/vhs.tsx` | Head-switching noise band that sweeps the frame on every cut |
| `Grain` | `src/vhs.tsx` | `feTurbulence` re-seeded per frame so the noise field really moves |
| `Scanlines` | `src/vhs.tsx` | Drifting scanlines, faint |
| `HeadSwitch` | `src/vhs.tsx` | The torn bottom strip of a real VHS capture |
| `AccentGlow` | `src/vhs.tsx` | The app's "one purple lamp in a dark room" |

> **Landmine, already fixed once:** `Chroma` renders an `AbsoluteFill`, and an `inset: 0`
> child ignores a parent's `justifyContent`. It therefore centers its own children — wrapping
> content in it *without* that centering pins the whole scene to the top of the frame.

## Adding sound

There is no audio track yet — no licensed music or SFX assets are in the repo, and an
unlicensed track is a worse outcome than silence. To add SFX, `@remotion/sfx` is the
zero-asset option (`whoosh`, `whip`, `ding`, `shutter`) and it is the fastest way to make
the tape cuts land.

## Not built yet

- **9:16 vertical cut.** The 16:9 scenes assume a wide stage; a real vertical version needs
  its own stacked layouts rather than a scaled-down landscape frame.
- **Captions (.srt).** Required for muted autoplay reach — the film is written to be
  legible with sound off, but a caption file is still a deliverable.
- **Real device footage.** The demo currently shows data, not the phone. Recording the
  emulator needs a `-PWEB_SHELL_FLAG_SECURE=false` release build
  (`docs/pitch-deck.md` appendix B) and would raise the credibility of scene 3 considerably.
