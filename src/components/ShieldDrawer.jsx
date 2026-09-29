import { useEffect, useMemo, useState } from 'react'
import Drawer from './Drawer'
import { playHaptic } from '../lib/haptic'
import { TOKENS, SHIELD_FEE_RESERVE, maxShieldableSol } from '../lib/tokens'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']

// Presets. SOL leans small because the pool is a devnet pool and a demo wallet
// holds fractions; dUSDC steps are what its own decimals make readable.
const PRESETS = {
  SOL: ['0.05', '0.1', '0.5'],
  dUSDC: ['5', '10', '25'],
}

/**
 * Shield amount sheet — the front door, now with a door handle.
 *
 * Why this exists: `shieldNow` used to hardcode the amount (0.1 SOL / 10 dUSDC).
 * A wallet holding 0.099995 therefore could not shield at all — it could only top
 * up — and the failure surfaced as a wallet-level signing error. The balance guard
 * and the error translation were already fixed; this is the missing half.
 *
 * The one rule that matters here: the depositor is also the fee payer, so "Max"
 * must leave `SHIELD_FEE_RESERVE` behind. Getting that wrong is exactly how the
 * 0.099995 wallet got stranded, so the reserve is imported from lib/tokens rather
 * than re-typed here.
 */
export default function ShieldDrawer({
  open,
  onClose,
  selectedToken,
  balance,
  loading,
  onRequestAirdrop,
  onShield,
}) {
  const token = TOKENS[selectedToken]
  const presets = PRESETS[selectedToken] ?? []
  const [value, setValue] = useState('0')
  const [shielding, setShielding] = useState(false)

  const isSol = selectedToken === 'SOL'
  const maxSol = maxShieldableSol(balance)

  useEffect(() => {
    if (open) {
      setValue('0')
      setShielding(false)
    }
  }, [open])

  const amount = useMemo(() => parseFloat(value) || 0, [value])

  // What the wallet actually needs: the amount, plus the fee, in SOL.
  const requiredSol = isSol ? amount + SHIELD_FEE_RESERVE : SHIELD_FEE_RESERVE
  const shortOnFee = requiredSol > balance
  const overMax = isSol && amount > maxSol
  const tooSmall = amount <= 0
  const blocked = shielding || loading || shortOnFee || overMax || tooSmall

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

  const setMax = () => {
    playHaptic('tap')
    // Floor to the token's own precision so we never build a value the keypad
    // itself would have refused to type.
    const floored = Math.floor(maxSol * 10 ** token.decimals) / 10 ** token.decimals
    setValue(floored > 0 ? String(floored) : '0')
  }

  const confirm = async () => {
    if (blocked) return
    setShielding(true)
    try {
      // onShield owns the tx, the guard re-check and the history row.
      await onShield(amount, selectedToken)
      onClose()
    } finally {
      setShielding(false)
    }
  }

  // One line, always the truth: what goes in, what stays behind, what it costs.
  const footnote = !isSol
    ? `Public SOL pays the network fee. ${SHIELD_FEE_RESERVE.toFixed(6)} SOL is reserved.`
    : shortOnFee        ? `Not enough. Shielding ${amount || 0} needs ${requiredSol.toFixed(6)} SOL. You have ${balance.toFixed(6)}.`
      : `Keeps ${SHIELD_FEE_RESERVE.toFixed(6)} SOL behind for the network fee.`

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Shield"        subtitle="Public balance into your private balance"
    >
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/10 border border-accent/20">
        <span className="text-[11px] leading-snug text-accent font-medium">
          The deposit itself is public. It names your wallet and the amount. What the pool hides is
          where the money goes next.
        </span>
      </div>

      <div className="text-center py-3 bg-black/40 rounded-2xl border border-white/5">
        <span className="text-[11px] font-semibold uppercase text-accent tracking-wider">
          Shield amount
        </span>
        <div className="font-display text-[40px] font-semibold text-white mt-0.5 tracking-[-0.03em] leading-none tnum">
          {value}
          <span className="text-[16px] text-muted font-bold ml-2">{token.symbol}</span>
        </div>
        <span className="text-[11px] text-muted">
          Public balance: {balance.toFixed(isSol ? 6 : 4)} SOL
        </span>
      </div>

      <div className="flex items-center gap-2">
        {presets.map((preset) => (
          <button
            key={preset}
            onClick={() => {
              playHaptic('tap')
              setValue(preset)
            }}
            className={`flex-1 rounded-xl border py-2.5 text-[13px] font-semibold transition-colors tap active:scale-[0.99] ${
              value === preset
                ? 'bg-accent/20 border-accent/40 text-accent'
                : 'bg-white/5 border-hair text-white/80 hover:bg-white/10'
            }`}
          >
            {preset}
          </button>
        ))}
        {isSol && (
          <button
            onClick={setMax}
            disabled={maxSol <= 0}
            className="flex-1 rounded-xl border border-accent/30 bg-accent/10 py-2.5 text-[13px] font-semibold text-accent transition-colors hover:bg-accent/20 active:scale-[0.99] tap disabled:opacity-40"
          >
            Max
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2.5 my-1 text-center">
        {KEYS.map((key) => (
          <button
            key={key}
            onClick={() => press(key)}
            className={`font-display rounded-xl border border-hair bg-white/5 py-3.5 text-2xl font-medium transition-colors active:bg-accent/20 active:scale-[0.99] tap ${
              key === 'del' ? 'text-xl text-danger active:bg-danger/30' : 'text-white'
            }`}
          >
            {key === 'del' ? '⌫' : key}
          </button>
        ))}
      </div>

      <span
        role="status"
        aria-live="polite"
        className={`text-[11px] leading-snug ${shortOnFee || overMax ? 'text-amber-300' : 'text-muted'}`}
      >
        {overMax ? `Max you can shield is ${maxSol.toFixed(6)} SOL. The fee stays behind.` : footnote}
      </span>

      <button
        onClick={confirm}
        disabled={blocked}
        className="btn-accent tap w-full disabled:opacity-50"
      >
        {shielding ? 'Shielding…' : `Shield ${value} ${token.symbol}`}
      </button>

      {(shortOnFee || maxSol <= 0) && (
        <button
          onClick={() => {
            playHaptic('tap')
            onRequestAirdrop?.()
          }}
          disabled={loading}
          className="text-[11px] text-muted hover:text-white transition-colors self-center disabled:opacity-50"
        >
          Not enough to shield? Get SOL from the faucet
        </button>
      )}
    </Drawer>
  )
}
