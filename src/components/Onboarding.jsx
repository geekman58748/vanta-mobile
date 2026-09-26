import { useState } from 'react'
import './Onboarding.css'
import { playHaptic } from '../lib/haptic'
// The real Vanta mark. White-on-transparent, so it sits on the canvas untinted.
import vantaLogo from '../assets/vanta-logo.png'

/**
 * Onboarding — the three-step first-run flow.
 *
 * Shown once, ever, and gated by localStorage in App.jsx. It appears on a
 * first install and after an uninstall/reinstall, which is the whole point:
 * it is the only surface where we get to frame Vanta before a single number
 * is on screen.
 *
 * ── What changed from the source mock ───────────────────────────────────
 * See the header of Onboarding.css for the full reasoning. In short: the
 * template was a neobank (royal blue, a FLUX VISA card, biometric claims).
 * Vanta is a privacy wallet on Helius Rings with no card and no biometric
 * unlock, so the palette, the objects and the copy are all Vanta's now. The
 * *composition* — the slide, the scanner, the floating 3D panels, the grid —
 * is the part that was already good and is kept.
 *
 * ── Copy rules ──────────────────────────────────────────────────────────
 * Same rules as the rest of the app (docs/vanta-privacy-architecture.md §7):
 * no "anonymous", no "untraceable", no "trustless". Shadow hides the amount
 * and the recipient; the sender stays visible as the fee payer. Step 1 says
 * exactly that and no more.
 */

const TOTAL = 3

/** The topographic field, same 13 beziers as the app's TopoWaves. */
function TopoField({ className = '' }) {
  return (
    <svg
      className={'ob-waves ' + className}
      viewBox="0 0 400 350"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {[
        'M50 0 C 150 40, 250 10, 400 80',
        'M30 0 C 140 50, 240 20, 400 100',
        'M10 0 C 130 60, 230 30, 400 120',
        'M0 10 C 120 70, 220 40, 400 140',
        'M0 30 C 110 80, 210 50, 400 160',
        'M0 50 C 100 90, 200 60, 400 180',
        'M0 70 C 90 100, 190 70, 400 200',
        'M0 90 C 80 110, 180 80, 400 220',
        'M0 110 C 70 120, 170 90, 400 240',
        'M0 130 C 60 130, 160 100, 400 260',
        'M0 150 C 50 140, 150 110, 400 280',
        'M0 170 C 40 150, 140 120, 400 300',
        'M0 190 C 30 160, 130 130, 400 320',
      ].map((d, i) => (
        <path
          key={d}
          d={d}
          stroke="var(--color-accent)"
          strokeOpacity={(0.16 - i * 0.008).toFixed(3)}
          strokeWidth="1.1"
        />
      ))}
    </svg>
  )
}

