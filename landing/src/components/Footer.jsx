import { useEffect, useRef } from 'react'
import { VantaMark, SolanaMark, Github, ArrowUpRight } from './Marks.jsx'
import { GITHUB_URL, SOCIALS } from '../config.js'
import Reveal from './Reveal.jsx'
import FooterSceneMarble from './FooterSceneMarble.jsx'

/**
 * Footer — finale, adapted to Vanta.
 *
 * Two parts, in the reference's order:
 *   1. The scene — vertical sky falloff, a scroll-revealed line, then a giant
 *      wordmark that fades into the horizon, sandwiched between two artwork
 *      plates (hills at z-1 behind it, brush at z-10 in front of it). Same
 *      z-index sandwich as the reference: gradient (z-auto) → wordmark (z-0)
 *      → hills (z-1) → brush (z-10) → bar (z-20).
 *   2. The utility bar — every Vanta detail the reference pattern would have
 *      thrown away: brand blurb, socials, three link columns, the legal paragraph
 *      and the "Built on Solana" mark. The devnet/unaudited disclosure is stated
 *      once, inside that paragraph; the © row is only the copyright, so the bar
 *      doesn't repeat it three times on the way past.
 *
 * Artwork is plates/hills-bg.webp + plates/bushes-fg.webp (copied from the
 * reference snapshot for this test) — swap before shipping.
 *
 * Two things differ from the reference on purpose:
 *
 * 1. Plate grading. The reference ships the far hills at opacity-30 / brightness-0.5
 *    and the near bushes at brightness-0.5, which on this art (opaque-pixel
 *    luminance p50 ≈ 18) composites to ~2-7/255 against the canvas — the
 *    landscape is invisible. Reference values, for a one-line revert: hills
 *    opacity-30 brightness-[0.5] saturate-[0.7], bushes brightness-[0.5]
 *    saturate-[0.8].
 * 2. The far hills carry a mask on their top edge. `object-cover` crops ~25% of
 *    the plate's height off the top, so the box edge lands inside opaque hill
 *    body and reads as a straight cut — a black field, then a band of landscape.
 *    The mask fades exactly that cropped band back out, so the ridge emerges
 *    from the dark instead of starting at a hard line. Keep the mask in step
 *    with the plate height if either one moves.
 * Motion: the scene is static; only the line uses the shared Reveal, so the
 * receipt stays the page's one authored moment (design.md motion rule 7).
 */

/**
 * Scene parallax — three layers drifting at different rates as the scene passes
 * through the viewport, so the ridge, the wordmark and the brush read as separate
 * planes instead of one flat picture. Scroll-driven and transform-only, one rAF
 * per frame (the Nav.jsx convention), and it never runs under reduced motion.
 *
 * The frame value lands on the section as --plate-p; each layer multiplies it in
 * its own transform, so this effect never touches a React-owned style.
 *
 * Progress is centred on the reader's resting position, not on the middle of the
 * section's pass. The footer is the last thing on the page, so you always end up
 * parked at the bottom of the document: at that point --plate-p is 0 and the scene
 * sits exactly as composed, and the plates drift as you scroll away from it. With
 * the ramp centred on the middle of the pass instead, the resting state would be a
 * half-spent one — the brush parked 85px high, eating ~72% of the wordmark.
 *
 * --plate-p runs 0 at rest → −1 once the scene is spent, over
 * (viewportH + sectionH) / 2 ≈ 700px of scrolling on a 1440×900 window, so a pair
 * of amplitudes reads as
 *
 *     relative rate = (|hills| + |brush|) / ((viewportH + sectionH) / 2)
 *
 * The first pass used ±30/∓22 over a twice-as-long window: a 7% relative rate,
 * about 2px per wheel notch, which reads as static. These are ±80/∓140 — a ~31%
 * rate, in line with the reference hero (34vh/95vh). Anything under ~20% will not
 * be felt. The masks below assume this much travel: both plates fade at BOTH ends
 * so a separated pair never shows a hard plate edge. Shrink the masks if you
 * shrink the amplitudes; grow them together or the crop line comes back.
 */
