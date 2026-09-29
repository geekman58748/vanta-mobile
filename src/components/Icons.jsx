// ── THE MARK SET ────────────────────────────────────────────────────────────
// Every one of these was a colour emoji (🛡️ 🕳️ 👻 ↑ ↓) sitting in a rounded
// well in the transaction rows, the send sheet titles and the settings list.
//
// Emoji are a font, and a font is the wrong tool here: they carry their own
// palette, they are redrawn by every OEM (so "the shield" is a different picture
// on a Xiaomi than on a Pixel), and they cannot inherit `currentColor`, which
// means they cannot take the accent, a muted grey, or a hover state. On a
// near-black canvas they were also the only saturated thing on screen — the
// reason a row full of them reads as a toy next to the site.
//
// These are stroke SVGs in the same language the app already uses for its action
// icons (the shield on the Shield button, the send/receive arrows in the
// header), so they inherit colour and scale with the text around them.
//
// ⚠ Toasts keep their emoji on purpose — that is the one surface where a
// colourful glyph reads as friendly rather than as a sticker, and the user asked
// for it explicitly. See Toast.jsx.

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
}

/** Shield — public → private. Same mark as the Shield action button. */
export function IconShield({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE}>
      <path d="M12 2.5 5 5.7v5.4c0 4.4 3 8.1 7 9.4 4-1.3 7-5 7-9.4V5.7L12 2.5Z" />
      <circle cx="12" cy="10.8" r="1.5" />
      <path d="M12 12.3V15" />
    </svg>
  )
}

/** Shadow — private → private. A vault: the money never surfaces. */
export function IconShadow({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="10.6" r="2" />
      <path d="M12 12.6V15" />
    </svg>
  )
}

/** Ghost — private → any wallet. Paid out of the pool, above the ledger line. */
export function IconGhost({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE}>
      <path d="M4 20h16" />
      <path d="M12 16V4" />
      <path d="M8 8l4-4 4 4" />
    </svg>
  )
}

/** Incoming — a deposit into this device. */
export function IconIn({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE}>
      <path d="M4 20h16" />
      <path d="M12 4v12" />
      <path d="M8 12l4 4 4-4" />
    </svg>
  )
}

/** Outgoing — a plain transfer out. */
export function IconOut({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE}>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </svg>
  )
}

/** Padlock — used by the backup rows in Settings. */
export function IconLock({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  )
}

/**
 * Row mark for a transaction: the flow it belongs to, or its direction when the
 * flow is not one of the three private ones (a public send, a received credit).
 */
export function ModeMark({ mode, type, size = 18 }) {
  if (mode === 'Shield') return <IconShield size={size} />
  if (mode === 'Shadow') return <IconShadow size={size} />
  if (mode === 'Ghost') return <IconGhost size={size} />
  return type === 'income' ? <IconIn size={size} /> : <IconOut size={size} />
}
