import { ChevronDown } from './Marks.jsx'
import Reveal from './Reveal.jsx'

/**
 * Native <details>/<summary> — keyboard and screen-reader behaviour for free
 * (design.md: complete keyboard paths, real semantics over custom widgets).
 * The answers are the same ones we put in the repo, including the unflattering bit.
 */
const FAQS = [
  {
    q: 'Is Vanta anonymous?',
    a: 'No. It is confidential, and the difference matters. A Shadow send hides the amount and the recipient. It does not hide the sender: Vanta pays its own network fees, so the sending identity is publicly visible on every spend and is reused across sends. Anyone who knows your Vanta address can count and time your payments.',
  },
  {
    q: 'Where do my funds go when I shield?',
    a: 'Into a shared shielded pool: a program-controlled vault, not an account we hold keys to. Your private balance is an encrypted note inside that pool, and it behaves like a bearer claim. Whoever holds the viewing and nullifier keys can spend it.',
  },
  {
    q: 'Who actually controls the vault?',
    a: 'The shielded-pool program does. That program is currently upgradeable and its upgrade authority is set, which means whoever holds that key can change the rules the vault obeys. We disclose this rather than bury it because it is the largest single trust assumption in the design. The addresses are listed below.',
  },
  {
    q: 'Has it been audited? Is it on mainnet?',
    a: 'No, and no. Vanta runs on Solana devnet and has not been audited. Do not put real funds into it. We say this on the landing page rather than in a footnote, because it changes what the software is actually for.',
  },
  {
    q: 'What happens if I lose my device or my seed?',
    a: 'Your private balance is derived from your seed. Lose it and the notes cannot be spent. They are bearer claims with no recovery path and no support desk that can restore them.',
  },
  {
    q: 'Does the relayer see my payments?',
    a: 'It sees the transactions it sponsors, but it never funds a payment amount. The relayer pays network fees and registration rent; your own wallet pays deposits, and spends are authorized by your shielded owner key. In the current build the relayer has no authentication, so it must be hardened before any public deployment.',
  },
  {
    q: 'How do I run it today?',
    a: 'Clone the repo, build @heliuslabs/zolana from the v0.3.0-alpha git tag (the published npm package does not work against the current devnet programs), run the local relayer, and point the app at devnet. The full steps are in the repository README.',
  },
]

export default function Faq() {
  return (
    <section id="faq" className="relative border-t border-hairline py-24 sm:py-32">
      <div className="shell">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          {/* Split header: sticky title on the left, list on the right */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-28">
              <Reveal>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-subtle">
                  FAQ
                </p>
              </Reveal>
              <Reveal delay={70}>
                <h2 className="mt-4 font-display text-[clamp(1.9rem,1.3rem+2vw,2.75rem)] font-normal leading-[1.06] tracking-[-0.03em] text-ink-strong">
                  The questions
                  <br />
                  we would ask too.
                </h2>
              </Reveal>
              <Reveal delay={120}>
                <p className="mt-5 text-[14px] leading-relaxed text-ink-subtle">
                  Including the ones with uncomfortable answers. If something is not covered,
                  open an issue on the repo.
                </p>
              </Reveal>
            </div>
          </div>

          <div className="lg:col-span-8">
            <Reveal delay={100}>
              <div className="divide-y divide-hairline border-y border-hairline">
                {FAQS.map((item) => (
                  <details key={item.q} className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left transition-colors [&::-webkit-details-marker]:hidden">
                      <span className="text-[16px] font-medium tracking-[-0.01em] text-ink-strong transition-colors group-hover:text-white">
                        {item.q}
                      </span>
                      <span className="shrink-0 text-ink-subtle transition-transform duration-300 group-open:rotate-180">
                        <ChevronDown size={16} />
                      </span>
                    </summary>
                    <div className="pb-6 pr-8">
                      <p className="measure text-[14px] leading-[1.7] text-ink-subtle">{item.a}</p>
                    </div>
                  </details>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}
