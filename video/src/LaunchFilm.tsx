import React from 'react'
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import {
  AccentGlow,
  C,
  Chroma,
  DISPLAY,
  Grain,
  HeadSwitch,
  MONO,
  SANS,
  Scanlines,
  TapeTear,
  Vignette,
  useTapeTear,
} from './vhs'

/* Scene boundaries, in frames at 30fps. */
export const SCENES = {
  hook: { from: 0, dur: 150 },
  turn: { from: 150, dur: 150 },
  demo: { from: 300, dur: 270 },
  receipt: { from: 570, dur: 210 },
  chain: { from: 780, dur: 180 },
  cta: { from: 960, dur: 120 },
} as const

export const TOTAL_FRAMES = 1080

/** Entrance for most elements: no bounce, arrives and holds. */
const enter = (frame: number, fps: number, delay = 0) =>
  spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.6 } })

/** Hard, mechanical snap — for numbers and labels that should feel like data, not UI. */
const snap = (frame: number, fps: number, delay = 0) =>
  spring({ frame: frame - delay, fps, config: { damping: 30, mass: 0.35 } })

const Label: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      fontFamily: MONO,
      fontSize: 26,
      letterSpacing: '0.34em',
      color: C.muted,
      textTransform: 'uppercase',
      ...style,
    }}
  >
    {children}
  </div>
)

/** Persistent tape damage, applied above everything in every scene. */
const TapeBase: React.FC<{ tearSeed: number }> = ({ tearSeed }) => (
  <>
    <Sequence from={0} durationInFrames={14}>
      <TapeTear seed={tearSeed} />
    </Sequence>
    <Scanlines />
    <Grain />
    <HeadSwitch />
    <Vignette />
  </>
)

const SceneShell: React.FC<{ tearSeed: number; children: React.ReactNode }> = ({ tearSeed, children }) => {
  const { x, slice } = useTapeTear(10, 20)
  return (
    <AbsoluteFill style={{ backgroundColor: C.canvas }}>
      <AbsoluteFill style={{ transform: `translateX(${x}px) translateY(${slice * 0.15}px)` }}>
        {children}
      </AbsoluteFill>
      <TapeBase tearSeed={tearSeed} />
    </AbsoluteFill>
  )
}

/* ── SCENE 1: HOOK ─────────────────────────────────────────────────────── */
const Hook: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const l1 = enter(frame, fps, 4)
  const l2 = enter(frame, fps, 16)
  const drift = interpolate(frame, [0, 150], [0, -14])

  return (
    <SceneShell tearSeed={1}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <AccentGlow size={1100} intensity={0.3 + 0.08 * Math.sin(frame / 18)}>
          <Chroma amount={5}>
            <div style={{ textAlign: 'center', transform: `translateY(${drift}px)` }}>
              <Label style={{ marginBottom: 34, opacity: l1 }}>
                Vanta · devnet
              </Label>
              <div
                style={{
                  fontFamily: DISPLAY,
                  fontSize: 122,
                  fontWeight: 700,
                  color: C.white,
                  letterSpacing: '-0.035em',
                  lineHeight: 0.98,
                  opacity: l1,
                  transform: `translateY(${(1 - l1) * 26}px)`,
                }}
              >
                EVERY WALLET
              </div>
              <div
                style={{
                  fontFamily: DISPLAY,
                  fontSize: 122,
                  fontWeight: 300,
                  color: C.white,
                  letterSpacing: '-0.035em',
                  lineHeight: 1.06,
                  opacity: l2,
                  transform: `translateY(${(1 - l2) * 26}px)`,
                }}
              >
                SAYS IT'S PRIVATE.
              </div>
            </div>
          </Chroma>
        </AccentGlow>
      </AbsoluteFill>
    </SceneShell>
  )
}

/* ── SCENE 2: TURN ─────────────────────────────────────────────────────── */
const Turn: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const a = enter(frame, fps, 6)
  const b = enter(frame, fps, 18)

  return (
    <SceneShell tearSeed={2}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Chroma amount={3}>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontFamily: DISPLAY,
                fontSize: 96,
                fontWeight: 300,
                color: C.muted,
                letterSpacing: '-0.03em',
                opacity: a,
              }}
            >
              THIS ONE TELLS YOU
            </div>
            <div
              style={{
                fontFamily: DISPLAY,
                fontSize: 128,
                fontWeight: 700,
                color: C.accent,
                letterSpacing: '-0.04em',
                opacity: b,
                transform: `scale(${0.96 + b * 0.04})`,
                textShadow: `0 0 60px ${C.accentDeep}`,
              }}
            >
              WHERE IT ISN'T.
            </div>
          </div>
        </Chroma>
      </AbsoluteFill>
    </SceneShell>
  )
}

