#!/usr/bin/env node
/**
 * Receipt export smoke check.
 *
 * Builds real receipts through `src/lib/receiptPdf.js`, rasterises them with
 * `sips`, and hands the PNGs to `scripts/pdf-receipt-analyze.py`.
 *
 * Why this exists: "the build passed" says nothing about a PDF. The failure
 * modes here are all runtime and all invisible to the bundler — a missing
 * font, a ReferenceError from a half-finished refactor, a path drawn off the
 * page, or a blank canvas that still produces a valid file. A valid PDF that
 * renders nothing is the exact bug class this catches.
 *
 * Usage:  node scripts/pdf-receipt-check.mjs   (from the repo root)
 * Output: /tmp/vanta-receipt-check/*.pdf and *.png
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { buildReceiptPdf } from '../src/lib/receiptPdf.js'

const OUT = '/tmp/vanta-receipt-check'

/**
 * Real devnet rows, so the reference and honesty copy are the shipped ones.
 *
 * `proof` is deliberately uneven: shadow=verified (ok), ghost=reported (warn),
 * shield=**absent**. That spans all three PROOF tones AND exercises the
 * "Not checked" fallback, so a missing proof key can never throw in the PDF.
 */
const CASES = [
  {
    label: 'shadow',
    txn: {
      title: 'Shadow transfer to another Vanta user',
      amount: '-0.100 SOL',
      mode: 'Shadow',
      type: 'outgoing',
      at: Date.parse('2026-09-25T01:52:02Z'),
      signature:
        '5cTevV1CB4eBpWnX59z8Zvo918ZMoAq6Q16d4fgN6oGZDnSeTCHGdpNJ6hfkx2jsvfd8VT5FmpNGcy8um41gqWrc',
      status: 'Confirmed',
      proof: 'verified',
    },
  },
  {
    label: 'ghost',
    txn: {
      title: 'Ghost withdrawal into any public wallet on Solana',
      amount: '-0.300 SOL',
      mode: 'Ghost',
      type: 'outgoing',
      at: Date.parse('2026-09-25T02:10:44Z'),
      signature:
        'Q5o9soTu8Yf7U7iwgoj9WeLKgkDS6CSdoZHyZPjQgNJon1nQ27GMa3RUVzThBEWxBsLxjT4LUPMH8CSrQcwm4QA',
      status: 'Confirmed',
      proof: 'reported',
    },
  },
  {
    label: 'shield',
    txn: {
      title: 'Shield deposit into the pool',
      amount: '+0.300 SOL',
      mode: 'Shield',
      type: 'income',
      at: Date.parse('2026-09-25T01:40:11Z'),
      signature:
        '3f2UWBXyb4suw7Bx4sHCJQuZeyVFyzMqAMMcsq9Lf8NjvP51DBWFs84wiBn5MmRi6ZyX9A7cpAnU87bomw29iwsN',
      status: 'Confirmed',
    },
  },
]

mkdirSync(OUT, { recursive: true })

const written = []
for (const { label, txn } of CASES) {
  const dataUrl = await buildReceiptPdf(txn, 'devnet')
  const pdfPath = `${OUT}/${label}.pdf`
  writeFileSync(pdfPath, Buffer.from(dataUrl.split(',')[1], 'base64'))
  const pngPath = `${OUT}/${label}.png`
  execFileSync('sips', ['-s', 'format', 'png', pdfPath, '--out', pngPath], {
    stdio: 'pipe',
  })
  written.push({ label, pdfPath, pngPath })
  console.log(`rendered ${label.padEnd(7)} -> ${pdfPath}`)
}

// Offline path: the display font must degrade to Helvetica, not throw.
const realFetch = globalThis.fetch
globalThis.fetch = () => Promise.reject(new Error('offline (forced by check)'))
try {
  const dataUrl = await buildReceiptPdf(CASES[0].txn, 'devnet')
  const pdfPath = `${OUT}/fallback.pdf`
  writeFileSync(pdfPath, Buffer.from(dataUrl.split(',')[1], 'base64'))
  const pngPath = `${OUT}/fallback.png`
  execFileSync('sips', ['-s', 'format', 'png', pdfPath, '--out', pngPath], {
    stdio: 'pipe',
  })
  written.push({ label: 'fallback', pdfPath, pngPath })
  console.log('rendered fallback (no font download) -> ' + pdfPath)
} finally {
  globalThis.fetch = realFetch
}

console.log('\nPNGS=' + written.map((w) => w.pngPath).join(' '))
