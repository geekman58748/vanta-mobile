import { useState } from 'react'
import { Check, Alert, EyeOff, Copy } from './Marks.jsx'
import { SHADOW, GHOST, SHIELD, USER_SENDS } from '../data/evidence.js'
import { explorerUrl } from '../config.js'
import Reveal from './Reveal.jsx'

/* ------------------------------------------------------------------ *
 * The loud idea — one per page (design.md law 11).
 *
 * Stealf markets what stays private. This shows the exact split between what
 * is hidden and what leaks, on a real devnet transaction, and lets the reader
 * flip to "observer mode" to see the page from an attacker's seat.
 * Nothing here is a mock-up: every row resolves to SHADOW.signature.
 * ------------------------------------------------------------------ */

function shortSig(sig) {
  return `${sig.slice(0, 8)}…${sig.slice(-8)}`
}

function Verdict({ finding, observer }) {
  const hidden = finding.verdict === 'hidden'
  const dimmed = observer && hidden

  return (
    <div
      className={`rounded-xl p-4 transition-all duration-500 ${
        dimmed
          ? 'bg-surface/40 opacity-35 saturate-0'
          : hidden
            ? 'bg-hidden-wash'
            : 'bg-exposed-wash'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-medium tracking-[-0.01em] text-ink-strong">
          {finding.claim}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${
            dimmed
              ? 'bg-surface-3 text-ink-subtle'
              : hidden
                ? 'bg-hidden/15 text-hidden'
                : 'bg-exposed/15 text-exposed'
          }`}
        >
          {dimmed ? <EyeOff size={11} /> : hidden ? <Check size={11} /> : <Alert size={11} />}
          {dimmed ? 'not visible' : hidden ? 'hidden' : 'visible'}
        </span>
      </div>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-subtle">
        {dimmed ? 'An observer cannot read this from the transaction.' : finding.detail}
      </p>
    </div>
  )
}