function usePlateParallax() {
  const scene = useRef(null)

  useEffect(() => {
    const node = scene.current
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    const paint = () => {
      frame = 0
      const vh = window.innerHeight
      // 0 at the reader's resting position (the bottom of the document, since the
      // footer is last), −1 once the scene is spent one screenful further up.
      const rest = Math.max(0, document.documentElement.scrollHeight - vh)
      const span = (vh + node.getBoundingClientRect().height) / 2
      const p = (window.scrollY - rest) / span
      node.style.setProperty('--plate-p', Math.max(-1, Math.min(1, p)).toFixed(3))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }

    paint()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return scene
}

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '#how' },
      { label: 'The receipt', href: '#receipt' },
      { label: 'Contracts', href: '#contracts' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'Source code', href: GITHUB_URL, external: true },
      { label: 'zolana SDK', href: 'https://github.com/helius-labs/zolana', external: true },
      { label: 'Solana Explorer', href: 'https://explorer.solana.com', external: true },
    ],
  },
  {
    title: 'Status',
    links: [
      { label: 'Devnet only', href: '#faq' },
      { label: 'Not audited', href: '#faq' },
      { label: 'Report a bug', href: GITHUB_URL, external: true },
    ],
  },
]

export default function Footer() {
  const scene = usePlateParallax()
  // The classical experiment is opt-in. The landscape finale stays the default
  // until it has been looked at and chosen, so reverting is doing nothing at
  // all — no restore step, no risk of a botched one.
  const marble = new URLSearchParams(window.location.search).get('scene') === 'marble'

  return (
    <footer className="relative">
      {/* ================================================================
          1 — THE SCENE
          ================================================================ */}
      <section ref={scene} className="relative overflow-hidden">
        {/* Sky: neutral falloff that starts and ends on the canvas value, so the
            scene melts into the page above and the utility bar below with no
            seam — the earlier version lifted past the canvas and read as a
            separate grey band. It dips darker through the middle instead, which
            is what the ridge needs for depth, and never leaves the neutral
            family (design.md bans coloured washes behind text). The only colour
            is the radial accent falloff below, ≤20% alpha (the one allowed
            medium). */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, var(--color-canvas) 0%, #000000 34%, #050506 62%, var(--color-canvas) 100%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-[14%] h-[40%] opacity-[0.18] blur-3xl"
          style={{
            background: 'radial-gradient(closest-side, var(--color-accent-strong), transparent 76%)',
          }}
        />

        {/* Revealed line — same Reveal primitive as every other section */}
        <div className="relative z-20 mx-auto max-w-[1280px] px-5 pt-24 text-center sm:px-6 md:pt-32">
          <Reveal>
            <p className="font-display text-[clamp(1.5rem,1rem+2vw,2.375rem)] leading-[1.15] tracking-[-0.02em] text-ink-strong">
              Read the receipt.
            </p>
          </Reveal>
        </div>

        {/* Stage — landscape finale by default, classical experiment behind
            ?scene=marble. The branch is deliberately additive: everything below
            it is untouched, and the marble stage lives in its own file. */}
        {marble ? (
          <FooterSceneMarble />
        ) : (
        <div className="relative mt-10 h-[46vh] min-h-[320px] select-none md:mt-12 md:h-[56vh]">
          {/* z-2: in front of the far hills, behind the brush. Sitting under the
              hills washed the letterforms out a second time on top of their own
              fade, which is what made the wordmark read as barely-there. */}
          <div
            className="absolute inset-x-0 bottom-[clamp(56px,calc(10vw-30px),220px)] z-[2] flex justify-center px-4 will-change-transform"
            style={{ transform: 'translate3d(0, calc(var(--plate-p, 0) * -20px), 0)' }}
          >
            <span
              className="bg-clip-text text-center font-display text-[clamp(7rem,26vw,22rem)] leading-[0.85] tracking-[-0.045em] text-transparent"
              style={{
                background:
                  'linear-gradient(to bottom, #f2f2f4 0%, rgba(242,242,244,0.95) 62%, rgba(242,242,244,0.55) 100%)',
                WebkitBackgroundClip: 'text',
              }}
            >
              Vanta
            </span>
          </div>

          {/* Back plate. The mask feathers the cropped sky band so the ridge
              emerges from the dark (see note 2 in the file header). */}
          <img
            src="/plates/hills-bg.webp"
            alt=""
            aria-hidden="true"
            decoding="async"
            draggable="false"
            className="pointer-events-none absolute inset-x-0 bottom-[8%] z-[1] h-[clamp(150px,26vw,380px)] w-full select-none object-cover object-bottom opacity-[0.7] brightness-[1.05] contrast-[1.05] saturate-[0.85] will-change-transform"
            style={{
              maskImage:
                'linear-gradient(to bottom, transparent 0%, #000 24%, #000 58%, transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to bottom, transparent 0%, #000 24%, #000 58%, transparent 100%)',
              transform: 'translate3d(0, calc(var(--plate-p, 0) * 80px), 0)',
            }}
          />

          {/* Front plate — physically occludes the wordmark, and the layer that
              moves most: it rises as you scroll in and swallows more of the
              wordmark the further you go. */}
          <img
            src="/plates/bushes-fg.webp"
            alt=""
            aria-hidden="true"
            decoding="async"
            draggable="false"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[clamp(130px,22vw,440px)] w-full origin-bottom select-none object-cover object-bottom brightness-[0.42] saturate-[0.8] will-change-transform"
            style={{
              maskImage: 'linear-gradient(to bottom, transparent 0%, #000 22%, #000 88%, transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to bottom, transparent 0%, #000 22%, #000 88%, transparent 100%)',
              transform: 'translate3d(0, calc(var(--plate-p, 0) * -140px), 0)',
            }}
          />
        </div>
        )}
      </section>

      {/* ================================================================
          2 — THE UTILITY BAR (all original Vanta content, unchanged copy)
          ================================================================ */}
      <div className="relative z-20 border-t border-hairline bg-canvas">
        <div className="shell py-16">
          <Reveal>
            <div className="grid gap-12 lg:grid-cols-12">
              {/* Brand */}
              <div className="lg:col-span-5">
                <div className="flex items-center gap-2.5">
                  <VantaMark size={28} />
                  <span className="font-display text-2xl leading-none tracking-[-0.01em] text-ink-strong">
                    Vanta
                  </span>
                </div>
                <p className="measure mt-5 text-[14px] leading-relaxed text-ink-subtle">
                  A privacy wallet for Solana. Shadow-send to another Vanta and your amount and
                  recipient never appear on-chain — and you get a receipt that says exactly what
                  still does.
                </p>
                <div className="mt-6 flex items-center gap-2">
                  {SOCIALS.map((s) => (
                    <a
                      key={s.label}
                      href={s.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-hairline px-3 text-[12px] text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink-strong"
                    >
                      {s.label === 'GitHub' ? <Github size={13} /> : null}
                      {s.label}
                      <ArrowUpRight size={11} />
                    </a>
                  ))}
                </div>
              </div>

              {/* Link columns */}
              <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
                {COLUMNS.map((col) => (
                  <div key={col.title}>
                    <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
                      {col.title}
                    </h3>
                    <ul className="mt-4 flex flex-col gap-2.5">
                      {col.links.map((l) => (
                        <li key={l.label}>
                          <a
                            href={l.href}
                            {...(l.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                            className="text-[13px] text-ink transition-colors hover:text-ink-strong"
                          >
                            {l.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <div className="mt-14 border-t border-hairline pt-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] text-ink-subtle">© {new Date().getFullYear()} Vanta.</p>
              <span className="inline-flex items-center gap-2 text-ink-subtle">
                <SolanaMark size={12} />
                <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
                  Built on Solana
                </span>
              </span>
            </div>

            {/* Kept full-width: running this as a narrow column under STATUS ran it
                to 9 lines and pushed the bar from 484px to 591px, so the shorter
                bar it was meant to buy never appeared. */}
            <p className="measure mt-5 text-[11.5px] leading-relaxed text-ink-subtle/80">
              Vanta is devnet software: unaudited, not for real funds. It is not a bank or a
              custodial service. Funds moved into the shielded pool are held by an upgradeable
              on-chain program, not by us. Nothing on this page is financial advice. Receipts shown
              are real transactions and may not reflect future builds.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
