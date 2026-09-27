import { useEffect, useState } from 'react'
import { playHaptic } from '../lib/haptic'
import { popSheet, pushSheet } from '../lib/shell'

// The drawer system from gemini-code-1789825749253.html, rewritten as a real
// React component: mount, then transition on the next frame, then unmount after
// the exit transition finishes. Keeps the original 300ms backdrop / 350ms sheet.
export default function Drawer({ open, onClose, title, subtitle, children, sheetClassName = '' }) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)

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
        className={`relative z-10 w-full max-w-[440px] mx-auto bg-card border-t border-hair-hi rounded-t-[36px] px-6 pt-4 pb-10 flex flex-col gap-4 shadow-2xl max-h-[92vh] overflow-y-auto overscroll-contain transform-gpu no-scrollbar transition-transform duration-[300ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
          shown ? 'translate-y-0' : 'translate-y-full'
        } ${sheetClassName}`}
      >
        <div
          className="w-12 h-1.5 bg-white/20 rounded-full mx-auto cursor-pointer shrink-0"
          onClick={close}
        />

        <div className="flex items-center justify-between gap-3 shrink-0">
          <div className="flex flex-col min-w-0">
            <h3 className="text-[20px] font-bold text-white tracking-tight">{title}</h3>
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

        {children}
      </div>
    </div>
  )
}
