import { useState } from 'react'
import Drawer from './Drawer'
import HonestyRows from './HonestyRows'
import { copyText } from '../lib/clipboard'
import { stampToDate, shortRef } from '../lib/format'
import { MODE_HONESTY, explorerLink, PROOF } from '../lib/honesty'
import { lookupProof } from '../lib/txHistory'
import { downloadReceiptPdf } from '../lib/receiptPdf'

// ok = confirmed · warn = reported but not confirmed · mute = not checked.
// Amber rather than danger for `warn`: the transaction is not broken, it is
// merely unconfirmed, and painting it red would read as a failure.
const PROOF_TONE = {
  ok: { dot: 'bg-accent', text: 'text-accent' },
  warn: { dot: 'bg-amber-400', text: 'text-amber-300' },
  mute: { dot: 'bg-white/30', text: 'text-muted' },
}

const MODE_COPY = {
  Shield: { label: 'Shield · into the pool', tone: 'text-accent bg-accent/10 border-accent/30' },
  Shadow: { label: 'Shadow · Vanta to Vanta', tone: 'text-accent bg-accent/10 border-accent/30' },
  Ghost: { label: 'Ghost · pool to anyone', tone: 'text-accent bg-accent/10 border-accent/30' },
  Public: { label: 'Public · on chain', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/20' },
}

/**
 * Receipt sheet — tap any row in the history list.
 *
 * The honesty block is the reason this screen exists. It renders the SAME rows
 * as the "what leaks" sheet (they both read lib/honesty.js), so a receipt can
 * never make a claim the sheet doesn't back up.
 *
 * When a mode has no honest on-chain record — Shadow — we say so instead of
 * offering a link that would only show a fee and teach the wrong lesson.
 */
export default function ReceiptDrawer({ open, onClose, txn, notify }) {
  const [exporting, setExporting] = useState(false)
  const income = txn?.type === 'income'
  const mode = txn?.mode
  const known = Boolean(MODE_HONESTY[mode])
  const link = explorerLink(mode, txn?.signature)
  const onChain = known ? MODE_HONESTY[mode].onChain : null

  const badge = MODE_COPY[mode] ?? {
    label: txn?.isPrivate ? 'Private' : 'Public',
    tone: 'text-white/80 bg-white/5 border-hair',
  }

  const copyReceipt = () => {
    if (!txn) return
    const lines = [
      'Vanta transaction receipt',
      `Type: ${txn.title}`,
      `Amount: ${txn.amount}`,
      `Mode: ${badge.label}`,
      `Timestamp: ${txn.at ? stampToDate(txn.at) : txn.time}`,
      `Status: ${txn.status || 'Confirmed'}`,
      `Reference: ${txn.signature || 'pending'}`,
      ...(onChain ? ['', 'On chain:', onChain.note] : []),
    ]
    copyText(lines.join('\n'), notify, 'Receipt details copied!', '📋')
  }

  const exportPdf = async () => {
    if (!txn || exporting) return
    setExporting(true)
    try {
      const file = await downloadReceiptPdf(txn, 'devnet')
      notify(`Saved ${file}`, '📄')
    } catch (err) {
      console.error(err)
      notify(`Could not export the receipt: ${err?.message || err}`, '⚠️')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Transaction details">
      {txn && (
        <>
          <div className="text-center flex flex-col items-center gap-1.5">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center mb-1 border ${
                income
                  ? 'bg-accent/20 text-accent border-accent/30'
                  : 'bg-danger/20 text-danger border-danger/30'
              }`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d={income ? 'M5 13l4 4L19 7' : 'M7 17L17 7M17 7H9M17 7V15'}
                />
              </svg>
            </div>
            <span className="text-[11px] font-bold text-muted uppercase tracking-widest">
              {txn.mode ? `${txn.mode} transfer` : 'Transfer'}
            </span>
            <h3 className="text-2xl font-bold text-white tracking-tight">{txn.title}</h3>
            <span className={`text-3xl font-extrabold tnum ${income ? 'text-accent' : 'text-danger'}`}>
              {txn.amount}
            </span>
          </div>

          {/* Per-leg honesty — shared with the what-leaks sheet. */}
          {known ? (
            <HonestyRows mode={mode} compact />
          ) : (
            <div className="rounded-2xl bg-white/5 border border-hair px-4 py-3 text-[12px] text-muted">
              No privacy profile recorded for this transaction type.
            </div>
          )}

          {/* On-chain leg: link it when a link tells the truth, disclose when it doesn't. */}
          <div className="rounded-2xl bg-black/40 border border-hair p-3.5 flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              {onChain?.linkable ? 'On chain' : 'On-chain record'}
            </span>
            <p className="text-[11px] leading-snug text-white/80">{onChain?.note}</p>

            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-0.5 self-start px-3.5 py-2 rounded-xl bg-white/10 border border-hair text-white font-semibold text-[12px] hover:bg-white/15 active:scale-95 transition-all"
              >
                View on Solana Explorer →
              </a>
            ) : (
              <p className="text-[10px] leading-snug text-muted font-mono break-all">
                Signature: {txn.signature || 'pending'}
              </p>
            )}
          </div>

          {/* Verification — did this actually land? The whole point of the flag:
              a client-reported Shadow is NOT the same claim as a relayer-observed
              Shield, and a receipt that flattens them is overclaiming. */}
          {(() => {
            const proof = PROOF[txn.proof ?? lookupProof(txn.signature)] ?? PROOF.unchecked
            const tone = PROOF_TONE[proof.tone] ?? PROOF_TONE.mute
            return (
              <div className="rounded-2xl bg-white/5 border border-hair p-3.5 flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  On-chain check
                </span>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} />
                  <span className={`text-[12px] font-bold ${tone.text}`}>{proof.label}</span>
                </div>
                <p className="text-[11px] leading-snug text-muted">{proof.detail}</p>
              </div>
            )
          })()}

          <div className="bg-black/50 rounded-2xl p-4 border border-white/10 flex flex-col gap-3 text-sm">
            <div className="flex justify-between items-center gap-3">
              <span className="text-muted font-medium shrink-0">Privacy</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${badge.tone}`}>
                {badge.label}
              </span>
            </div>
            <div className="flex justify-between items-center gap-3">
              <span className="text-muted font-medium shrink-0">Timestamp</span>
              <span className="font-semibold text-white/90 text-[12px] text-right">
                {txn.at ? stampToDate(txn.at) : txn.time}
              </span>
            </div>
            <div className="flex justify-between items-start gap-3">
              <span className="text-muted font-medium shrink-0">Reference</span>
              <span className="font-mono text-[11px] text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/30 break-all text-right">
                {shortRef(txn.signature)}
              </span>
            </div>
            <div className="flex justify-between items-center gap-3">
              <span className="text-muted font-medium shrink-0">Status</span>
              <span className="text-[11px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/30">
                {txn.status || 'Confirmed'}
              </span>
            </div>
          </div>

          <button
            onClick={exportPdf}
            disabled={exporting}
            className="w-full py-3.5 rounded-2xl bg-accent hover:bg-accent-hi font-bold text-black active:scale-[0.98] transition-all text-sm disabled:opacity-50"
          >
            {exporting ? 'Building receipt…' : 'Download PDF receipt'}
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={copyReceipt}
              className="py-3.5 rounded-2xl bg-white/10 font-bold text-white hover:bg-white/15 active:scale-95 transition-all text-sm"
            >
              Copy details
            </button>
            <button
              onClick={onClose}
              className="py-3.5 rounded-2xl bg-white/10 border border-hair font-bold text-muted hover:bg-white/15 active:scale-95 transition-all text-sm"
            >
              Close
            </button>
          </div>
        </>
      )}
    </Drawer>
  )
}
