/**
 * Hand-authored SVG marks and icons.
 *
 * Protocol marks are OUR OWN drawings — not vendor logos copied from the capture.
 * The captured vendor SVGs were 32–51 KB raster-embedded files, and one of them
 * (Umbra) belongs to a competitor we no longer integrate. Drawing them keeps the
 * strip honest and visually consistent in one monochrome treatment.
 *
 * All marks inherit `currentColor` so they take the ink tokens.
 */

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

/* ---------------- Brand ---------------- */

/** Vanta brand mark: a violet tile carrying a descending chevron "V". */
export function VantaMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <rect x="0" y="0" width="30" height="30" rx="9" fill="var(--color-accent-strong)" />
      <path
        d="M9 10.5 L15 19 L21 10.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ---------------- Protocol marks (our own drawings) ---------------- */

/** Helius Rings — concentric orbits. */
export function RingsMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" {...base}>
      <ellipse cx="11" cy="11" rx="9.2" ry="4" />
      <ellipse cx="11" cy="11" rx="9.2" ry="4" transform="rotate(60 11 11)" />
      <ellipse cx="11" cy="11" rx="9.2" ry="4" transform="rotate(120 11 11)" />
      <circle cx="11" cy="11" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** zolana shielded pools — a shield with a pooled core. */
export function ZolanaMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" {...base}>
      <path d="M11 1.8 L19 5.2 V11.2 C19 15.7 15.6 18.9 11 20.2 C6.4 18.9 3 15.7 3 11.2 V5.2 Z" />
      <circle cx="11" cy="10.6" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Solana — three slanted bars. */
export function SolanaMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <g fill="currentColor">
        <path d="M6.4 3.4 H20.4 L17.1 6.9 H3.1 Z" />
        <path d="M3.1 9.3 H17.1 L20.4 12.8 H6.4 Z" />
        <path d="M6.4 15.2 H20.4 L17.1 18.7 H3.1 Z" />
      </g>
    </svg>
  )
}

/** Vanta relayer — a sponsorship relay node. */
export function RelayerMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" {...base}>
      <circle cx="4.4" cy="11" r="2.4" />
      <circle cx="17.6" cy="5.6" r="2.4" />
      <circle cx="17.6" cy="16.4" r="2.4" />
      <path d="M6.6 9.6 L15.5 6.4 M6.6 12.4 L15.5 15.6" />
    </svg>
  )
}

/* ---------------- UI icons ---------------- */

export function ArrowUpRight({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...base} strokeWidth={1.6}>
      <path d="M4.5 11.5 L11.5 4.5 M5.6 4.5 H11.5 V10.4" />
    </svg>
  )
}

export function ChevronDown({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...base} strokeWidth={1.8}>
      <path d="M4 6 L8 10 L12 6" />
    </svg>
  )
}

export function Check({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...base} strokeWidth={2.2}>
      <path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" />
    </svg>
  )
}

export function Copy({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...base} strokeWidth={1.6}>
      <rect x="5.6" y="5.6" width="7.9" height="7.9" rx="1.8" />
      <path d="M10.4 5.6 V4.2 a1.8 1.8 0 0 0-1.8-1.8 H4.2 a1.8 1.8 0 0 0-1.8 1.8 v4.4 a1.8 1.8 0 0 0 1.8 1.8 h1.4" />
    </svg>
  )
}

export function EyeOff({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...base} strokeWidth={1.6}>
      <path d="M6.3 3.4 A6.6 6.6 0 0 1 8 3.2 c3 0 5.6 1.9 6.4 4.8 a7 7 0 0 1-1.6 2.6" />
      <path d="M4.1 4.6 A7 7 0 0 0 1.6 8 c.8 2.9 3.4 4.8 6.4 4.8 a6.7 6.7 0 0 0 3.1-.7" />
      <path d="M2.4 2.4 L13.6 13.6" />
    </svg>
  )
}

export function Alert({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...base} strokeWidth={1.6}>
      <path d="M8 2.6 L14.4 13.4 H1.6 Z" />
      <path d="M8 6.6 v3.1 M8 11.6 v.01" />
    </svg>
  )
}

export function Shield({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" {...base}>
      <path d="M11 2.2 L19 5.4 V11.4 C19 15.8 15.7 19 11 20.2 C6.3 19 3 15.8 3 11.4 V5.4 Z" />
    </svg>
  )
}

export function Ghost({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" {...base}>
      <path d="M4 19.4 V10 a7 7 0 0 1 14 0 v9.4 l-2.3-1.9 -2.3 1.9 -2.35-1.9 -2.35 1.9 -2.3-1.9 Z" />
      <path d="M8.6 9.4 v.01 M13.4 9.4 v.01" strokeWidth={2.2} />
    </svg>
  )
}

export function Shadow({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" {...base}>
      <path d="M11 2.8 L19.2 11 L11 19.2 L2.8 11 Z" />
      <path d="M11 6.6 L15.4 11 L11 15.4 L6.6 11 Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function Android({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <g fill="currentColor">
        <path d="M4.6 12.4 a6.4 6.4 0 0 1 12.8 0 Z" />
        <circle cx="8.2" cy="9.4" r="0.9" fill="var(--color-canvas)" />
        <circle cx="13.8" cy="9.4" r="0.9" fill="var(--color-canvas)" />
        <rect x="4.6" y="13.6" width="12.8" height="5.2" rx="1.6" />
        <rect x="1.7" y="12.6" width="2.1" height="6" rx="1.05" />
        <rect x="18.2" y="12.6" width="2.1" height="6" rx="1.05" />
      </g>
      <path d="M6.9 7.4 L5.6 5.2 M15.1 7.4 L16.4 5.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export function Github({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 .2a8 8 0 0 0-2.53 15.6c.4.07.55-.17.55-.38l-.01-1.49c-2.23.48-2.7-.94-2.7-.94-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.2c0 .21.15.46.55.38A8 8 0 0 0 8 .2Z" />
    </svg>
  )
}

export function Lock({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...base} strokeWidth={1.6}>
      <rect x="2.8" y="7" width="10.4" height="7" rx="1.8" />
      <path d="M5.4 7 V5.2 a2.6 2.6 0 0 1 5.2 0 V7" />
    </svg>
  )
}
