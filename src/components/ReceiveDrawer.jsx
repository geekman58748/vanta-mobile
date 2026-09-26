import Drawer from './Drawer'
import { copyText } from '../lib/clipboard'

// Receive sheet. Two destinations, because Vanta has two:
//  · the public on-ramp (universal, visible on-chain)
//  · the registered Vanta identity (what another Vanta user Shadow-sends to)
export default function ReceiveDrawer({ open, onClose, wallet, vantaAddress, notify }) {
  return (
    <Drawer open={open} onClose={onClose} title="Receive" subtitle="Two destinations, two privacy levels">
      <div className="flex justify-center my-1">
        <div className="p-4 bg-white rounded-3xl shadow-2xl border-4 border-accent/20">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=solana:${wallet.publicKey}`}
            alt="Public address QR"
            className="w-40 h-40 rounded-xl"
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Public address · anyone can pay
        </span>
        <span className="text-[11px] font-mono text-white/80 break-all px-2">{wallet.publicKey}</span>
        <span className="text-[11px] leading-snug text-muted px-3">
          Lands in your public balance and is visible on-chain. Tap Shield to move it into your
          private balance.
        </span>
      </div>

      <button
        onClick={() => copyText(wallet.publicKey, notify, 'Public address copied!', '📥')}
        className="w-full py-3.5 rounded-2xl bg-white/10 border border-hair font-bold text-white hover:bg-white/20 active:scale-[0.98] transition-all text-sm"
      >
        Copy public address
      </button>

      <div className="w-full h-px bg-white/10" />

      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
          Vanta address · private receive
        </span>
        <span className="text-[11px] font-mono text-accent break-all px-2">
          {vantaAddress || 'initializing…'}
        </span>
        <span className="text-[11px] leading-snug text-muted px-3">
          Give this to another Vanta user. Their Shadow send lands straight in your private balance —
          amount and sender hidden. A plain SOL/SPL transfer cannot reach it.
        </span>
      </div>

      <button
        disabled={!vantaAddress}
        onClick={() => copyText(vantaAddress, notify, 'Vanta address copied!', '🕳️')}
        className="w-full py-3.5 rounded-2xl bg-accent/15 border border-accent/30 font-bold text-accent hover:bg-accent/25 active:scale-[0.98] transition-all text-sm disabled:opacity-40"
      >
        Copy Vanta address
      </button>
    </Drawer>
  )
}
