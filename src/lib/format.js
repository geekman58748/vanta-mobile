// Address, amount and signature formatters shared by the app shell and drawers.

export const shortAddr = (addr) => (addr ? addr.slice(0, 4) + '...' + addr.slice(-4) : '')

// A signature is the wallet's real "reference code" on a receipt. Show both ends
// so it stays verifiable without wrecking the row width.
export const shortRef = (sig) => {
  if (!sig) return 'pending'
  if (sig.length <= 16) return sig
  return sig.slice(0, 8) + '…' + sig.slice(-6)
}

// The engine's progress strings are written with a leading glyph ("🛡️ Shielding…").
// Pull it into the banner's icon well instead of printing it twice.
export const splitLeadingGlyph = (text = '') => {
  const match = text.match(/^([^\p{L}\p{N}\s]+)\s+/u)
  return match ? { glyph: match[1], text: text.slice(match[0].length) } : { glyph: null, text }
}

// Compact clock stamp stored on every transaction.
export const stampToTime = (at) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export const stampToDate = (at) =>
  new Date(at).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
