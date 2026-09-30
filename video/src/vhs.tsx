import React from 'react'
import { AbsoluteFill, interpolate, random, useCurrentFrame } from 'remotion'

/**
 * Vanta's palette, copied from the app's design tokens (`src/index.css`) rather than
 * re-invented. The video has to look like the product, or it reads as stock footage with
 * a logo stapled on.
 */
export const C = {
  canvas: '#0a0a0c',
  ink: '#060608',
  card: '#141417',
  cardHi: '#1b1b1f',
  rail: '#17171a',
  accent: '#8b79f0',
  accentDeep: '#4c3a9e',
  danger: '#ec6a7a',
  muted: '#8e8e93',
  white: '#ffffff',
} as const

export const DISPLAY = "'Space Grotesk', 'Inter', ui-sans-serif, system-ui, sans-serif"
export const MONO = "'Space Mono', SFMono-Regular, ui-monospace, monospace"
export const SANS = "'Inter', system-ui, sans-serif"

/* ── EFFECT FAMILY: ANALOG TAPE ────────────────────────────────────────
   One family, applied consistently, on every frame. The video-craft rule is a maximum of
   one or two effect families — mixing scanlines with glossy 3D and soft bloom is what
   makes generated video look generated. Everything here is the same physical story: a
   signal being played back off a worn tape. */

/** Horizontal scanlines. Faintly drifting so it never reads as a static PNG overlay. */
export const Scanlines: React.FC<{ opacity?: number }> = ({ opacity = 0.22 }) => {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill
      style={{
        backgroundImage:
          'repeating-linear-gradient(to bottom, rgba(0,0,0,0.65) 0px, rgba(0,0,0,0.65) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 3px)',
        backgroundPositionY: (frame * 1.7) % 3,
        opacity,
        mixBlendMode: 'multiply',
        pointerEvents: 'none',
      }}
    />
  )
}

/**
 * Film grain via feTurbulence. `seed` is keyed to the frame so the noise field actually
 * changes — a frozen grain plate is the single most obvious tell of a coded video.
 */
export const Grain: React.FC<{ opacity?: number; id?: string }> = ({ opacity = 0.13, id = 'grain' }) => {
  const frame = useCurrentFrame()
  const filterId = `vanta-${id}`
  return (
    <AbsoluteFill style={{ opacity, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
      <svg width="100%" height="100%">
        <filter id={filterId}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed={frame % 97} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${filterId})`} />
      </svg>
    </AbsoluteFill>
  )
}

/**
 * True RGB channel split — the red and blue channels are offset horizontally and screened
 * back together. This is the chromatic aberration the tape actually has, and it is what
 * makes text feel like it is being pulled off a CRT instead of rendered in a browser.
 *
 * NOTE: this also centers its children. It renders an `AbsoluteFill`, and an AbsoluteFill
 * `inset:0` child is immune to a parent's `justifyContent`, so wrapping content in this
 * without centering here silently pins every scene to the top of the frame.
 */
export const Chroma: React.FC<{ amount?: number; children: React.ReactNode }> = ({ amount = 4, children }) => (
  <AbsoluteFill>
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <filter id="vanta-chroma" x="-5%" y="-5%" width="110%" height="110%">
        <feOffset in="SourceGraphic" dx={amount} dy={0} result="rOff" />
        <feColorMatrix
          in="rOff"
          type="matrix"
          values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
          result="rOnly"
        />
        <feOffset in="SourceGraphic" dx={-amount} dy={0} result="bOff" />
        <feColorMatrix
          in="bOff"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
          result="bOnly"
        />
        <feColorMatrix
          in="SourceGraphic"
          type="matrix"
          values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
          result="gOnly"
        />
        <feBlend in="rOnly" in2="gOnly" mode="screen" result="rg" />
        <feBlend in="rg" in2="bOnly" mode="screen" />
      </filter>
    </svg>
    <AbsoluteFill
      style={{
        filter: 'url(#vanta-chroma)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </AbsoluteFill>
  </AbsoluteFill>
)

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.85 }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 38%, rgba(0,0,0,${strength}) 100%)`,
      pointerEvents: 'none',
    }}
  />
)

/**
 * The tape-tear that covers a cut. Sweeps a bright band with torn noise down the frame
 * and shoves the whole picture sideways for a couple of frames.
 *
 * Place inside a <Sequence> that starts on the cut. Returns ONLY the overlay + a jitter
 * amount is exposed separately via `useTapeTear`, because a component cannot transform
 * its siblings.
 */
export const TapeTear: React.FC<{ seed?: number }> = ({ seed = 1 }) => {
  const frame = useCurrentFrame()
  const p = interpolate(frame, [0, 11], [0, 1], { extrapolateRight: 'clamp' })
  const y = interpolate(p, [0, 1], [-160, 1240])
  const opacity = interpolate(frame, [0, 1.5, 8, 11], [0, 0.95, 0.45, 0], { extrapolateRight: 'clamp' })
  const bandOpacity = interpolate(frame, [0, 1, 6, 11], [0, 0.85, 0.35, 0], { extrapolateRight: 'clamp' })
  const noiseSeed = Math.floor(random(`tear-${seed}-${frame}`) * 100)

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: y, left: 0, right: 0, height: 170, opacity }}>
        <svg width="100%" height="100%">
          <filter id={`tear-${seed}`}>
            <feTurbulence type="turbulence" baseFrequency="0.02 1.4" numOctaves="2" seed={noiseSeed} />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#tear-${seed})`} />
        </svg>
      </div>
      <div
        style={{
          position: 'absolute',
          top: y + 60,
          left: 0,
          right: 0,
          height: 3,
          background: C.white,
          opacity: bandOpacity,
          boxShadow: `0 0 24px 6px rgba(255,255,255,0.5)`,
        }}
      />
    </AbsoluteFill>
  )
}

/**
 * The persistent head-switching artifact along the bottom edge of a real VHS capture.
 * Small detail, disproportionately convincing.
 */
export const HeadSwitch: React.FC = () => {
  const frame = useCurrentFrame()
  const seed = Math.floor(random(`head-${frame}`) * 100)
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 16, opacity: 0.5 }}>
        <svg width="100%" height="100%">
          <filter id="vanta-head">
            <feTurbulence type="turbulence" baseFrequency="0.05 1.8" numOctaves="2" seed={seed} />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#vanta-head)" />
        </svg>
      </div>
    </AbsoluteFill>
  )
}

/**
 * Per-frame horizontal shove, decaying over the first `burst` frames of a scene.
 * This is what sells a cut as a *tape* cut rather than a crossfade.
 */
export const useTapeTear = (burst = 10, magnitude = 22) => {
  const frame = useCurrentFrame()
  const decay = interpolate(frame, [0, burst], [1, 0], { extrapolateRight: 'clamp' })
  const jitter = (random(`jit-${frame}`) - 0.5) * 2 * magnitude * decay
  const slice = (random(`slc-${frame}`) - 0.5) * 14 * decay
  return { x: jitter, slice, decay }
}

/** Amethyst bloom behind a focal element. The "one purple lamp in a dark room" from the app. */
export const AccentGlow: React.FC<{ size?: number; intensity?: number; children: React.ReactNode }> = ({
  size = 900,
  intensity = 0.4,
  children,
}) => (
  <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
    <div
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${C.accentDeep} 0%, rgba(76,58,158,0) 68%)`,
        opacity: intensity,
        filter: 'blur(40px)',
      }}
    />
    {children}
  </AbsoluteFill>
)
