import { MODE_HONESTY, RESIDUALS, PROOF, explorerLink } from './honesty.js'

/**
 * PDF receipt export.
 *
 * `pdf-lib` is imported lazily, so it lands in its own chunk and never costs the
 * first paint.
 *
 * ── Two typefaces, both deliberate ──────────────────────────────────────────
 *   · **Space Grotesk** (variable TTF, subset to ~4.5 KB) is the DISPLAY face:
 *     masthead, amount, transaction title. Fetched lazily and embedded through
 *     `@pdf-lib/fontkit`.
 *   · **Helvetica** (bundled, WinAnsi) is the TEXT face: meta rows, honesty
 *     values, residuals. It gives a real bold at 9px, which a single-weight
 *     variable instance cannot, and it keeps the receipt usable offline.
 *
 * Every fact about these fonts was probed before it was written (2026-09-26):
 *   · custom fonts need `doc.registerFontkit(fontkit)`, else embed throws;
 *   · this variable TTF both subsets (4.5KB vs 70KB) and rasterises in a real
 *     viewer (`sips` renders it to a non-blank PNG);
 *   · **WOFF does not parse** ("beyond buffer length"), TTF is the only source
 *     that works;
 *   · `drawSvgPath` handles cubic beziers, so the app's TopoWaves field can be
 *     drawn as vectors instead of a raster.
 *
 * Because Helvetica is WinAnsi, any glyph outside Latin-1 (✓ ⚠ em dash …)
 * throws at draw time, so every string still goes through `ascii()`.
 *
 * Distribution: on Android the bytes go to the native shell through
 * `window.VantaShell.saveBase64File(fileName, mime, base64)`, which writes them
 * into `Downloads/Vanta/` and **returns where they landed** (see FileSaver.kt).
 *
 * This replaced a `data:` URL handed to the WebView in the belief that a
 * `DownloadListener` would catch it and write the file. There is no
 * `DownloadListener` in the shell: the navigation went nowhere, nothing was
 * written to the device, and the sheet still toasted "Saved" (AUDIT-2026-09-27
 * H2). Distribution now reports its own outcome instead of assuming one.
 *
 * In a desktop browser there is no bridge, so we fall back to an anchor with
 * `download` — the browser owns the outcome there and all we may honestly say
 * is that the download was requested.
 */

const INK = [0.024, 0.024, 0.031] // #060608
const ACCENT = [0.545, 0.475, 0.941] // #8b79f0
const ROSE = [0.925, 0.416, 0.478] // #ec6a7a, the app's danger token
const WHITE = [1, 1, 1]
const MUTED = [0.557, 0.557, 0.576] // #8e8e93
// TopoWaves stroke. Deliberately dimmer than the accent: the field is wallpaper,
// so it has to read as texture on #060608 without ever competing with text.
const WAVE = [0.17, 0.15, 0.28]

// Space Grotesk, fetched and embedded as a custom font. Both facts were probed
// before being written: custom fonts need `registerFontkit`, and this variable
// TTF both subsets (4.5KB vs 70KB) and rasterises in a real PDF engine. WOFF
// does NOT parse ("beyond buffer length"), so the TTF is the only source that
// works. Helvetica stays as the offline fallback.
const GROTESK_URL =
  'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf'

// The app's TopoWaves field, drawn vectorially rather than rasterised. Same 13
// cubic beziers as App.jsx, so the receipt wears the actual wallpaper.
const TOPO = [
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
]

// Warn rows use ROSE, not amber. Amber read as a stray warm accent against the
// amethyst palette and fought the whole design.
const okTone = (tone) => (tone === 'ok' ? ACCENT : tone === 'warn' ? ROSE : MUTED)

