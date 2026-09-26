import { Shield, Shadow, Ghost, EyeOff, Alert } from './Marks.jsx'
import Reveal from './Reveal.jsx'

/**
 * Stealf's equivalent section is a two-card split. Vanta has three real flows
 * and — unlike a two-card story — each one discloses its own visibility.
 * That per-flow disclosure is the differentiator, not decoration.
 */
const FLOWS = [
  {
    id: 'shield',
    name: 'Shield',
    route: 'Public → private',
    Icon: Shield,
    flagship: false,
    body: 'Move SOL into the shielded pool. The deposit edge is public — that part is unavoidable — and everything after it is not.',
    visibility: [
      { label: 'Amount', state: 'public' },
      { label: 'Recipient', state: 'n/a' },
      { label: 'Sender', state: 'visible' },
    ],
  },
  {
    id: 'shadow',
    name: 'Shadow',
    route: 'Vanta → Vanta',
    Icon: Shadow,
    flagship: true,
    body: 'Send to another Vanta. The amount and the recipient never touch the chain. This is the flow the whole product exists for.',
    visibility: [
      { label: 'Amount', state: 'hidden' },
      { label: 'Recipient', state: 'hidden' },
      { label: 'Sender', state: 'visible' },
    ],
  },
  {
    id: 'ghost',
    name: 'Ghost',
    route: 'Private → any address',
    Icon: Ghost,
    flagship: false,
    body: 'Cash out to any Solana wallet, even one that has never used Vanta. The amount becomes public again — on purpose.',
    visibility: [
      { label: 'Amount', state: 'public' },
      { label: 'Recipient', state: 'public' },
      { label: 'Sender', state: 'visible' },
    ],
  },
]

const STATE_STYLE = {
  hidden: { text: 'text-hidden', dot: 'bg-hidden', label: 'hidden' },
  public: { text: 'text-exposed', dot: 'bg-exposed', label: 'public' },
  visible: { text: 'text-exposed', dot: 'bg-exposed', label: 'visible' },
  'n/a': { text: 'text-ink-subtle', dot: 'bg-hairline-strong', label: 'n/a' },
}

function VisibilityRow({ label, state }) {
  const s = STATE_STYLE[state]
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[12px] text-ink-subtle">{label}</span>
      {/* Status is never colour alone — dot + label (design.md colour rule 5) */}
      <span className={`flex items-center gap-2 font-mono text-[11px] tracking-[0.06em] ${s.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
        {s.label}
      </span>
    </div>
  )
}

export default function Flows() {
  return (
    <section id="how" className="relative py-24 sm:py-32">
      <div className="shell">
        <div className="max-w-2xl">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-subtle">
              How it works
            </p>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="mt-4 font-display text-[clamp(2.1rem,1.4rem+2.4vw,3.25rem)] font-normal leading-[1.04] tracking-[-0.03em] text-ink-strong">
              Three ways to move value.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="measure mt-5 text-[16px] leading-relaxed text-ink-subtle">
              Each flow discloses its own visibility up front. Pick the one that matches what
              you need to keep private — and know what it costs you.
            </p>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {FLOWS.map((flow, i) => {
            const { Icon } = flow
            return (
              <Reveal key={flow.id} delay={i * 90}>
                <article
                  className={`ring-card flex h-full flex-col rounded-2xl p-6 transition-colors duration-200 sm:p-7 ${
                    flow.flagship ? 'bg-surface-2' : 'bg-surface hover:bg-surface-2'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`grid h-11 w-11 place-items-center rounded-xl ${
                        flow.flagship
                          ? 'bg-accent-wash text-accent'
                          : 'bg-canvas text-ink-subtle'
                      }`}
                    >
                      <Icon size={20} />
                    </span>
                    {flow.flagship && (
                      <span className="rounded-md bg-accent-wash px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
                        Flagship
                      </span>
                    )}
                  </div>

                  <h3 className="mt-5 text-[20px] font-medium tracking-[-0.015em] text-ink-strong">
                    {flow.name}
                  </h3>
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-subtle">
                    {flow.route}
                  </p>

                  <p className="mt-4 flex-1 text-[14px] leading-relaxed text-ink">{flow.body}</p>

                  <div className="mt-6 divide-y divide-hairline border-t border-hairline pt-1">
                    {flow.visibility.map((v) => (
                      <VisibilityRow key={v.label} {...v} />
                    ))}
                  </div>
                </article>
              </Reveal>
            )
          })}
        </div>

        {/* Legend: explain the two states so the colours are never ambiguous */}
        <Reveal delay={200}>
          <div className="mt-8 flex flex-col gap-3 text-[12px] text-ink-subtle sm:flex-row sm:items-center sm:gap-6">
            <span className="flex items-center gap-2">
              <EyeOff size={13} />
              <span>
                <span className="text-hidden">hidden</span> — not derivable from on-chain data
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Alert size={13} />
              <span>
                <span className="text-exposed">visible</span> — readable by anyone with the
                transaction
              </span>
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
