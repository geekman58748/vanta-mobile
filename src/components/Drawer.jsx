import { useEffect, useRef, useState } from 'react'
import { playHaptic } from '../lib/haptic'
import { popSheet, pushSheet } from '../lib/shell'

// The drawer system from gemini-code-1789825749253.html, rewritten as a real
// React component: mount, then transition on the next frame, then unmount after
// the exit transition finishes. Keeps the original 300ms backdrop / 350ms sheet.
//
// LAYOUT — why the body is its own scroll container
// ------------------------------------------------
// The sheet used to be one `max-h-[92vh] overflow-y-auto` flex column holding
// everything, handle and screen title included. That looks like it scrolls, and
// on a short phone it did the opposite: a child of a flex column with
// `overflow-*` has a min-height of 0, so the two blocks that already scrolled on
// their own — the filter rail (`overflow-x-auto`) and the activity list in
// Privacy analytics (`max-h-[38vh] overflow-y-auto`) — were the first things
// allowed to give up their height. They were squashed to nothing under the pool
// totals instead of the sheet scrolling, which is exactly what "the filters and
// the transactions are compressed under Into/Out of the pool" is.
//
// So: handle + title are pinned and can never be squashed (they are `shrink-0`
// and outside the scroller), and the body is the one place that scrolls. The
// body keeps the flex column so children still get the `gap-4` spacing they
// always had, but every direct child is pinned to its natural height
// (`[&>*]:shrink-0`) — a sheet can be too tall, it just cannot compress its
// contents. Sheets that want a single inner list to scroll instead opt out with
// `bodyClassName`.
//
// The bottom hint exists because the sheet has no scrollbar anywhere (the app
// hides ::-webkit-scrollbar globally). Without it, a sheet whose content ran
// past the fold read as a sheet that had ended — the rest was simply invisible.
export default function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  sheetClassName = '',
  bodyClassName = '',
}) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const [moreBelow, setMoreBelow] = useState(false)
  const bodyRef = useRef(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const frame = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(frame)
    }
    setShown(false)
    const timer = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(timer)
  }, [open])

  // Hold the page still while a sheet is up, and stand the native
  // pull-to-refresh down. Both are ref-counted in lib/shell so a sheet handing
  // off to the next one can never unlock them early (which used to leave the app
  // permanently unscrollable, and reload the shell on a downward drag).
  useEffect(() => {
    if (!mounted) return
    pushSheet()
    return () => popSheet()
  }, [mounted])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Re-measure on every render (children change when a filter does) and on
  // resize / rotation. Reading scrollHeight forces layout, which is what we want
  // here: the check has to reflect what is on screen right now.
  useEffect(() => {
    if (!mounted) return
    const el = bodyRef.current
    if (!el) return
    const measure = () => {
      const rest = el.scrollHeight - el.scrollTop - el.clientHeight
      // 8px of slack: sub-pixel layout rounding should not leave a hint hanging
      // over a sheet that is in fact scrolled to the end.
      setMoreBelow((was) => {
        const next = rest > 8
        return was === next ? was : next
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [mounted, children])

  if (!mounted) return null

  const close = () => {
    playHaptic('tap')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        onClick={close}
        className={`absolute inset-0 bg-black/80 transition-opacity duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        className={`relative z-10 w-full max-w-[440px] mx-auto bg-card border-t border-hair-hi rounded-t-[36px] shadow-2xl flex flex-col max-h-[92vh] overflow-hidden transform-gpu transition-transform duration-[300ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
          shown ? 'translate-y-0' : 'translate-y-full'
        } ${sheetClassName}`}
      >
        {/* Pinned. The close button has to survive a sheet that scrolls, and a
            title that slides away under a long list reads as a lost screen. */}
        <div className="shrink-0 px-6 pt-4 pb-4 flex flex-col gap-4">
          <div
            className="w-12 h-1.5 bg-white/20 rounded-full mx-auto cursor-pointer"
            onClick={close}
          />

          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <h3 className="font-display text-[20px] font-bold text-white tracking-tight">{title}</h3>
              {subtitle && <span className="text-[12px] text-muted">{subtitle}</span>}
            </div>
            <button
              onClick={close}
              aria-label="Close"
              className="w-8 h-8 shrink-0 rounded-full bg-white/10 text-muted flex items-center justify-center hover:text-white active:scale-90 tap"
            >
              ✕
            </button>
          </div>
        </div>

        {/* No top padding: the pinned block above owns that spacing, so a child
            that pins itself with `sticky top-0` (the filter rail) lands flush on
            the body's edge with no strip of scrolling content above it. */}
        <div
          ref={bodyRef}
          className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain no-scrollbar px-6 pb-10 flex flex-col gap-4 [&>*]:shrink-0 ${bodyClassName}`}
        >
          {children}
        </div>

        {moreBelow && (
          // Small on purpose. The body already ends in 40px of padding, so at the
          // bottom of the scroll nothing is covered and the hint is gone; a
          // taller fade would sit over the last card (or a CTA) while the user is
          // still travelling through the sheet.
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 flex items-end justify-center bg-gradient-to-t from-card via-card/70 to-transparent pb-2"
          >
            <span className="font-display text-[10px] text-muted border border-hair bg-card/95 rounded-full px-2.5 py-1">
              Scroll for more ↓
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
