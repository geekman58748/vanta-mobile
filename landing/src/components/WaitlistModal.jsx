import { useEffect, useRef, useState } from 'react'
import { WAITLIST_ENDPOINT } from '../config.js'
import { Check } from './Marks.jsx'

/**
 * Waitlist card.
 *
 * A small pop-up card: the page behind it blurs, three short questions and an
 * email field, then a thank-you. Opened by a `vanta:waitlist` window event
 * rather than props, so both placements (the wallet section and the mobile nav
 * sheet) can raise it without threading state through Nav.
 */

const DEVICE = ['Seeker', 'Android phone', 'Emulator', 'Just curious']
const WANTS = ['Privacy', 'Speed', 'Self-custody', 'Simplicity']

const chip = (on) =>
  `rounded-full border px-3.5 py-1.5 text-[13px] transition-colors duration-150 ${
    on
      ? 'border-accent bg-accent-wash text-ink-strong'
      : 'border-hairline bg-canvas text-ink hover:border-hairline-strong hover:text-ink-strong'
  }`

export default function WaitlistModal() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [device, setDevice] = useState('')
  const [wants, setWants] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const cardRef = useRef(null)

  useEffect(() => {
    const onOpen = () => {
      setOpen(true)
      setDone(false)
      setError('')
    }
    window.addEventListener('vanta:waitlist', onOpen)
    return () => window.removeEventListener('vanta:waitlist', onOpen)
  }, [])

  // Escape closes; page scroll is frozen while the card is up.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cardRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  async function submit(e) {
    e.preventDefault()
    if (!email.trim()) {
      setError('An email address is required.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(WAITLIST_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), device, wants, note: note.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.ok === false) throw new Error(body.error || 'Something went wrong')
      setDone(true)
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Join the Vanta waitlist"
    >
      {/* The page blurs behind the card. Clicking it dismisses. */}
      <button
        type="button"
        aria-label="Close"
        onClick={() => setOpen(false)}
        className="absolute inset-0 cursor-default bg-canvas/60 backdrop-blur-md backdrop-saturate-150"
      />

      <div
        ref={cardRef}
        tabIndex={-1}
        className="ring-card relative w-full max-w-[430px] rounded-2xl border border-hairline bg-surface p-6 outline-none"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink-strong"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 4 L12 12 M12 4 L4 12" />
          </svg>
        </button>

        {done ? (
          <div className="py-6 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-hidden-wash text-hidden">
              <Check size={18} />
            </span>
            <h3 className="mt-4 text-[19px] font-semibold text-ink-strong">
              Thank you for joining Vanta
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-subtle">
              We&rsquo;ll email <span className="text-ink">{email.trim()}</span> when the build
              is ready for you.
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 h-11 rounded-xl border border-hairline bg-canvas px-5 text-[14px] font-medium text-ink-strong transition-colors hover:bg-surface-2"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h3 className="pr-8 text-[19px] font-semibold text-ink-strong">
              Join the waitlist
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-subtle">
              A few quick questions so we know who this is for.
            </p>

            <div className="mt-5 space-y-5">
              <fieldset>
                <legend className="text-[12px] font-medium uppercase tracking-wider text-ink-subtle">
                  What are you on?
                </legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DEVICE.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDevice(device === d ? '' : d)}
                      className={chip(device === d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-[12px] font-medium uppercase tracking-wider text-ink-subtle">
                  What matters most?
                </legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WANTS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWants(wants === w ? '' : w)}
                      className={chip(wants === w)}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div>
                <label
                  htmlFor="waitlist-note"
                  className="text-[12px] font-medium uppercase tracking-wider text-ink-subtle"
                >
                  Anything else? <span className="normal-case tracking-normal">(optional)</span>
                </label>
                <input
                  id="waitlist-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={200}
                  className="mt-2 h-11 w-full rounded-xl border border-hairline bg-canvas px-3.5 text-[14px] text-ink-strong outline-none transition-colors placeholder:text-ink-subtle focus:border-accent"
                  placeholder="What would you use it for?"
                />
              </div>

              <div>
                <label
                  htmlFor="waitlist-email"
                  className="text-[12px] font-medium uppercase tracking-wider text-ink-subtle"
                >
                  Email
                </label>
                <input
                  id="waitlist-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-hairline bg-canvas px-3.5 text-[14px] text-ink-strong outline-none transition-colors placeholder:text-ink-subtle focus:border-accent"
                  placeholder="you@domain.com"
                />
              </div>
            </div>

            {error && <p className="mt-4 text-[13px] text-danger">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="mt-6 h-12 w-full rounded-xl bg-accent text-[15px] font-medium text-black transition-colors hover:bg-accent-strong disabled:opacity-60"
            >
              {busy ? 'Joining…' : 'Join the waitlist'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
