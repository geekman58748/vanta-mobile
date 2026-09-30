import React, { useEffect } from 'react'
import {
  AbsoluteFill,
  Composition,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion'
import { C, Chroma, DISPLAY, Grain, HeadSwitch, MONO, Scanlines, Vignette } from './vhs'
import { LaunchFilm, TOTAL_FRAMES } from './LaunchFilm'

/**
 * Self-hosted brand faces, same files the app ships (`src/assets/fonts/`). Copying them
 * instead of calling @remotion/google-fonts keeps the render offline and deterministic —
 * and it means the video cannot silently render in Arial because a font CDN was slow.
 */
const FontFaces: React.FC = () => (
  <style>{`
    @font-face{font-family:'Space Grotesk';font-style:normal;font-weight:300 700;font-display:block;src:url('${staticFile(
      'fonts/space-grotesk-var.woff2',
    )}') format('woff2')}
    @font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:block;src:url('${staticFile(
      'fonts/inter-var.woff2',
    )}') format('woff2')}
    @font-face{font-family:'Space Mono';font-style:normal;font-weight:400;font-display:block;src:url('${staticFile(
      'fonts/space-mono-400.woff2',
    )}') format('woff2')}
    @font-face{font-family:'Space Mono';font-style:normal;font-weight:700;font-display:block;src:url('${staticFile(
      'fonts/space-mono-700.woff2',
    )}') format('woff2')}
  `}</style>
)

/** 1:1 end card. Same effect family, one focal point, safe in every aspect ratio. */
const LoopCard: React.FC = () => {
  const frame = useCurrentFrame()
  const pulse = 0.28 + 0.07 * Math.sin(frame / 14)

  return (
    <AbsoluteFill style={{ backgroundColor: C.canvas }}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            position: 'absolute',
            width: 820,
            height: 820,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${C.accentDeep} 0%, rgba(76,58,158,0) 70%)`,
            opacity: pulse,
            filter: 'blur(36px)',
          }}
        />
        <Chroma amount={4}>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontFamily: DISPLAY,
                fontSize: 170,
                fontWeight: 700,
                color: C.white,
                letterSpacing: '-0.05em',
                lineHeight: 1,
              }}
            >
              VANTA
            </div>
            <div
              style={{
                marginTop: 26,
                fontFamily: DISPLAY,
                fontSize: 40,
                fontWeight: 300,
                color: C.accent,
                letterSpacing: '-0.02em',
                opacity: interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' }),
              }}
            >
              Raise publicly. Spend privately.
            </div>
            <div
              style={{
                marginTop: 44,
                fontFamily: MONO,
                fontSize: 26,
                color: C.muted,
                letterSpacing: '0.2em',
              }}
            >
              vanta-mobile.xyz
            </div>
          </div>
        </Chroma>
      </AbsoluteFill>
      <Scanlines opacity={0.18} />
      <Grain opacity={0.11} id="grain-loop" />
      <HeadSwitch />
      <Vignette strength={0.8} />
    </AbsoluteFill>
  )
}

export const RemotionRoot: React.FC = () => {
  // Wait for the four faces before the first frame is captured. Without this the render
  // can capture frame 0 in a fallback font and the whole clip inherits the wrong typography.
  useEffect(() => {
    const handle = delayRender('Loading Vanta brand fonts')
    Promise.all([
      document.fonts.load('300 100px "Space Grotesk"'),
      document.fonts.load('700 100px "Space Grotesk"'),
      document.fonts.load('400 100px "Inter"'),
      document.fonts.load('900 100px "Inter"'),
      document.fonts.load('400 100px "Space Mono"'),
      document.fonts.load('700 100px "Space Mono"'),
    ])
      .then(() => continueRender(handle))
      .catch(() => continueRender(handle))
  }, [])

  return (
    <>
      <FontFaces />
      <Composition
        id="LaunchFilm"
        component={LaunchFilm}
        durationInFrames={TOTAL_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="LaunchLoop"
        component={LoopCard}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1080}
      />
    </>
  )
}
