import { RingsMark, ZolanaMark, SolanaMark, RelayerMark } from './Marks.jsx'
import Reveal from './Reveal.jsx'

const STACK = [
  { name: 'Helius Rings', role: 'Privacy rails', Mark: RingsMark },
  { name: 'zolana', role: 'Shielded pools', Mark: ZolanaMark },
  { name: 'Solana', role: 'Settlement', Mark: SolanaMark },
  { name: 'Vanta relayer', role: 'Fee sponsorship', Mark: RelayerMark },
]

export default function InfraStrip() {
  return (
    <section className="relative border-y border-hairline bg-surface/40">
      <div className="shell py-14 sm:py-16">
        <Reveal>
          <p className="text-center font-mono text-[11px] uppercase tracking-[0.16em] text-ink-subtle">
            Vanta&apos;s infrastructure
          </p>
        </Reveal>

        {/* 4-up on desktop, 2×2 on mobile. Hairline structure, no boxes. */}
        <Reveal delay={80}>
          <ul className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-hairline lg:grid-cols-4">
            {STACK.map(({ name, role, Mark }) => (
              <li
                key={name}
                className="flex flex-col items-center gap-3 bg-canvas px-5 py-8 text-center transition-colors duration-200 hover:bg-surface-2"
              >
                <span className="text-ink-subtle transition-colors duration-200 group-hover:text-ink">
                  <Mark size={22} />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-[14px] font-medium tracking-[-0.01em] text-ink-strong">
                    {name}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
                    {role}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>

        {/* The honest caption. Stealf says "no on-chain link between them";
            we say precisely what we can prove and flag what we cannot.

            The dash is gone. "The sender is — Vanta pays its own fees" left the
            strongest claim on the page hanging on a piece of punctuation, and
            the eye reads a dash as an aside rather than as the point. Now the
            sentence simply says what is true, in order: the sender is public,
            and here is why. */}
        <Reveal delay={140}>
          <p className="measure mx-auto mt-8 text-center text-[13px] leading-relaxed text-ink-subtle">
            The amount and the recipient are not derivable from on-chain data.{' '}
            <span className="text-ink">The sender is public.</span> Vanta pays its own fees, so
            the spend identity is visible and reused. We show you that instead of hiding it.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
