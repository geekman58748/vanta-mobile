import { useEffect } from 'react'
import { VantaMark } from './Marks.jsx'
import Reveal from './Reveal.jsx'
import Footer from './Footer.jsx'

/**
 * Shared layout for the Terms of Use and Privacy Policy pages.
 *
 * Built from the same parts as the rest of the site so it reads as one product:
 * the floating pill's brand treatment, `shell` for the container, `measure` for
 * the reading column, the mono eyebrow + display headline the other sections
 * use, and `ring-card` for the one callout per page that carries the sentence
 * that actually matters.
 *
 * Structure mirrors Faq.jsx: sticky section list on the left, content on the
 * right. Real semantics throughout, so the page is one `<h1>` and a stack of
 * `<h2>`s with an `<aside>` of section links.
 *
 * No route dependency: App.jsx picks this component off `location.pathname`,
 * and the host already serves index.html for unknown paths (verified against
 * the live site), so `/terms` and `/privacy` resolve with no extra config.
 */

/** One content block. Four kinds, which is all either document uses. */
function Block({ block }) {
  if (block.type === 'h') {
    return (
      <h3 className="mt-9 text-[15px] font-medium tracking-[-0.01em] text-ink-strong">
        {block.text}
      </h3>
    )
  }

  if (block.type === 'list') {
    return (
      <ul className="mt-5 flex flex-col gap-3">
        {block.items.map((item) => (
          <li key={item} className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-[9px] h-px w-4 shrink-0 bg-hairline-strong"
            />
            <span className="measure text-[14px] leading-[1.75] text-ink-subtle">
              {item}
            </span>
          </li>
        ))}
      </ul>
    )
  }

  if (block.type === 'note') {
    return (
      <p className="ring-card mt-6 rounded-xl bg-surface px-5 py-4 text-[14px] leading-[1.7] text-ink-strong">
        {block.text}
      </p>
    )
  }

  return (
    <p className="measure mt-5 text-[14px] leading-[1.75] text-ink-subtle">
      {block.text}
    </p>
  )
}

export default function Legal({ eyebrow, title, lede, updated, sections, related }) {
  // The page a person shares is the page a person lands on: the tab title has
  // to match the document, not the landing page it is served from.
  useEffect(() => {
    document.title = `${title} · Vanta`
    return () => {
      document.title = 'Vanta · Privacy that shows its work'
    }
  }, [title])

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#top"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface-2 focus:px-4 focus:py-2 focus:text-[13px] focus:text-ink-strong"
      >
        Skip to content
      </a>

      {/* Slim header. Same wordmark treatment as the pill, without the section
          anchors, which do not exist on a legal page. */}
      <header className="fixed inset-x-0 top-0 z-30 border-b border-hairline bg-canvas/75 backdrop-blur-xl backdrop-saturate-150">
        <div className="shell flex h-16 items-center justify-between">
          <a href="/" aria-label="Vanta home" className="flex items-center gap-2.5">
            <VantaMark size={24} />
            <span className="font-display text-2xl leading-none tracking-[-0.01em] text-ink-strong">
              Vanta
            </span>
          </a>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
            Devnet
          </span>
        </div>
      </header>

      <main id="top" className="pt-16">
        <section className="shell pt-16 sm:pt-24">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-subtle">
              {eyebrow}
            </p>
            <h1 className="mt-4 font-display text-[clamp(2.1rem,1.4rem+3vw,3.5rem)] font-normal leading-[1.04] tracking-[-0.03em] text-ink-strong">
              {title}
            </h1>
          </Reveal>
          <Reveal delay={70}>
            <p className="measure mt-6 text-[15px] leading-[1.7] text-ink-subtle">
              {lede}
            </p>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle/80">
              {updated}
            </p>
          </Reveal>
        </section>

        <div className="shell mt-14 border-t border-hairline py-16 sm:mt-16">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            {/* Section list, sticky: the same pattern as Faq.jsx */}
            <aside className="lg:col-span-4" aria-label={`${title} sections`}>
              <div className="lg:sticky lg:top-28">
                <ul className="flex flex-col gap-2.5">
                  {sections.map((s, i) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="group flex items-baseline gap-3 text-[13px] text-ink transition-colors hover:text-ink-strong"
                      >
                        <span className="font-mono text-[11px] text-ink-subtle/70 tnum">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span>{s.h}</span>
                      </a>
                    </li>
                  ))}
                </ul>

                {related ? (
                  <a
                    href={related.href}
                    className="mt-8 inline-flex items-center gap-2 rounded-lg border border-hairline px-3 py-2 text-[12px] text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink-strong"
                  >
                    {related.label}
                    <span aria-hidden="true">→</span>
                  </a>
                ) : null}
              </div>
            </aside>

            {/* Content */}
            <div className="lg:col-span-8">
              {sections.map((s) => (
                <section key={s.id} id={s.id} className="scroll-mt-28">
                  <Reveal>
                    <h2 className="font-display text-[clamp(1.5rem,1.1rem+1.4vw,2rem)] font-normal leading-[1.1] tracking-[-0.03em] text-ink-strong">
                      {s.h}
                    </h2>
                    {s.body.map((block, i) => (
                      <Block key={i} block={block} />
                    ))}
                  </Reveal>
                </section>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
