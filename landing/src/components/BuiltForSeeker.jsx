import { MobileMark, VaultMark, Android } from './Marks.jsx'
import Reveal from './Reveal.jsx'

/**
 * "Built for Seeker" — the platform section.
 *
 * Why this exists. The page named Helius, zolana and Solana — the privacy stack —
 * and never once named the Mobile Wallet Adapter, Solana Mobile or Seeker, which
 * is the platform the app is actually built for and the community the submission
 * is judged against. Helius is already credited in InfraStrip (it is the first
 * tile); this is the other half of the same sentence, and it was simply missing.
 *
 * Placement is deliberate. It sits directly after InfraStrip because InfraStrip
 * answers "what does it run on" and this answers "what does it run on" for the
 * half that is a phone. It keeps the canvas background while InfraStrip carries
 * `bg-surface/40`, so the two read as one passage rather than as two competing
 * bands, and it only draws a bottom border — InfraStrip's `border-y` already
 * supplies the top one.
 *
 * Every cell is a fact, not a slogan, and the closing note states the limit
 * rather than letting three reassuring tiles imply more than they should. The
 * exception clause is the same disclosure the README carries: hardware custody
 * arrives through MWA on a Seeker, and the throwaway fallback wallet does not
 * get it.
 */
const PLATFORM = [
  {
    name: 'Mobile Wallet Adapter',
    role: 'The wallet signs',
    detail:
      'The key never enters Vanta. Your wallet app signs on the device and hands back a signature.',
    Mark: MobileMark,
  },
  {
    name: 'Seed Vault',
    role: 'Hardware custody',
    detail:
      'On a Seeker, connect Seed Vault Wallet and the signing key lives in the vault — not in our storage.',
    Mark: VaultMark,
  },
  {
    name: 'Solana dApp Store',
    role: 'Distribution',
    detail:
      'A native Android APK, published to the Seeker store rather than served from a browser.',
    Mark: Android,
  },
]

export default function BuiltForSeeker() {
  return (
    <section className="relative border-b border-hairline">
      <div className="shell py-14 sm:py-16">
        <Reveal>
          <p className="text-center font-mono text-[11px] uppercase tracking-[0.16em] text-ink-subtle">
            Built for Seeker
          </p>
        </Reveal>

        {/* Same hairline structure as InfraStrip — 1px gaps over a hairline
            background, cells filled with canvas. One column on mobile rather than
            two: unlike InfraStrip's name+role tiles these carry a full sentence,
            so at 2-up the copy sets to three or four ragged lines and the grid
            stops reading as a grid. */}
        <Reveal delay={80}>
          <ul className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-hairline sm:grid-cols-3">
            {PLATFORM.map(({ name, role, detail, Mark }) => (
              <li
                key={name}
                className="flex flex-col gap-2.5 bg-canvas px-6 py-7 transition-colors duration-200 hover:bg-surface-2"
              >
                <span className="flex items-center gap-2.5 text-ink-subtle">
                  <Mark size={20} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em]">{role}</span>
                </span>
                <span className="text-[14px] font-medium tracking-[-0.01em] text-ink-strong">
                  {name}
                </span>
                <span className="text-[12.5px] leading-relaxed text-ink-subtle">{detail}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={140}>
          <p className="measure mx-auto mt-8 text-center text-[13px] leading-relaxed text-ink-subtle">
            Hardware custody on a Seeker arrives through the Mobile Wallet Adapter — we wrote no Seed
            Vault code, because that SDK belongs to wallet apps and a dApp is meant to come through
            MWA.{' '}
            <span className="text-ink">The throwaway in-app wallet is the exception:</span> its key
            sits in the WebView's local storage, and the repository says so in plain words.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