/** Small shield mark — the app's own glyph, not a bank logo. */
function ShieldGlyph({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.6 20 5.5v6.2c0 4.6-3.2 8.4-8 9.7-4.8-1.3-8-5.1-8-9.7V5.5l8-2.9Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M8.6 12.1l2.3 2.3 4.5-4.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * The private note — Vanta's replacement for the template's bank card.
 *
 * This is the object the whole product is about: a shielded bearer note that
 * only the holder's keys can read. It keeps the card's proportions and light
 * because those are what made it feel physical, but the content is a
 * redacted amount rather than a VISA number.
 */
function PrivateNote({ className = '', style }) {
  return (
    <div
      className={
        'ob-shimmer-wrap flex flex-col justify-between rounded-2xl border border-accent/30 p-5 ' +
        className
      }
      style={style}
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-[11px] tracking-[0.22em] text-accent">VANTA</span>
        <span className="text-accent/70">
          <ShieldGlyph size={17} />
        </span>
      </div>

      <div>
        <div className="ob-redact h-4 w-32 rounded" />
        <p className="mt-2 text-[10px] text-muted">amount not on chain</p>
      </div>

      <div className="flex items-end justify-between">
        <span className="font-mono text-[10px] text-muted">private note</span>
        <span className="text-[10px] font-medium text-accent">only you can read it</span>
      </div>
    </div>
  )
}

export default function Onboarding({ onDone, initialStep = 0 }) {
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 0), TOTAL - 1))
  const [dir, setDir] = useState('fwd')

  const go = (next) => {
    if (next === step || next < 0 || next >= TOTAL) return
    setDir(next > step ? 'fwd' : 'back')
    setStep(next)
  }

  const finish = () => {
    playHaptic('pop')
    onDone()
  }

  const advance = () => {
    if (step < TOTAL - 1) {
      playHaptic('tap')
      go(step + 1)
    } else {
      finish()
    }
  }

  const onLast = step === TOTAL - 1

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[440px] flex-col overflow-hidden bg-canvas px-6 pb-28 pt-10">
      {/* Ambient field, behind everything */}
      <div className="ob-glow pointer-events-none absolute inset-0 z-0" />
      <TopoField className="pointer-events-none absolute -right-6 -top-6 z-0 h-[360px] w-full" />

      {/* ── STEP 1 — what Shadow actually hides ───────────────────────── */}
      {step === 0 && (
        <div key="s0" className={'ob-step-' + dir + ' relative z-10 flex flex-1 flex-col justify-between'}>
          <div className="ob-grid pointer-events-none absolute inset-0 opacity-60" />

          <header className="relative z-10 pt-2 text-center">
            {/* Brand mark leads the cascade — step 1 is the one screen that has to
                say who this is before it says what it does. Steps 2 and 3 skip it:
                the private note already carries the VANTA wordmark. */}
            <img
              src={vantaLogo}
              alt="Vanta"
              className="ob-anim mx-auto mb-7 h-14 w-14 object-contain"
              style={{ '--i': 0 }}
            />
            <p className="ob-anim text-sm font-semibold tracking-wide text-accent" style={{ '--i': 1 }}>
              Private by default
            </p>
            <h1
              className="ob-anim mt-3 text-[34px] font-extrabold leading-[1.14] tracking-tight text-white"
              style={{ '--i': 2 }}
            >
              Hidden amounts.
              <br />
              Hidden recipients.
            </h1>
            <p className="ob-anim mx-auto mt-4 max-w-[19rem] text-sm font-medium leading-relaxed text-muted" style={{ '--i': 3 }}>
              Shield a payment and it becomes a note that only your keys can read.
            </p>
          </header>

          <div className="relative z-10 my-6 flex flex-1 items-center justify-center">
            <div className="relative flex h-80 w-80 items-center justify-center">
              {/* Crosshair, kept from the template */}
              <div className="absolute h-px w-full bg-white/10" />
              <div className="absolute h-full w-px bg-white/10" />
              <div className="absolute h-64 w-64 rounded-2xl border border-white/5" />
              <div className="absolute bottom-10 h-10 w-48 rounded-full bg-accent-deep/40 blur-3xl" />

              <PrivateNote
                className="ob-anim ob-note-front h-[164px] w-[268px]"
                style={{
                  '--i': 4,
                  background: 'linear-gradient(140deg, #2b2447 0%, #1a1630 46%, #121016 100%)',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2 — no account, keys stay here ───────────────────────── */}
      {step === 1 && (
        <div key="s1" className={'ob-step-' + dir + ' relative z-10 flex flex-1 flex-col'}>
          {/* Portrait + scanner. The portrait is the template's; the claim
              under it is Vanta's. We do NOT say "biometrics" — this wallet
              has no biometric unlock, and claiming one would be the exact
              kind of overclaim this product exists to avoid. */}
          <div className="ob-anim relative h-[52vh] w-full overflow-hidden rounded-b-3xl" style={{ '--i': 0 }}>
            <img
              src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=1000"
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover object-center brightness-[0.72] contrast-[1.18]"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-canvas/50 via-accent-deep/25 to-canvas" />

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative flex h-56 w-44 flex-col justify-between rounded-3xl border border-accent/35 p-2">
                <div className="h-4 w-4 border-l-2 border-t-2 border-accent" />
                <div className="-mt-4 h-4 w-4 self-end border-r-2 border-t-2 border-accent" />
                <div className="h-4 w-4 border-b-2 border-l-2 border-accent" />
                <div className="-mt-4 h-4 w-4 self-end border-b-2 border-r-2 border-accent" />
                <div className="ob-scanner absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent shadow-[0_0_12px_var(--color-accent)]" />
              </div>
            </div>
          </div>

          <div className="relative z-10 -mt-6 flex flex-1 flex-col justify-center text-center">
            <p className="ob-anim text-sm font-semibold tracking-wide text-accent" style={{ '--i': 1 }}>
              No sign-up
            </p>
            <h1 className="ob-anim mt-2 text-[34px] font-extrabold leading-[1.12] tracking-tight text-white" style={{ '--i': 2 }}>
              You are
              <br />
              the account.
            </h1>
            <p className="ob-anim mx-auto mt-4 max-w-[19rem] text-sm font-medium leading-relaxed text-muted" style={{ '--i': 3 }}>
              No email, no phone, no server holding your keys. This device is the whole wallet.
            </p>
          </div>
        </div>
      )}

      {/* ── STEP 3 — what to do next ──────────────────────────────────── */}
      {step === 2 && (
        <div key="s2" className={'ob-step-' + dir + ' relative z-10 flex flex-1 flex-col justify-between'}>
          <header className="relative z-10 pt-2 text-center">
            <p className="ob-anim text-sm font-semibold tracking-wide text-accent" style={{ '--i': 0 }}>
              You are set
            </p>
            <h1 className="ob-anim mt-3 text-[30px] font-extrabold leading-[1.16] tracking-tight text-white" style={{ '--i': 1 }}>
              Fund it, then send
              <br />
              what nobody can read
            </h1>
            <p className="ob-anim mx-auto mt-4 max-w-[19rem] text-sm font-medium leading-relaxed text-muted" style={{ '--i': 2 }}>
              Add a little SOL to cover fees, shield it, then send privately. Nothing to configure.
            </p>
          </header>

          {/* Same 3D composition as the template — two floating panels at the
              same angles — but they are notes now, not credit cards. */}
          <div className="ob-perspective relative z-10 my-4 flex flex-1 items-center justify-center">
            <div className="absolute bottom-8 h-12 w-52 rounded-full bg-accent-deep/45 blur-3xl" />

            {/* Hand graphic, kept: it is what sells "these objects are held" */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-70">
              <svg
                width="250"
                height="250"
                viewBox="0 0 200 200"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="filter drop-shadow-[0_0_14px_rgba(139,121,240,0.55)]"
                aria-hidden="true"
              >
                <path
                  d="M60 140 C 60 120, 75 110, 85 125 C 95 105, 115 100, 125 120 C 135 105, 150 115, 145 135 C 155 130, 165 140, 155 155 C 140 180, 100 190, 70 170 Z"
                  stroke="var(--color-accent)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="rgba(139,121,240,0.05)"
                />
                <path d="M75 125 L 75 95 C 75 85, 90 85, 90 95 L 90 120" stroke="var(--color-accent)" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M100 110 L 100 80 C 100 70, 115 70, 115 80 L 115 115" stroke="var(--color-accent)" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </div>

            {/* The note you have not spent yet — dark, dormant. */}
            <div
              className="ob-anim ob-note-back absolute flex h-[132px] w-[204px] flex-col justify-between rounded-xl border border-hair p-4"
              style={{ '--i': 3, background: 'linear-gradient(150deg, #17171b 0%, #101014 55%, #0b0b0e 100%)' }}
            >
              <div className="flex items-start justify-between">
                <span className="font-mono text-[10px] tracking-[0.18em] text-white/40">UNSPENT</span>
                <span className="h-4 w-6 rounded border border-white/15" />
              </div>
              <div>
                <div className="ob-redact h-3 w-20 rounded" />
                <p className="mt-1.5 text-[9px] text-muted">waiting</p>
              </div>
            </div>

            <PrivateNote
              className="ob-anim ob-note-front absolute h-[140px] w-[216px]"
              style={{
                '--i': 4,
                background: 'linear-gradient(140deg, #322a52 0%, #1d1836 48%, #131018 100%)',
              }}
            />
          </div>
        </div>
      )}

      {/* ── Fixed bottom bar ──────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-50 mx-auto flex h-28 w-full max-w-[440px] items-center justify-between px-8">
        <div className="flex items-center gap-2.5">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <button
              key={i}
              onClick={() => { playHaptic('tap'); go(i) }}
              aria-label={'Go to step ' + (i + 1)}
              aria-current={i === step}
              className={
                'rounded-full transition-all duration-300 ' +
                (i === step ? 'h-2 w-7 bg-accent' : 'h-2 w-2 bg-white/25 hover:bg-white/50')
              }
            />
          ))}
        </div>

        <button
          onClick={advance}
          aria-label={onLast ? 'Finish' : 'Next'}
          className="group flex h-14 w-14 items-center justify-center rounded-full bg-accent text-black shadow-[0_10px_28px_rgba(139,121,240,0.35)] transition-all duration-200 hover:bg-accent-hi active:scale-95"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 transition-transform duration-200 group-hover:translate-x-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <button
          onClick={finish}
          className="text-sm font-medium text-muted transition-colors hover:text-white"
        >
          {onLast ? 'Done' : 'Skip'}
        </button>
      </div>
    </div>
  )
}
