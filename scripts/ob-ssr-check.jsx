/**
 * ob-ssr-check.jsx — render the onboarding to static HTML and eyeball it.
 *
 * WHY: headless Chrome is unusable on this machine (it crashes before paint and
 * a --screenshot comes back as a crash page, which is how an earlier session was
 * misled into thinking the page rendered white). A DOM dump proves nothing when
 * the browser never got that far.
 *
 * Rendering through react-dom/server instead verifies the things that actually
 * break: that the component mounts without throwing, that the copy is what we
 * intend, and that no blue from the source template survived. It cannot verify
 * pixels — that still needs a human eye — but it catches a blank screen.
 *
 * Runs via:  npx vite build --ssr scripts/ob-ssr-check.jsx --outDir /tmp/ob-ssr
 *            node /tmp/ob-ssr/ob-ssr-check.js
 */
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import Onboarding from '../src/components/Onboarding.jsx'

const render = (initialStep) =>
  renderToStaticMarkup(React.createElement(Onboarding, { onDone: () => {}, initialStep }))

// Each step is its own tree, so render all three — a broken step 2 or 3 would
// otherwise only surface on a real device, mid-demo.
const s1 = render(0)
const s2 = render(1)
const s3 = render(2)
const all = s1 + s2 + s3

const lines = [
  ['HTML length (all 3 steps)', String(all.length)],
  ['mounts without throwing', 'yes'],
  ['step 1 eyebrow "Private by default"', s1.includes('Private by default') ? 'PASS' : 'FAIL'],
  ['step 1 headline "Hidden amounts"', s1.includes('Hidden amounts') ? 'PASS' : 'FAIL'],
  ['step 1 "Hidden recipients"', s1.includes('Hidden recipients') ? 'PASS' : 'FAIL'],
  ['private note object rendered', s1.includes('ob-note-front') ? 'PASS' : 'FAIL'],
  ['redaction bar rendered', all.includes('ob-redact') ? 'PASS' : 'FAIL'],
  ['topo field rendered', all.includes('ob-waves') ? 'PASS' : 'FAIL'],
  ['shimmer wrapper rendered', all.includes('ob-shimmer-wrap') ? 'PASS' : 'FAIL'],
  ['exactly one step mounted per render', (s1.match(/ob-step-fwd|ob-step-back/g) || []).length === 1 ? 'PASS' : 'FAIL'],
  ['dots rendered (3)', (s1.match(/Go to step /g) || []).length === 3 ? 'PASS' : 'FAIL'],
  ['next button rendered', s1.includes('aria-label="Next"') ? 'PASS' : 'FAIL'],
  ['skip button says Skip on step 1', s1.includes('>Skip<') ? 'PASS' : 'FAIL'],
  ['last step says Done', s3.includes('>Done<') ? 'PASS' : 'FAIL'],
  ['uses accent token', all.includes('text-accent') ? 'PASS' : 'FAIL'],
  ['uses canvas token', all.includes('bg-canvas') ? 'PASS' : 'FAIL'],
  ['--- brand mark ---', ''],
  ['step 1 renders the logo', s1.includes('vanta-logo') ? 'PASS' : 'FAIL'],
  ['step 1 logo has alt="Vanta"', /<img[^>]*alt="Vanta"/.test(s1) ? 'PASS' : 'FAIL'],
  ['step 1 logo is sized (not natural 256px)', /vanta-logo[^"]*"[^>]*class="[^"]*h-14 w-14/.test(s1) ? 'PASS' : 'FAIL'],
  ['logo appears once per step (no clutter)', (s2.match(/vanta-logo/g) || []).length === 0 && (s3.match(/vanta-logo/g) || []).length === 0 ? 'PASS' : 'FAIL'],
  ['--- step 2 ---', ''],
  ['step 2 eyebrow "No sign-up"', s2.includes('No sign-up') ? 'PASS' : 'FAIL'],
  ['step 2 "the account" headline', s2.includes('the account') ? 'PASS' : 'FAIL'],
  ['step 2 scanner frame rendered', s2.includes('ob-scanner') ? 'PASS' : 'FAIL'],
  ['step 2 portrait img rendered', s2.includes('<img') ? 'PASS' : 'FAIL'],
  ['step 2 keys-stay-here copy', /never leave|This device is the whole wallet/i.test(s2) ? 'PASS' : 'FAIL'],
  ['--- step 3 ---', ''],
  ['step 3 eyebrow "You are set"', s3.includes('You are set') ? 'PASS' : 'FAIL'],
  ['step 3 "nobody can read"', /nobody can read/i.test(s3) ? 'PASS' : 'FAIL'],
  ['step 3 3D perspective rendered', s3.includes('ob-perspective') ? 'PASS' : 'FAIL'],
  ['step 3 back note rendered', s3.includes('ob-note-back') ? 'PASS' : 'FAIL'],
  ['step 3 hand graphic rendered', s3.includes('<svg') ? 'PASS' : 'FAIL'],
  ['--- banned from the source template ---', ''],
  ['NO blue #2b6eff', all.includes('#2b6eff') ? 'FAIL' : 'PASS'],
  ['NO blue #1e60ff', all.includes('#1e60ff') ? 'FAIL' : 'PASS'],
  ['NO VISA', /visa/i.test(all) ? 'FAIL' : 'PASS'],
  ['NO FLUX / FŁUX brand', /flux|fłux/i.test(all) ? 'FAIL' : 'PASS'],
  ['NO biometrics claim', /biometric/i.test(all) ? 'FAIL' : 'PASS'],
  ['NO "Save. Earn. Invest. Send"', /Save\. Earn/i.test(all) ? 'FAIL' : 'PASS'],
  ['NO "Not a bank. Better"', /Not a bank/i.test(all) ? 'FAIL' : 'PASS'],
  ['NO "No Logins"', /No Logins/i.test(all) ? 'FAIL' : 'PASS'],
]

console.log('\n─── Onboarding SSR check ───')
let failed = 0
for (const [label, value] of lines) {
  if (value === 'FAIL') failed++
  console.log(label.padEnd(46), value)
}
console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAILED') + '\n')