export default function PrivacyReceipt() {
  const [observer, setObserver] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SHADOW.signature)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard unavailable — the explorer link still works */
    }
  }

  return (
    <section id="receipt" className="relative border-t border-hairline py-24 sm:py-32">
      <div className="shell">
        {/* Section header — split: title left, lede right (design.md editorial rhythm) */}
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <Reveal>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-subtle">
                The receipt
              </p>
            </Reveal>
            <Reveal delay={70}>
              <h2 className="mt-4 font-display text-[clamp(2.1rem,1.4rem+2.6vw,3.5rem)] font-normal leading-[1.03] tracking-[-0.03em] text-ink-strong">
                The receipt nobody
                <br />
                else gives you.
              </h2>
            </Reveal>
          </div>
          <div className="lg:col-span-5">
            <Reveal delay={120}>
              <p className="text-[15px] leading-relaxed text-ink-subtle">
                Marketing claims are free. This is an actual devnet transaction, annotated row
                by row. Every number below is read straight off the chain.
              </p>
            </Reveal>
          </div>
        </div>

        <Reveal delay={160}>
          <div className="ring-card relative mt-12 overflow-hidden rounded-3xl bg-surface">
            {/* The one ambient loop on the page */}
            <div className="sweep" aria-hidden="true" />

            {/* ---- Receipt header ---- */}
            <div className="relative flex flex-wrap items-center justify-between gap-4 border-b border-hairline px-6 py-5 sm:px-8">
              <div className="flex items-center gap-3">
                <span className="rounded-md bg-accent-wash px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
                  {SHADOW.kind}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-subtle">
                  {SHADOW.route}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
                  moved
                </span>
                <span className="tnum text-[15px] font-medium text-ink-strong">
                  {SHADOW.amountMoved}
                </span>
              </div>
            </div>

            {/* ---- Body ---- */}
            <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
              {/* Left: the verdicts */}
              <div>
                <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
                  What the transaction reveals
                </h3>

                <p className="mt-4 text-[14px] leading-relaxed text-ink">
                  We moved <span className="text-ink-strong">{SHADOW.amountMoved}</span>. Search
                  this transaction for that number — it is not there.
                </p>

                <div className="mt-5 flex flex-col gap-3">
                  {SHADOW.findings.map((f) => (
                    <Verdict key={f.claim} finding={f} observer={observer} />
                  ))}
                </div>
              </div>

              {/* Right: the raw chain deltas */}
              <div>
                <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
                  Every account that changed
                </h3>

                <div className="mt-4 overflow-hidden rounded-xl bg-canvas ring-1 ring-hairline">
                  <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
                      account
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
                      Δ SOL
                    </span>
                  </div>
                  {SHADOW.deltas.map((d) => {
                    const isLeak = d.tone === 'exposed'
                    const muted = observer && !isLeak
                    return (
                      <div
                        key={d.short}
                        className={`flex items-center justify-between gap-4 border-b border-hairline px-4 py-3 transition-opacity duration-500 last:border-0 ${
                          muted ? 'opacity-30' : ''
                        } ${isLeak && observer ? 'bg-exposed-wash' : ''}`}
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-[12px] text-ink-strong">{d.short}</div>
                          <div className="mt-0.5 truncate text-[11px] text-ink-subtle">
                            {d.role}
                          </div>
                        </div>
                        <span
                          className={`tnum shrink-0 font-mono text-[12px] ${
                            isLeak ? 'text-exposed' : 'text-ink-subtle'
                          }`}
                        >
                          {d.delta}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <p className="mt-4 text-[12.5px] leading-relaxed text-ink-subtle">
                  The two note accounts hold an encrypted claim. They are a fixed rent-exempt
                  size, so the amount cannot be inferred from them either.
                </p>
              </div>
            </div>

            {/* ---- Observer mode + footer ---- */}
            <div className="relative border-t border-hairline bg-canvas/40 px-6 py-5 sm:px-8">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                {/* Switch (design.md selection-control spec: 24×14 track, 10px thumb) */}
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={observer}
                    onChange={(e) => setObserver(e.target.checked)}
                  />
                  <span className="relative inline-block h-3.5 w-6 shrink-0 rounded-full bg-hairline-strong transition-colors duration-150 peer-checked:bg-accent-strong peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                    <span
                      className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-transform duration-150 ${
                        observer ? 'translate-x-3' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                  <span className="text-[13px] text-ink">
                    Observer mode —{' '}
                    <span className="text-ink-subtle">see only what a stranger sees</span>
                  </span>
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <code className="break-hash font-mono text-[11px] text-ink-subtle">
                    {shortSig(SHADOW.signature)}
                  </code>
                  <button
                    type="button"
                    onClick={copy}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-[11px] text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink-strong"
                  >
                    {copied ? <Check size={11} /> : <Copy size={11} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <a
                    href={explorerUrl(SHADOW.signature)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-[11px] text-accent transition-colors hover:bg-surface-2"
                  >
                    Verify on Explorer ↗
                  </a>
                </div>
              </div>

              <p className="mt-4 text-[12px] leading-relaxed text-ink-subtle">
                What this receipt cannot promise: the sender is publicly identifiable as the fee
                payer and that identity is reused across sends, so an observer who knows your
                address can still count and time your payments.
              </p>
            </div>
          </div>
        </Reveal>

        {/* ---- The rest of the evidence, as plain links ---- */}
        <Reveal delay={200}>
          <div className="mt-10">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
              The rest of the evidence
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: `${GHOST.kind} — withdraw ${GHOST.amountMoved}`, sig: GHOST.signature },
                { label: `${SHIELD.kind} — deposit ${SHIELD.amountMoved}`, sig: SHIELD.signature },
                ...USER_SENDS.map((s, i) => ({
                  label: `Live send ${i + 1} — ${s.time}`,
                  sig: s.signature,
                })),
              ].map((item) => (
                <li key={item.sig}>
                  <a
                    href={explorerUrl(item.sig)}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3 ring-1 ring-hairline transition-colors duration-200 hover:bg-surface-2 hover:ring-hairline-strong"
                  >
                    <span className="truncate text-[13px] text-ink">{item.label}</span>
                    <span className="shrink-0 text-ink-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                      ↗
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
