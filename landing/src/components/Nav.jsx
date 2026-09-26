import { useCallback, useEffect, useRef, useState } from 'react'
import { VantaMark, SolanaMark, Github, ChevronDown } from './Marks.jsx'
import { GITHUB_URL } from '../config.js'
import StoreBadge from './StoreBadge.jsx'

const LINKS = [
  { label: 'How it works', href: '#how' },
  { label: 'The receipt', href: '#receipt' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Contracts', href: '#contracts' },
]

/**
 * Floating pill nav — behaviour ported from BlackRail's landing page.
 *
 * At the top the pill spans the content shell. Scroll down past 80px and it
 * collapses (.nav-pill.is-shrunk): wordmark text, links, status chip and the
 * GitHub icon all fold away, leaving the mark + the store badge in a small
 * capsule. Scroll back up — or return to the top — and it expands again.
 * The badge (primary action) and the mobile menu button are never hidden.
 *
 * Reading room: once scrolling stops for IDLE_MS while collapsed, the capsule
 * fades out (.nav-pill.is-idle) so the page is unobstructed. Scrolling, moving
 * the pointer back near the bar, or focusing anything inside it brings it back.
 * Opacity + transform only — no layout animation, per motion rule 1.
 */
const IDLE_MS = 900

export default function Nav() {
  const [open, setOpen] = useState(false)
  const [shrunk, setShrunk] = useState(false)
  const [idle, setIdle] = useState(false)
  const idleTimer = useRef(null)

  const wake = useCallback(() => {
    setIdle(false)
    if (idleTimer.current) {
      clearTimeout(idleTimer.current)
      idleTimer.current = null
    }
  }, [])

  const scheduleIdle = useCallback((ms) => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setIdle(true), ms)
  }, [])

  useEffect(() => {
    // Scrolling = still moving through the page; a pause = time to read.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let lastScrollY = window.scrollY

    const onScroll = () => {
      const current = window.scrollY
      if (current > 80 && current > lastScrollY) setShrunk(true)
      else if (current <= 80 || current < lastScrollY) setShrunk(false)
      lastScrollY = current
      wake()
      if (current > 80 && !reduced) scheduleIdle(IDLE_MS)
    }

    // Pointer parked over the bar means it is in use — never fade under it.
    const onPointer = (e) => {
      if (e.clientY > 96 || window.scrollY <= 80) return
      wake()
      if (!reduced) scheduleIdle(IDLE_MS)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pointermove', onPointer, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointermove', onPointer)
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [wake, scheduleIdle])

  // Lock body scroll while the mobile sheet is open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // An open sheet always sits against the full-width pill.
  const collapsed = shrunk && !open
  // Reading room: collapsed + nobody interacting with it.
  const faded = collapsed && idle

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30">
      <div className="flex justify-center pt-4">
        <nav
          aria-label="Main"
          onFocus={wake}
          className={`nav-pill pointer-events-auto ${collapsed ? 'is-shrunk' : ''} ${
            faded ? 'is-idle' : ''
          }`}
        >
          {/* Wordmark — the text drops out when collapsed, the mark stays */}
          <a href="#top" aria-label="Vanta home" className="flex shrink-0 items-center gap-2.5">
            <VantaMark size={28} />
            <span
              className={`font-display text-2xl leading-none tracking-[-0.01em] text-ink-strong ${
                collapsed ? 'hidden' : ''
              }`}
            >
              Vanta
            </span>
          </a>

          {/* Middle cluster — collapses with the pill (links + status + social) */}
          <div
            className="nav-collapse hidden items-center justify-center gap-6 lg:flex"
            aria-hidden={collapsed}
            {...(collapsed ? { tabIndex: -1 } : {})}
          >
            <ul className="flex items-center gap-1">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="rounded-lg px-3 py-2 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-surface-2 hover:text-ink-strong"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>

            <span className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-hairline px-3 text-ink-subtle">
              <SolanaMark size={12} />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
                Built on Solana
              </span>
            </span>

            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Vanta on GitHub"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-ink-strong"
            >
              <Github size={16} />
            </a>
          </div>

          {/* Primary action — present in both states */}
          <div className="hidden shrink-0 lg:block">
            <StoreBadge className="!h-9 !rounded-full !px-3" />
          </div>

          {/* Mobile trigger — never collapses away */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-surface-2 lg:hidden"
          >
            <span className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
              <ChevronDown size={16} />
            </span>
          </button>
        </nav>
      </div>

      {/* Mobile sheet — floats under the pill instead of spanning edge to edge */}
      {open && (
        <div className="pointer-events-auto mx-4 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-canvas/75 backdrop-blur-xl backdrop-saturate-150 lg:hidden">
          <div className="flex flex-col gap-1 p-3">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-[15px] font-medium text-ink transition-colors hover:bg-surface-2 hover:text-ink-strong"
              >
                {l.label}
              </a>
            ))}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl px-3 py-3 text-[15px] font-medium text-ink transition-colors hover:bg-surface-2 hover:text-ink-strong"
            >
              GitHub ↗
            </a>
            <div className="mt-2 px-1">
              <StoreBadge className="w-full justify-center" />
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