/** Latin-1 safe text. Also strips em dashes, because the copy no longer uses them. */
function ascii(input) {
  const MAP = {
    '→': '->', '←': '<-', '•': '-', '·': '-',
    '’': "'", '‘': "'", '“': '"', '”': '"',
    '–': '-', '—': ' ', '✓': '', '✔': '', '✗': 'x', '✕': 'x',
    '⚠️': '!', '⚠': '!', '✅': '', '⏳': '...', '⋯': '...', '…': '...',
    '🛡': '', '🕳': '', '👻': '', '📋': '', '📥': '',
  }
  return String(input ?? '')
    .replace(/[\s\S]/g, (ch) => MAP[ch] ?? ch)
    .replace(/[\u0100-\uFFFF]/g, '') // anything still outside WinAnsi
}

/**
 * Split a token that is itself wider than the column. A base58 signature and an
 * explorer URL contain no spaces, so plain word wrap lets them run straight off
 * the page — which is exactly what they were doing.
 */
function chunk(token, font, size, maxWidth) {
  const parts = []
  let rest = token
  while (rest.length > 1 && font.widthOfTextAtSize(rest, size) > maxWidth) {
    let lo = 1
    let hi = rest.length - 1
    let cut = 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (font.widthOfTextAtSize(rest.slice(0, mid), size) <= maxWidth) {
        cut = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    parts.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  if (rest) parts.push(rest)
  return parts
}

/** Greedy word wrap that also hard-breaks over-long tokens. */
function wrap(text, font, size, maxWidth) {
  const words = ascii(text)
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => chunk(word, font, size, maxWidth))
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (!line || font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

const base64 = (bytes) => {
  let binary = ''
  const STEP = 0x8000
  for (let i = 0; i < bytes.length; i += STEP) {
    binary += String.fromCharCode(...bytes.subarray(i, i + STEP))
  }
  return btoa(binary)
}

/**
 * Embed the display face, or return null so the caller can fall back to
 * Helvetica Bold.
 *
 * Deliberately failure-safe in every direction: a receipt that exports in the
 * wrong typeface beats one that throws because a CDN blinked. Each step is
 * probed rather than assumed, which is why the size floor exists (a truncated
 * 200-byte response parses as "a font" and then dies later, mid-layout).
 */
async function loadDisplay(doc) {
  try {
    const mod = await import('@pdf-lib/fontkit')
    doc.registerFontkit(mod.default ?? mod)
    const res = await fetch(GROTESK_URL, { cache: 'force-cache' })
    if (!res.ok) throw new Error(`font HTTP ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length < 4096) throw new Error(`font truncated: ${bytes.length}B`)
    return await doc.embedFont(bytes, { subset: true })
  } catch (err) {
    console.warn('[receipt] Space Grotesk unavailable, using Helvetica:', err?.message ?? err)
    return null
  }
}

/**
 * Build the receipt and hand it back as a `data:` URL.
 * @param {object} txn the history row (title, amount, mode, at, signature, status)
 * @param {string} network label, e.g. 'devnet'
 */
export async function buildReceiptPdf(txn, network = 'devnet') {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

  const doc = await PDFDocument.create()
  doc.setTitle(`Vanta receipt ${ascii(txn?.signature || '')}`.slice(0, 120))
  doc.setProducer('Vanta')
  doc.setCreator('Vanta privacy wallet')

  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  // Display face. Falls back to Helvetica Bold, which is exactly what this
  // layout used before Grotesk existed, so the fallback is not a degraded path.
  const display = (await loadDisplay(doc)) ?? bold

  const W = 420
  // Tall enough that meta + honesty + a wrapped explorer URL + all three
  // residuals clear the fixed footer. The guard in the residuals loop is the
  // backstop; this is the headroom that keeps it from ever firing.
  // Sizing note: content is anchored to the top and the footer to the bottom,
  // so H alone sets the gap between them. 700 left a 94-121pt dead zone; 660
  // lands it at 54-81pt with ~20pt of slack left before the guard would trim a
  // residual line. Verified by scripts/pdf-receipt-analyze.py.
  const H = 660
  const page = doc.addPage([W, H])
  const M = 34
  const contentW = W - M * 2

  let y = H - M

  const text = (str, { x = M, size = 10, font = regular, color = MUTED, width = contentW } = {}) => {
    const lines = wrap(str, font, size, width)
    for (const line of lines) {
      page.drawText(line, { x, y, size, font, color })
      y -= size * 1.42
    }
    return lines.length
  }

  const rule = (pad = 14) => {
    y -= pad
    page.drawLine({
      start: { x: M, y: y + 6 },
      end: { x: W - M, y: y + 6 },
      thickness: 0.5,
      color: rgb(0.2, 0.2, 0.24),
    })
    y -= 6
  }

  // ── Canvas ───────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(...INK) })
  // The app's TopoWaves wallpaper, drawn as real vectors. It goes down first so
  // every later element composites on top of it. pdf-lib negates the SVG Y axis
  // (scale(s, -s)), so anchoring near the top of the page lets the field sweep
  // downward through the masthead and amount, where the app puts it too.
  page.drawSvgPath(TOPO.join(' '), {
    x: 12,
    y: H - 24,
    scale: 1,
    borderColor: rgb(...WAVE),
    borderWidth: 0.7,
  })
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: rgb(...ACCENT) })

  // ── Masthead ─────────────────────────────────────────────────────────────
  page.drawText('VANTA', { x: M, y: y - 22, size: 30, font: display, color: rgb(...WHITE) })
  y -= 34
  page.drawText(ascii('TRANSACTION RECEIPT'), {
    x: M,
    y,
    size: 9,
    font: bold,
    color: rgb(...ACCENT),
  })
  y -= 6
  rule(10)

  // ── Headline amount ──────────────────────────────────────────────────────
  const income = txn?.type === 'income'
  const amountLine = ascii(txn?.amount ?? '')
  // Size by measurement, not character count. A character count hard-codes one
  // font's metrics, and Grotesk is narrower than Helvetica, so a "16 char" rule
  // would either waste the column or overflow it depending on which face loaded.
  let amountSize = 38
  while (amountSize > 14 && display.widthOfTextAtSize(amountLine, amountSize) > contentW) {
    amountSize -= 1
  }
  page.drawText(amountLine, {
    x: M,
    y: y - amountSize,
    size: amountSize,
    font: display,
    color: rgb(...(income ? ACCENT : ROSE)),
  })
  y -= amountSize + 14
  // Wrapped, not single-line: a Ghost payout title is long enough to run off the
  // right edge when it was being drawn unmeasured.
  text(txn?.title ?? '', { size: 12, font: display, color: rgb(...WHITE) })
  y -= 8

  // ── Meta rows ────────────────────────────────────────────────────────────
  const meta = [
    ['Mode', MODE_HONESTY[txn?.mode] ? txn.mode : txn?.mode || 'Unknown'],
    ['Direction', income ? 'Incoming' : 'Outgoing'],
    ['When', txn?.at ? new Date(txn.at).toLocaleString() : txn?.time ?? ''],
    ['Status', txn?.status || 'Confirmed'],
    // Deliberately NOT folded into Status: a tx can be 'Confirmed' locally while
    // never having been checked against the chain. Both facts go on the paper.
    [
      'On chain',
      PROOF[txn?.proof]?.label ?? PROOF.unchecked.label,
      PROOF[txn?.proof]?.tone ?? PROOF.unchecked.tone,
    ],
    ['Network', network],
    ['Reference', txn?.signature || 'pending'],
  ]

  for (const [label, value, tone] of meta) {
    const isReference = label === 'Reference'
    const valueSize = 9
    const labelW = 74
    const valX = M + labelW

    if (isReference) {
      // Full signature, wrapped and kept selectable so it can be pasted into an
      // explorer. Never truncate a reference on a receipt.
      page.drawText(ascii(label), { x: M, y, size: 9, font: bold, color: rgb(...MUTED) })
      y -= 14
      const lines = wrap(value, regular, 9, contentW)
      for (const line of lines) {
        page.drawText(line, { x: M, y, size: 9, font: regular, color: rgb(...ACCENT) })
        y -= 13
      }
      continue
    }

    page.drawText(ascii(label), { x: M, y, size: 9, font: bold, color: rgb(...MUTED) })
    // Values are right-aligned to the content edge, the same way the on-screen
    // rows align them. `valX` stays declared because it documents the column.
    // A row carrying a tone is a claim about verification, so it takes the same
    // colour the per-leg honesty rows use — never plain white.
    const rendered = ascii(value)
    const valueW = (tone ? bold : regular).widthOfTextAtSize(rendered, valueSize)
    const rightEdge = Math.max(valX, W - M - valueW)
    page.drawText(rendered, {
      x: rightEdge,
      y,
      size: valueSize,
      font: tone ? bold : regular,
      color: rgb(...(tone ? okTone(tone) : WHITE)),
    })
    y -= 15
  }

  // ── Per-leg honesty ──────────────────────────────────────────────────────
  const honesty = MODE_HONESTY[txn?.mode]
  if (honesty) {
    rule(12)
    page.drawText('WHAT THIS REVEALS ON CHAIN', {
      x: M,
      y,
      size: 9,
      font: bold,
      color: rgb(...ACCENT),
    })
    y -= 18

    for (const [label, value, tone] of honesty.rows) {
      page.drawText(ascii(label), { x: M, y, size: 9, font: regular, color: rgb(...MUTED) })
      const valueText = ascii(value)
      const w = regular.widthOfTextAtSize(valueText, 9)
      page.drawText(valueText, {
        x: W - M - w,
        y,
        size: 9,
        font: bold,
        color: rgb(...okTone(tone)),
      })
      y -= 15
    }

    y -= 4
    text(honesty.onChain.note, { size: 9, color: rgb(...WHITE) })

    const link = explorerLink(txn?.mode, txn?.signature)
    if (link) {
      y -= 4
      // Label on its own line, URL wrapped beneath it. Inline after the label,
      // this ~140-char URL ran straight off the right margin: caught by
      // scripts/pdf-receipt-analyze.py as 58 stray pixels at x>=390 on Ghost
      // and Shield (the only two modes where a link is drawn at all).
      page.drawText('View on explorer:', { x: M, y, size: 9, font: bold, color: rgb(...MUTED) })
      y -= 13
      for (const line of wrap(link, regular, 8, contentW)) {
        page.drawText(line, { x: M, y, size: 8, font: regular, color: rgb(...ACCENT) })
        y -= 11
      }
    }
  }

  // ── Residuals ────────────────────────────────────────────────────────────
  rule(12)
  page.drawText('RESIDUALS WE WILL NOT HIDE FROM YOU', {
    x: M,
    y,
    size: 8,
    font: bold,
    color: rgb(...ROSE),
  })
  y -= 14
  for (const line of RESIDUALS) {
    // Stop on available room, not on a line budget: the footer is anchored at a
    // fixed baseline, so anything drawn below this guard collides with it.
    if (y < M + 76) break
    text(`- ${line}`, { size: 8, color: rgb(...MUTED) })
    y -= 2
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  y = M + 26
  page.drawLine({
    start: { x: M, y: y + 16 },
    end: { x: W - M, y: y + 16 },
    thickness: 0.5,
    color: rgb(0.2, 0.2, 0.24),
  })
  page.drawText(ascii('Devnet build. Unaudited, not for real funds.'), {
    x: M,
    y,
    size: 8,
    font: regular,
    color: rgb(...MUTED),
  })

  const bytes = await doc.save()
  return `data:application/pdf;base64,${base64(bytes)}`
}

/** Stable, path-safe file name for a receipt. */
export function receiptFileName(txn) {
  const mode = ascii(txn?.mode || 'receipt').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const stamp = new Date(txn?.at || Date.now()).toISOString().slice(0, 10)
  return `vanta-${mode || 'receipt'}-receipt-${stamp}.pdf`
}

const nativeShell = () => {
  if (typeof window === 'undefined') return null
  const shell = window.VantaShell
  return shell && typeof shell.saveBase64File === 'function' ? shell : null
}

/**
 * Save the receipt and report what actually happened.
 *
 * @returns {Promise<{ok: boolean, fileName: string, location?: string,
 *   uri?: string, unverified?: boolean, error?: string}>}
 *   `ok` is only true once the file is on disk (native) or the browser has been
 *   asked to download it (`unverified`). The caller must not print "Saved" for
 *   the unverified case.
 *
 *   `uri` is the system handle to the file just written, and it is what makes
 *   `openReceiptFile` possible: on scoped storage a path cannot be handed to a
 *   viewer, so a save that returned no uri means no Open button.
 */
export async function downloadReceiptPdf(txn, network = 'devnet') {
  const href = await buildReceiptPdf(txn, network)
  const fileName = receiptFileName(txn)

  const shell = nativeShell()
  if (shell) {
    try {
      const base64Data = href.slice(href.indexOf(',') + 1)
      const res = JSON.parse(shell.saveBase64File(fileName, 'application/pdf', base64Data) || '{}')
      if (!res.ok) return { ok: false, fileName, error: res.error || 'the app could not write the file' }
      return { ok: true, fileName, location: res.path, uri: res.uri || undefined }
    } catch (err) {
      console.warn('[receipt] native save failed, trying the browser path:', err?.message ?? err)
      return { ok: false, fileName, error: err?.message ?? String(err) }
    }
  }

  try {
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = fileName
    anchor.rel = 'noopener'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    // The DOM gives no completion event for a download. Say so rather than
    // claiming a save we cannot see.
    return { ok: true, fileName, unverified: true }
  } catch (err) {
    return { ok: false, fileName, error: err?.message || String(err) }
  }
}

/**
 * Open a receipt that `downloadReceiptPdf` just wrote, in the system viewer.
 *
 * The point is screenshotting: finding a PDF in a file manager is not something
 * anyone will do, so the receipt has to be one tap from the sheet that produced
 * it. Nothing is written here — the uri comes from the save.
 *
 * @returns {{ok: boolean, error?: string}}
 */
export function openReceiptFile(uri, mimeType = 'application/pdf') {
  const shell = nativeShell()
  if (!shell || typeof shell.openSavedFile !== 'function') {
    return { ok: false, error: 'This build cannot open files yet' }
  }
  if (!uri) return { ok: false, error: 'Nothing was saved to open' }
  try {
    const res = JSON.parse(shell.openSavedFile(uri, mimeType) || '{}')
    if (!res.ok) return { ok: false, error: res.error || 'no app on this device can open this file' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

/**
 * Send a receipt that `downloadReceiptPdf` just wrote to another app — mail, a
 * chat app, a drive.
 *
 * This one has no browser fallback, and it cannot have one. The file lives in
 * the shell's Downloads (or as a `data:` URL, in the browser build), and neither
 * `navigator.share` nor an anchor can hand THOSE BYTES to another app: the Web
 * API that would (`navigator.share({files})`) needs a `File` the page already
 * owns, and the browser build only ever has a data URL. So in a plain browser
 * this reports honestly that it cannot, rather than pretending.
 *
 * @returns {{ok: boolean, error?: string}}
 */
export function shareReceiptFile(uri, mimeType = 'application/pdf') {
  const shell = nativeShell()
  if (!shell || typeof shell.shareSavedFile !== 'function') {
    return { ok: false, error: 'Sharing a receipt needs the Android app' }
  }
  if (!uri) return { ok: false, error: 'Nothing was saved to share' }
  try {
    const res = JSON.parse(shell.shareSavedFile(uri, mimeType) || '{}')
    if (!res.ok) return { ok: false, error: res.error || 'no app on this device can share a file' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}
