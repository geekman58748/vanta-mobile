import { Lock, Github, ArrowUpRight } from './Marks.jsx'
import { GITHUB_URL } from '../config.js'
import StoreBadge from './StoreBadge.jsx'
import Reveal from './Reveal.jsx'

const HONESTY = [
  'Devnet only — no mainnet deployment',
  'Not audited — do not use real funds',
  'Sender identity is public — see the receipt',
]

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-24">
      {/* Background: one medium only — a soft accent falloff, ≤25% alpha.
          design.md allows radial light falloff; it forbids gradient washes
          behind text, so this sits far below the copy and fades out early. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-16rem] h-[42rem] w-[52rem] -translate-x-1/2 rounded-full opacity-[0.20] blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, var(--color-accent-strong), transparent 78%)',
        }}
      />
      <div aria-hidden="true" className="rails pointer-events-none absolute inset-0 mx-auto max-w-[1280px]" />

      <div className="shell relative">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          {/* Announcement chip */}
          <Reveal>
            <span className="inline-flex h-8 items-center gap-2.5 rounded-lg border border-hairline bg-surface/60 px-3">
              <span className="pulse-dot" />
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
                Live on devnet
              </span>
            </span>
          </Reveal>

          {/* Headline — display face, tight tracking, two-tone (design.md device).
              Accent is deliberately NOT used here: it belongs to the brand mark,
              the primary action and key data only. */}
          <Reveal delay={70}>
            <h1 className="mt-7 font-display text-[clamp(2.9rem,1.5rem+4.6vw,5.25rem)] font-normal leading-[0.96] tracking-[-0.035em] text-ink-strong">
              Privacy that
              <br />
              <em className="text-ink-subtle">shows its work.</em>
            </h1>
          </Reveal>

          {/* Lede */}
          <Reveal delay={140}>
            <p className="measure mt-6 text-[17px] leading-[1.6] text-ink sm:text-[19px]">
              Vanta is a privacy wallet on Solana. Shadow-send to another Vanta and your
              amount and recipient never appear on-chain — then read the receipt that tells
              you exactly what is still public.
            </p>
          </Reveal>

          {/* Actions */}
          <Reveal delay={210}>
            <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
              <StoreBadge size="lg" />
              <a
                href="#receipt"
                className="group inline-flex h-16 items-center justify-center gap-2 rounded-xl border border-hairline px-5 text-[15px] font-medium text-ink-strong transition-colors duration-200 hover:bg-surface-2"
              >
                Read a real receipt
                <span className="text-ink-subtle transition-transform duration-200 group-hover:translate-y-0.5">
                  ↓
                </span>
              </a>
            </div>
          </Reveal>

          {/* Radical honesty strip — the differentiator starts in the hero */}
          <Reveal delay={280}>
            <ul className="mt-10 flex flex-col items-center gap-2.5 text-[12px] text-ink-subtle sm:flex-row sm:gap-6">
              {HONESTY.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Lock size={12} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={340}>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex items-center gap-2 text-[13px] text-ink-subtle transition-colors hover:text-ink-strong"
            >
              <Github size={15} />
              Read the source
              <ArrowUpRight size={12} />
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