/* ── SCENE 3: THE DEMO — real numbers from slot 505745892 ──────────────── */
const Counter: React.FC<{
  label: string
  from: number
  to: number
  delay: number
  color: string
  suffix?: string
}> = ({ label, from, to, delay, color, suffix = '' }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = interpolate(frame, [delay, delay + 42], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  })
  const value = from + (to - from) * t
  const appear = snap(frame, fps, delay)
  const landed = frame > delay + 42

  return (
    <div style={{ opacity: appear, transform: `translateY(${(1 - appear) * 18}px)`, minWidth: 400 }}>
      <Label style={{ marginBottom: 14, fontSize: 22 }}>{label}</Label>
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: 92,
          fontWeight: 700,
          letterSpacing: '-0.03em',
          color,
          lineHeight: 1,
          textShadow: landed ? `0 0 42px ${color}66` : 'none',
        }}
      >
        {value.toFixed(2)}
        <span style={{ fontSize: 40, fontWeight: 300, marginLeft: 12, color: C.muted }}>{suffix}</span>
      </div>
    </div>
  )
}

const Demo: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const head = enter(frame, fps, 0)
  const foot = enter(frame, fps, 96)

  return (
    <SceneShell tearSeed={3}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Chroma amount={2.5}>
          <div style={{ textAlign: 'center' }}>
            <Label style={{ opacity: head, marginBottom: 62, fontSize: 30 }}>Shield · 10 dUSDC</Label>
            <div style={{ display: 'flex', gap: 96, alignItems: 'flex-end', justifyContent: 'center' }}>
              <Counter label="Public" from={50} to={40} delay={18} color={C.white} suffix="dUSDC" />
              <div style={{ fontFamily: DISPLAY, fontSize: 64, color: C.muted, opacity: snap(frame, fps, 60), paddingBottom: 28 }}>
                →
              </div>
              <Counter label="Private" from={0} to={10} delay={64} color={C.accent} suffix="dUSDC" />
            </div>
            <div
              style={{
                marginTop: 74,
                opacity: foot,
                fontFamily: SANS,
                fontSize: 32,
                color: C.muted,
                letterSpacing: '-0.01em',
              }}
            >
              Pool vault 49 → <span style={{ color: C.white }}>59</span> dUSDC · one program invoked
            </div>
          </div>
        </Chroma>
      </AbsoluteFill>
    </SceneShell>
  )
}

/* ── SCENE 4: THE RECEIPT ──────────────────────────────────────────────── */
const ReceiptRow: React.FC<{ label: string; verdict: string; ok: boolean; delay: number }> = ({
  label,
  verdict,
  ok,
  delay,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = enter(frame, fps, delay)
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '19px 0',
        borderBottom: `1px solid rgba(255,255,255,0.07)`,
        opacity: s,
        transform: `translateX(${(1 - s) * 22}px)`,
      }}
    >
      <span style={{ fontFamily: SANS, fontSize: 31, color: C.white }}>{label}</span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 26,
          letterSpacing: '0.12em',
          color: ok ? C.accent : C.danger,
        }}
      >
        {verdict}
      </span>
    </div>
  )
}

