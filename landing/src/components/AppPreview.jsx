import { Shield, Shadow, Ghost, SolanaMark, Lock } from './Marks.jsx'
import StoreBadge from './StoreBadge.jsx'
import Reveal from './Reveal.jsx'
import { GITHUB_URL } from '../config.js'

/**
 * design.md law 7: "Show the real thing. Real product UI rendered in HTML beats
 * stock illustration." So this is a faithful HTML reconstruction of the actual
 * wallet screen — same structure and tokens as src/App.jsx — not a photo.
 */
const ACTIONS = [
  { name: 'Shield', hint: 'Public → private', Icon: Shield },
  { name: 'Shadow', hint: 'Vanta → Vanta', Icon: Shadow, flagship: true },
  { name: 'Ghost', hint: 'Private → any address', Icon: Ghost },
]

export default function AppPreview() {
  return (
    <section className="relative border-t border-hairline py-24 sm:py-32">
      <div className="shell">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          {/* ---- Copy ---- */}
          <div>
            <Reveal>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-subtle">
                The wallet
              </p>
            </Reveal>
            <Reveal delay={70}>
              <h2 className="mt-4 font-display text-[clamp(2rem,1.4rem+2.2vw,3rem)] font-normal leading-[1.05] tracking-[-0.03em] text-ink-strong">
                A wallet that tells you
                <br />
                what it is doing.
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="measure mt-5 text-[16px] leading-relaxed text-ink-subtle">
                One private balance, three ways to move it, and a receipt for every send. No
                hidden custody, no silent fee-taking, no claims you cannot check.
              </p>
            </Reveal>

            <Reveal delay={170}>
              <ul className="mt-8 flex flex-col gap-3">
                {[
                  'Keys never leave your device — derived from one seed',
                  'The relayer sponsors fees; it never touches your amount',
                  'Every send produces a verifiable receipt',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3 text-[14px] text-ink">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-wash text-accent">
                      <Lock size={11} />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={220}>
              <div className="mt-9 flex flex-col items-start gap-3">
                <StoreBadge size="lg" />
                <p className="text-[12px] text-ink-subtle">
                  No APK has shipped yet — the badge goes live at submission. Until then,{' '}
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    build it from source
                  </a>
                  .
                </p>
              </div>
            </Reveal>
          </div>

          {/* ---- Phone ---- */}
          <Reveal delay={140}>
            <div className="flex justify-center lg:justify-end">
              <div className="relative w-[302px] shrink-0 rounded-[2.6rem] border border-hairline-strong bg-surface-2 p-2.5 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)]">
                <div className="relative overflow-hidden rounded-[2.1rem] bg-canvas">
                  {/* status bar */}
                  <div className="flex items-center justify-between px-5 pt-3.5 pb-1">
                    <span className="font-mono text-[10px] text-ink-subtle">9:41</span>
                    <span className="h-1 w-16 rounded-full bg-surface-3" />
                    <span className="font-mono text-[10px] text-ink-subtle">devnet</span>
                  </div>

                  {/* app header */}
                  <div className="flex items-center justify-between px-4 pt-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-strong text-[13px] font-medium text-white">
                        V
                      </span>
                      <span className="flex flex-col">
                        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-subtle">
                          Privacy wallet
                        </span>
                        <span className="text-[14px] font-medium text-ink-strong">Vanta</span>
                      </span>
                    </div>
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-ink-subtle">
                      <SolanaMark size={13} />
                    </span>
                  </div>

                  {/* private balance card */}
                  <div className="mx-3 mt-4 overflow-hidden rounded-2xl border border-hairline bg-surface">
                    <div className="relative p-5">
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 opacity-[0.16]"
                        style={{
                          background:
                            'radial-gradient(120% 90% at 15% 0%, var(--color-accent-strong), transparent 70%)',
                        }}
                      />
                      <div className="relative flex items-center justify-between">
                        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-subtle">
                          Private balance
                        </span>
                        <span className="rounded bg-accent-wash px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-accent">
                          ZK
                        </span>
                      </div>
                      <div className="relative mt-3 tnum text-[30px] font-medium leading-none tracking-[-0.02em] text-ink-strong">
                        0.3000
                        <span className="ml-1.5 text-[13px] text-ink-subtle">SOL</span>
                      </div>
                      <div className="relative mt-2.5 flex items-center gap-2 font-mono text-[10px] text-ink-subtle">
                        <span className="rounded bg-surface-2 px-1.5 py-0.5">SOL</span>
                        <span>Public 0.4899</span>
                      </div>
                    </div>
                  </div>

                  {/* actions */}
                  <div className="mt-3 flex flex-col gap-2 px-3 pb-5">
                    {ACTIONS.map((a) => {
                      const { Icon } = a
                      return (
                        <div
                          key={a.name}
                          className={`flex items-center justify-between rounded-xl border px-3.5 py-3 ${
                            a.flagship
                              ? 'border-accent/30 bg-accent-wash'
                              : 'border-hairline bg-surface'
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <span className={a.flagship ? 'text-accent' : 'text-ink-subtle'}>
                              <Icon size={16} />
                            </span>
                            <span className="flex flex-col">
                              <span className="text-[13px] font-medium text-ink-strong">
                                {a.name}
                              </span>
                              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-subtle">
                                {a.hint}
                              </span>
                            </span>
                          </span>
                          <span className="text-[11px] text-ink-subtle">→</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
