import { useEffect, useState } from 'react'
import Drawer from './Drawer'
import { playHaptic } from '../lib/haptic'
import { TOKENS } from '../lib/tokens'
import { shortAddr } from '../lib/format'
import { looksLikeVantaName, resolveVantaName } from '../lib/config'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']

// The keypad send sheet from gemini-code-1789825749253.html (pressKey rules kept
// intact: one decimal point, no leading zeros, backspace floors at "0"), wired to
// Vanta's existing shadowSend / ghostSend / sendSol callbacks.
export default function SendDrawer({
  open,
  onClose,
  selectedToken,
  privateBalance,
  isPrivateMode,
  loading,
  notify,
  addTxn,
  shadowSend,
  ghostSend,
  sendSol,
  mwaAddress,
  onSuccess,
}) {
  const token = TOKENS[selectedToken]
  const [recipient, setRecipient] = useState('')
  const [value, setValue] = useState('0')
  const [sending, setSending] = useState(false)
  // Handle lookup: a `.vanta` recipient is a lookup, not a key. Resolved first,
  // used only when confirmed — never optimistically.
  const [lookup, setLookup] = useState({ state: 'idle' })

  useEffect(() => {
    if (open) {
      setValue('0')
      setSending(false)
      setLookup({ state: 'idle' })
    }
  }, [open])

  const trimmed = recipient.trim()
  const isName = looksLikeVantaName(trimmed)
  const resolvedAddress = isName && lookup.state === 'ok' ? lookup.address : null

  // Debounce: a handle is one request, and typing shouldn't spam the registry.
  useEffect(() => {
    if (!looksLikeVantaName(recipient.trim())) {
      setLookup({ state: 'idle' })
      return undefined
    }
    let cancelled = false
    setLookup({ state: 'pending' })
    const timer = setTimeout(async () => {
      const result = await resolveVantaName(recipient)
      if (cancelled) return
      setLookup(
        result.found
          ? { state: 'ok', address: result.address, name: result.name }
          : { state: 'missing', error: result.error },
      )
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [recipient])

  const press = (key) => {
    playHaptic('tap')
    setValue((current) => {
      if (key === 'del') return current.length > 1 ? current.slice(0, -1) : '0'
      if (key === '.') return current.includes('.') ? current : current + '.'
      if (current === '0') return key
      const [whole, fraction = ''] = current.split('.')
      if (fraction && fraction.length >= token.decimals) return current
      if (!fraction && whole.length >= 12) return current
      return current + key
    })
  }

  const invalidRecipient = () => {
    const to = recipient.trim()
    if (!to) {
      notify('Paste a recipient address first', '⚠️')
      return true
    }
    // A handle resolves to a key first — refuse until it's confirmed to exist.
    if (looksLikeVantaName(to)) {
      if (lookup.state === 'pending') {
        notify('Checking that handle…', '⏳')
        return true
      }
      if (lookup.state !== 'ok') {
        notify(lookup.error || 'That .vanta handle does not exist', '⚠️')
        return true
      }
      return false
    }
    if (to.length < 32 || to.length > 44) {
      notify("That doesn't look like a Solana address", '⚠️')
      return true
    }
    return false
  }

  /** What actually gets sent: a resolved address, never the typed handle. */
  const sendTo = () => resolvedAddress || recipient.trim()

  const handlePrivateSend = async () => {
    if (invalidRecipient()) return
    const amount = parseFloat(value)
    if (!amount || amount <= 0) {
      notify('Enter an amount', '⚠️')
      return
    }
    if (amount > privateBalance) {
      notify('Insufficient private balance', '⚠️')
      return
    }

    setSending(true)
    try {
      const sym = token.symbol
      let sig
      let mode
      let title

      const to = sendTo()
      if (isPrivateMode) {
        try {
          sig = await shadowSend(to, amount, selectedToken)
          mode = 'Shadow'
          title = `Shadow → ${shortAddr(to)}`
          notify('Shadow send complete — amount and counterparty hidden.', '🕳️')
        } catch (err) {
          // Recipient not in the privacy registry → fall back to ghost send
          const msg = String(err?.message || err)
          if (!msg.includes('RECIPIENT_NOT_REGISTERED')) throw err
          console.log('Recipient not registered → falling back to ghost send')
          sig = await ghostSend(to, amount, selectedToken)
          mode = 'Ghost'
          title = `Ghost → ${shortAddr(to)}`
          notify('Recipient not registered — ghost sent. Pool, not you.', '👻')
        }
      } else {
        sig = await ghostSend(to, amount, selectedToken)
        mode = 'Ghost'
        title = `Ghost → ${shortAddr(to)}`
        notify('Ghost send complete — recipient sees the pool, not you.', '👻')
      }

      addTxn(title, `-${amount} ${sym}`, 'expense', true, {
        mode,
        symbol: sym,
        value: amount,
        signature: sig,
        status: 'Confirmed',
      })
      playHaptic('success')
      onSuccess?.({ mode, amount, symbol: sym, signature: sig, counterparty: to })
      setRecipient('')
      setValue('0')
      onClose()
    } catch (err) {
      notify('Failed: ' + (err?.message || err), '⚠️')
      console.error(err)
    }
    setSending(false)
  }

  const handlePublicSend = async () => {
    if (invalidRecipient()) return
    const amount = parseFloat(value)
    if (!amount || amount <= 0) {
      notify('Enter an amount', '⚠️')
      return
    }

    setSending(true)
    try {
      const to = sendTo()
      const sig = await sendSol(to, amount)
      addTxn(`Sent → ${shortAddr(to)}`, `-${amount} SOL`, 'expense', false, {
        mode: 'Public',
        symbol: 'SOL',
        value: amount,
        signature: sig,
        status: 'Confirmed',
      })
      playHaptic('success')
      onSuccess?.({ mode: 'Public', amount, symbol: 'SOL', signature: sig, counterparty: to })
      setRecipient('')
      setValue('0')
      onClose()
    } catch (err) {
      notify('Failed: ' + (err?.message || err), '⚠️')
    }
    setSending(false)
  }

  const busy = sending || loading

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${isPrivateMode ? '🕳️ Shadow' : '👻 Ghost'} Send`}
      subtitle={`From your private balance · ${token.symbol}`}
    >
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/10 border border-accent/20">
        <span className="text-accent">{isPrivateMode ? '🕳️' : '👻'}</span>
        <span className="text-[11px] leading-snug text-accent font-medium">
          {isPrivateMode
            ? 'Encrypted. Paste their Vanta address — or just their name, like `ai.vanta` — from their Receive screen. If they aren’t registered, this falls back to a Ghost send.'
            : `${token.symbol} arrives from the shielded pool, not from you. The payout amount is public.`}
        </span>
      </div>

      <div>
        <label className="text-[11px] font-semibold uppercase text-muted tracking-wider">
          Recipient
        </label>
        <input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          type="text"
          spellCheck={false}
          autoComplete="off"
          placeholder="Address, or name.vanta"
          className="w-full mt-1 bg-black/40 border border-hair rounded-2xl px-4 py-3 text-white text-[13px] font-mono placeholder:text-white/30 focus:outline-none focus:border-accent/50"
        />

        {/* Handle resolution. Only a confirmed address can ever be sent to. */}
        {isName && lookup.state !== 'idle' && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-mono ${
              lookup.state === 'ok'
                ? 'bg-accent/10 border-accent/30 text-accent'
                : lookup.state === 'pending'
                  ? 'bg-white/5 border-hair text-muted'
                  : 'bg-danger/10 border-danger/30 text-danger'
            }`}
          >
            <span aria-hidden="true">
              {lookup.state === 'ok' ? '✓' : lookup.state === 'pending' ? '⋯' : '✕'}
            </span>
            {lookup.state === 'ok' ? (
              <span className="truncate">
                {trimmed} → <b className="font-bold">{shortAddr(lookup.address)}</b>
              </span>
            ) : lookup.state === 'pending' ? (
              <span>Checking {trimmed}…</span>
            ) : (
              <span>{lookup.error || `${trimmed} does not exist`}</span>
            )}
          </div>
        )}

        {mwaAddress && (
          <button
            type="button"
            onClick={() => {
              playHaptic('tap')
              setRecipient(mwaAddress)
            }}
            className="self-start mt-2 px-3 py-1.5 rounded-xl bg-accent/10 border border-accent/25 text-accent font-semibold text-[11px] hover:bg-accent/20 active:scale-95 tap"
          >
            Use my connected wallet
          </button>
        )}
      </div>

      <div className="text-center py-3 bg-black/40 rounded-2xl border border-white/5">
        <span className="text-[11px] font-semibold uppercase text-accent tracking-wider">
          Transfer amount
        </span>
        <div className="text-[40px] font-extrabold text-white mt-0.5 tracking-tight leading-none tnum">
          {value}
          <span className="text-[16px] text-muted font-bold ml-2">{token.symbol}</span>
        </div>
        <span className="text-[11px] text-muted">
          Private balance: {privateBalance.toFixed(selectedToken === 'SOL' ? 4 : 2)} {token.symbol}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2.5 my-1 text-center">
        {KEYS.map((key) => (
          <button
            key={key}
            onClick={() => press(key)}
            className={`py-3.5 text-2xl font-bold bg-white/5 border border-hair rounded-2xl active:bg-accent/20 active:scale-95 tap ${
              key === 'del' ? 'text-xl text-danger active:bg-danger/30' : 'text-white'
            }`}
          >
            {key === 'del' ? '⌫' : key}
          </button>
        ))}
      </div>

      <button
        onClick={handlePrivateSend}
        disabled={busy}
        className="w-full py-4 rounded-2xl bg-accent hover:bg-accent-hi font-bold text-black shadow-lg shadow-accent/20 active:scale-[0.98] tap text-base disabled:opacity-50"
      >
        {sending ? 'Proving...' : isPrivateMode ? '🕳️ Confirm Shadow Send' : '👻 Confirm Ghost Send'}
      </button>

      {!isPrivateMode && (
        <button
          onClick={handlePublicSend}
          disabled={busy}
          className="w-full py-3 rounded-2xl bg-white/10 border border-hair font-semibold text-muted hover:bg-white/20 active:scale-[0.98] tap text-sm disabled:opacity-50"
        >
          or send plain public SOL →
        </button>
      )}
    </Drawer>
  )
}