const Receipt: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const title = enter(frame, fps, 0)
  const card = enter(frame, fps, 12)

  return (
    <SceneShell tearSeed={4}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 1180 }}>
          <div
            style={{
              fontFamily: DISPLAY,
              fontSize: 58,
              fontWeight: 700,
              color: C.white,
              letterSpacing: '-0.03em',
              opacity: title,
              marginBottom: 40,
              textAlign: 'center',
            }}
          >
            EVERY SEND SHIPS A <span style={{ color: C.accent }}>RECEIPT</span>
          </div>
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid rgba(255,255,255,0.09)`,
              borderRadius: 26,
              padding: '44px 56px',
              opacity: card,
              transform: `translateY(${(1 - card) * 30}px)`,
              boxShadow: `0 40px 120px rgba(0,0,0,0.6)`,
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 24, color: C.muted, letterSpacing: '0.28em', marginBottom: 8 }}>
              SHIELDED · RECEIPT
            </div>
            <ReceiptRow label="Amount" verdict="HIDDEN" ok delay={40} />
            <ReceiptRow label="Recipient" verdict="HIDDEN" ok delay={56} />
            <ReceiptRow label="Fee payer" verdict="VISIBLE" ok={false} delay={72} />
            <div style={{ marginTop: 34, fontFamily: MONO, fontSize: 24, color: C.muted }}>
              hash&nbsp;&nbsp;<span style={{ color: C.white }}>24QLsSqc…cxbRe</span>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  )
}

/* ── SCENE 5: ON-CHAIN PROOF ──────────────────────────────────────────── */
const ChainLine: React.FC<{ k: string; v: string; delay: number; accent?: boolean }> = ({
  k,
  v,
  delay,
  accent,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = snap(frame, fps, delay)
  return (
    <div style={{ display: 'flex', gap: 30, opacity: s, marginBottom: 18 }}>
      <span style={{ fontFamily: MONO, fontSize: 29, color: C.muted, width: 210, textAlign: 'right' }}>{k}</span>
      <span style={{ fontFamily: MONO, fontSize: 29, color: accent ? C.accent : C.white }}>{v}</span>
    </div>
  )
}

const Chain: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const title = enter(frame, fps, 0)

  return (
    <SceneShell tearSeed={5}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Chroma amount={2}>
          <div>
            <div
              style={{
                fontFamily: DISPLAY,
                fontSize: 46,
                fontWeight: 700,
                color: C.white,
                letterSpacing: '0.02em',
                opacity: title,
                marginBottom: 48,
                textAlign: 'center',
              }}
            >
              CONFIRMED ON DEVNET
            </div>
            <ChainLine k="program" v="sppU489D7A4U1exNo1oeMGZtLEofq3a6o2fR7UeoWB6" delay={16} />
            <ChainLine k="slot" v="505745892" delay={28} />
            <ChainLine k="err" v="None" delay={40} accent />
            <ChainLine k="sig" v="24QLsSqc…cxbRe" delay={52} />
            <div
              style={{
                marginTop: 46,
                fontFamily: MONO,
                fontSize: 25,
                color: C.muted,
                letterSpacing: '0.22em',
                opacity: enter(frame, fps, 70),
                textAlign: 'center',
              }}
            >
              THE ONLY PROGRAM THIS TRANSACTION TOUCHED
            </div>
          </div>
        </Chroma>
      </AbsoluteFill>
    </SceneShell>
  )
}

/* ── SCENE 6: CTA ─────────────────────────────────────────────────────── */
const Cta: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const mark = enter(frame, fps, 0)
  const tag = enter(frame, fps, 14)
  const url = enter(frame, fps, 30)

  return (
    <SceneShell tearSeed={6}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <AccentGlow size={1000} intensity={0.34}>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontFamily: DISPLAY,
                fontSize: 168,
                fontWeight: 700,
                color: C.white,
                letterSpacing: '-0.05em',
                opacity: mark,
                lineHeight: 1,
                textShadow: `0 0 80px ${C.accentDeep}`,
              }}
            >
              VANTA
            </div>
            <div
              style={{
                marginTop: 22,
                fontFamily: DISPLAY,
                fontSize: 44,
                fontWeight: 300,
                color: C.accent,
                letterSpacing: '-0.02em',
                opacity: tag,
              }}
            >
              Raise publicly. Spend privately.
            </div>
            <div
              style={{
                marginTop: 52,
                fontFamily: MONO,
                fontSize: 28,
                color: C.muted,
                letterSpacing: '0.2em',
                opacity: url,
              }}
            >
              vanta-mobile.xyz
            </div>
          </div>
        </AccentGlow>
      </AbsoluteFill>
    </SceneShell>
  )
}

export const LaunchFilm: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.canvas }}>
    <Sequence from={SCENES.hook.from} durationInFrames={SCENES.hook.dur}>
      <Hook />
    </Sequence>
    <Sequence from={SCENES.turn.from} durationInFrames={SCENES.turn.dur}>
      <Turn />
    </Sequence>
    <Sequence from={SCENES.demo.from} durationInFrames={SCENES.demo.dur}>
      <Demo />
    </Sequence>
    <Sequence from={SCENES.receipt.from} durationInFrames={SCENES.receipt.dur}>
      <Receipt />
    </Sequence>
    <Sequence from={SCENES.chain.from} durationInFrames={SCENES.chain.dur}>
      <Chain />
    </Sequence>
    <Sequence from={SCENES.cta.from} durationInFrames={SCENES.cta.dur}>
      <Cta />
    </Sequence>
  </AbsoluteFill>
)
