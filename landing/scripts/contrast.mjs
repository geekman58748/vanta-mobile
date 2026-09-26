#!/usr/bin/env node
/**
 * Contrast audit for the Vanta landing token set.
 * design.md requires: body/secondary text ≥ 4.5:1 on the surface it actually
 * sits on, large text and UI graphics ≥ 3:1, focus indicators ≥ 3:1.
 *
 * Run: node scripts/contrast.mjs
 */

const hex = (h) => {
  const s = h.replace('#', '')
  const n = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
}

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

const lum = (h) => {
  const [r, g, b] = hex(h).map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

const T = {
  canvas: '#0a0a0b',
  surface: '#121214',
  surface2: '#18181b',
  surface3: '#1f1f23',
  inkStrong: '#e8e8ea',
  ink: '#c9c9cc',
  inkSubtle: '#8f8f96',
  accent: '#8b7cf6',
  accentStrong: '#6d5ae6',
  accentSoft: '#a79bff',
  hidden: '#5fd68a',
  exposed: '#f5b94a',
  danger: '#f97066',
  white: '#ffffff',
}

/**
 * MEASURED CONSTRAINTS (do not "fix" these by lightening the accent):
 *
 *   #8b7cf6 (accent)      + white = 3.33:1  → accent is NEVER a fill behind white text.
 *   #6d5ae6 (accent-str)  + dark  = 4.01:1  → accent-strong is NEVER a fill behind dark text.
 *
 * So the button system is one-way:
 *   primary  : bg accent-strong, label WHITE   (4.93:1 ✓)
 *   accent   : text, borders, focus rings, washes — never a button fill
 */

// [label, foreground, background, minimum, note]
const checks = [
  ['ink-strong on canvas', T.inkStrong, T.canvas, 4.5, 'headings + display'],
  ['ink on canvas', T.ink, T.canvas, 4.5, 'body copy'],
  ['ink-subtle on canvas', T.inkSubtle, T.canvas, 4.5, 'meta / captions'],
  ['ink-subtle on surface', T.inkSubtle, T.surface, 4.5, 'meta on cards'],
  ['ink-subtle on surface-2', T.inkSubtle, T.surface2, 4.5, 'meta on raised'],
  ['accent on canvas', T.accent, T.canvas, 4.5, 'links + accent text'],
  ['accent-soft on canvas', T.accentSoft, T.canvas, 4.5, 'accent hover text'],
  ['accent on surface-2', T.accent, T.surface2, 4.5, 'links on raised'],
  ['white on accent-strong', T.white, T.accentStrong, 4.5, 'PRIMARY BUTTON fill'],
  ['canvas on accent-soft', T.canvas, T.accentSoft, 4.5, 'dark label on light accent'],
  ['hidden on canvas', T.hidden, T.canvas, 4.5, '"hidden" verdict text'],
  ['exposed on canvas', T.exposed, T.canvas, 4.5, '"visible" verdict text'],
  ['danger on canvas', T.danger, T.canvas, 4.5, 'error text'],
  ['accent as UI graphic on canvas', T.accent, T.canvas, 3, 'focus ring / borders'],
  ['hairline-strong on canvas', '#5d5d63', T.canvas, 3, 'divider (approximated)'],
]

let failed = 0
const pad = (s, n) => String(s).padEnd(n)

console.log(`\n${pad('CHECK', 38)} ${pad('RATIO', 8)} ${pad('MIN', 5)} RESULT`)
console.log('─'.repeat(78))

for (const [label, fg, bg, min, note] of checks) {
  const r = ratio(fg, bg)
  const pass = r >= min
  if (!pass) failed++
  console.log(
    `${pad(label, 38)} ${pad(r.toFixed(2) + ':1', 8)} ${pad(min + ':1', 5)} ${
      pass ? 'PASS' : 'FAIL'
    }  ${note}`,
  )
}

console.log('─'.repeat(78))
console.log(failed === 0 ? '✅ all pairs pass\n' : `❌ ${failed} pair(s) fail\n`)
process.exit(failed === 0 ? 0 : 1)
