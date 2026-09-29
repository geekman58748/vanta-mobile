import { useEffect, useState } from 'react'
import Drawer from './Drawer'
import { playHaptic } from '../lib/haptic'
import { TOKENS } from '../lib/tokens'
import { shortAddr } from '../lib/format'
import { looksLikeVantaName, resolveVantaName } from '../lib/config'
import { ModeMark } from './Icons'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']

// zolana wraps the real failure. `wallet/transactions.ts` rethrows
// WALLET_BUILD_TRANSFER *over* WALLET_RECIPIENT_NOT_REGISTERED, so the cause has
// to be walked — matching only `err.message` is why the documented Ghost fallback
// never fired on device (it surfaced a raw code instead).
function isRecipientNotRegistered(err) {
  let node = err
  for (let depth = 0; depth < 5 && node; depth += 1) {
    if (/RECIPIENT_NOT_REGISTERED/.test(String(node?.message ?? node))) return true
    node = node?.cause
  }
  return false
}

// Every send failure that reaches a user should say what to do about it. Raw
// SDK codes (WALLET_BUILD_TRANSFER) are translated, and actionable errors are
// passed through untouched.
function friendlySendError(err) {
  const raw = String(err?.cause?.message || err?.message || err)
  if (/timed out/i.test(raw)) return raw
  if (/WALLET_BUILD_TRANSFER|RECIPIENT_NOT_REGISTERED|not registered/i.test(raw)) {
    return 'That address has no shielded balance to receive into. Send it as a Ghost (any public wallet can receive), or ask them for a Vanta address from their Receive screen.'
  }
  if (/insufficient|0x1$|debit an account/i.test(raw)) {
    return 'Not enough in the source balance to cover the amount plus the network fee.'
  }
  return `Send failed: ${raw}`
}

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
  // Nothing that changes the privacy level happens silently. A Shadow send that
  // would have to become a Ghost, or a plain public transfer, stops here and asks.
  // Shape: { kind: 'ghost' | 'public', to, amount }.
  const [pending, setPending] = useState(null)

  useEffect(() => {
    if (open) {
      setValue('0')
      setSending(false)
      setLookup({ state: 'idle' })
      setPending(null)
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
          title = `Shadow to ${shortAddr(to)}`
          notify('Shadow send complete. Amount and counterparty hidden.', '🕳️')
        } catch (err) {
          // Recipient not in the privacy registry → stop and ask, do not downgrade
          // the privacy level on the user's behalf.
          if (isRecipientNotRegistered(err)) {
            setPending({ kind: 'ghost', to, amount })
            setSending(false)
            return
          }
          throw err
        }
      } else {
        sig = await ghostSend(to, amount, selectedToken)
        mode = 'Ghost'
        title = `Ghost to ${shortAddr(to)}`
        notify('Ghost send complete. Recipient sees the pool, not you.', '👻')
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
      notify(friendlySendError(err), '⚠️')
      console.error(err)
    }
    setSending(false)
  }

  /** A plain public transfer: your wallet is the sender and the amount is public. */
  const sendPublicNow = async (to, amount) => {
    setSending(true)
    try {
      const sig = await sendSol(to, amount)
      addTxn(`Sent to ${shortAddr(to)}`, `-${amount} SOL`, 'expense', false, {
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
      notify(friendlySendError(err), '⚠️')
    }
    setSending(false)
  }

  /** Public send is a privacy downgrade, so it asks first instead of firing. */
  const handlePublicSend = () => {
    if (invalidRecipient()) return
    const amount = parseFloat(value)
    if (!amount || amount <= 0) {
      notify('Enter an amount', '⚠️')
      return
    }
    playHaptic('tap')
    setPending({ kind: 'public', to: sendTo(), amount })
  }

  /** Run whatever the user just confirmed. */
  const confirmPending = async () => {
    if (!pending) return
    const { kind, to, amount } = pending
    setPending(null)
    if (kind === 'public') {
      await sendPublicNow(to, amount)
      return
    }
    setSending(true)
    try {
      const sig = await ghostSend(to, amount, selectedToken)
      addTxn(`Ghost to ${shortAddr(to)}`, `-${amount} ${token.symbol}`, 'expense', true, {
        mode: 'Ghost',
        symbol: token.symbol,
        value: amount,
        signature: sig,
        status: 'Confirmed',
      })
      playHaptic('success')
      notify('Ghost send complete. The pool paid, not you.', '👻')
      onSuccess?.({ mode: 'Ghost', amount, symbol: token.symbol, signature: sig, counterparty: to })
      setRecipient('')
      setValue('0')
      onClose()
    } catch (err) {
      notify(friendlySendError(err), '⚠️')
      console.error(err)
    }
    setSending(false)
  }

  const cancelPending = () => {
    playHaptic('tap')
    setPending(null)
  }

  const busy = sending || loading

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${isPrivateMode ? 'Shadow' : 'Ghost'} Send`}
      subtitle={`From your private balance · ${token.symbol}`}
    >
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/10 border border-accent/20">
        <span className="text-accent shrink-0">
          <ModeMark mode={isPrivateMode ? 'Shadow' : 'Ghost'} size={16} />
        </span>
        <span className="text-[11px] leading-snug text-accent font-medium">
          {isPrivateMode
            ? 'Encrypted. Paste their Vanta address, or just their name like `ai.vanta`, from their Receive screen. If they aren’t registered, this falls back to a Ghost send.'
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
                {trimmed} resolves to <b className="font-bold">{shortAddr(lookup.address)}</b>
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
        <div className="font-display text-[40px] font-extrabold text-white mt-0.5 tracking-tight leading-none tnum">
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
            className={`font-display py-3.5 text-2xl font-bold bg-white/5 border border-hair rounded-2xl active:bg-accent/20 active:scale-95 tap ${
              key === 'del' ? 'text-xl text-danger active:bg-danger/30' : 'text-white'
            }`}
          >
            {key === 'del' ? '⌫' : key}
          </button>
        ))}
      </div>

      {pending ? (
        <div
          role="alert"
          className="flex flex-col gap-3 p-4 rounded-2xl bg-danger/10 border border-danger/30"
        >
          <span className="text-[12px] leading-snug text-danger font-semibold">
            {pending.kind === 'ghost'
              ? 'That address is not on Vanta yet, so this cannot be a Shadow send. A Ghost send pays them from the pool, but the amount and the recipient are public on-chain.'
              : 'A public transfer shows your wallet as the sender and the amount on-chain. Anyone can read it.'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={confirmPending}
              className="flex-1 py-3 rounded-xl bg-danger/25 border border-danger/40 font-bold text-danger hover:bg-danger/35 active:scale-[0.98] tap text-sm"
            >
              {pending.kind === 'ghost' ? 'Send as Ghost' : 'Send publicly'}
            </button>
            <button
              onClick={cancelPending}
              className="flex-1 py-3 rounded-xl bg-white/10 border border-hair font-semibold text-muted hover:bg-white/20 active:scale-[0.98] tap text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={handlePrivateSend}
            disabled={busy}
            className="btn-accent tap w-full disabled:opacity-50"
          >
            {sending ? 'Proving…' : isPrivateMode ? 'Confirm Shadow send' : 'Confirm Ghost send'}
          </button>

          {!isPrivateMode && (
            <button
              onClick={handlePublicSend}
              disabled={busy}
              className="btn-quiet tap w-full disabled:opacity-50"
            >
              or send plain public SOL
            </button>
          )}
        </>
      )}
    </Drawer>
  )
}
