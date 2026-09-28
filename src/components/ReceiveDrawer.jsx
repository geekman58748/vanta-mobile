import { useEffect, useState } from 'react'
import Drawer from './Drawer'
import { copyText } from '../lib/clipboard'
import { ownedNames } from '../lib/names'

// Receive sheet. Two destinations, because Vanta has two:
//  · the public on-ramp (universal, visible on-chain)
//  · the registered Vanta identity (what another Vanta user Shadow-sends to)
//
// The claimed `.vanta` handle is surfaced here too: a handle nobody can see is a
// handle nobody uses, and senders should not have to ask for it out of band.
//
// The QR is generated ON DEVICE. It used to be an <img> pointing at
// `api.qrserver.com` with the wallet address in the query string, which meant
// opening this sheet told a third-party image host which wallet was using Vanta
// (AUDIT-2026-09-27 M1) — and it broke the moment the phone had no network, in
// the one flow (receiving) that otherwise needs none. `qrcode` is a lazy chunk,
// so it costs the dashboard nothing, and the wallet's own address never has to
// leave the device to be shown back to its owner.
export default function ReceiveDrawer({ open, onClose, wallet, vantaAddress, notify }) {
  const [owned, setOwned] = useState([])
  const [qr, setQr] = useState(null)

  useEffect(() => {
    if (!open || !vantaAddress) return undefined
    let cancelled = false
    ownedNames(vantaAddress).then((rows) => {
      if (!cancelled) setOwned(rows)
    })
    return () => {
      cancelled = true
    }
  }, [open, vantaAddress])

  useEffect(() => {
    const address = wallet?.publicKey
    if (!open || !address) {
      setQr(null)
      return undefined
    }
    let cancelled = false
    // Solana Pay style URI, the same string that was being sent to the image
    // service before — just encoded here.
    import('qrcode')
      .then((mod) => {
        const QR = mod.default ?? mod
        return QR.toDataURL(`solana:${address}`, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 360,
          color: { dark: '#060608', light: '#ffffff' },
        })
      })
      .then((url) => {
        if (!cancelled) setQr(url)
      })
      .catch((err) => {
        // Never leave a broken-image box: the sheet still shows the address as
        // text and a copy button, which is the whole fallback.
        console.warn('[receive] local QR generation failed:', err?.message ?? err)
        if (!cancelled) setQr(null)
      })
    return () => {
      cancelled = true
    }
  }, [open, wallet?.publicKey])

  const handle = owned[0]?.name ? `${owned[0].name}.vanta` : null

  return (
    <Drawer open={open} onClose={onClose} title="Receive" subtitle="Two destinations, two privacy levels">
      <div className="flex justify-center my-1">
        <div className="w-[176px] h-[176px] p-4 bg-white rounded-3xl shadow-2xl border-4 border-accent/20 flex items-center justify-center">
          {qr ? (
            <img src={qr} alt="Public address QR" className="w-36 h-36 rounded-xl" />
          ) : (
            <span className="text-[11px] font-semibold text-black/50 text-center leading-snug">
              {wallet?.publicKey ? 'Preparing QR…' : 'No wallet yet'}
            </span>
          )}
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
        className="w-full py-3.5 rounded-2xl bg-white/10 border border-hair font-bold text-white hover:bg-white/20 active:scale-[0.98] tap text-sm"
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
        {handle && (
          <button
            type="button"
            onClick={() => copyText(handle, notify, 'Vanta name copied!', '🪪')}
            className="mt-1 px-3 py-1.5 rounded-xl bg-accent/15 border border-accent/30 text-accent font-semibold text-[12px] hover:bg-accent/25 active:scale-95 tap"
          >
            {handle} · tap to copy
          </button>
        )}
      </div>

      <button
        disabled={!vantaAddress}
        onClick={() => copyText(vantaAddress, notify, 'Vanta address copied!', '🕳️')}
        className="w-full py-3.5 rounded-2xl bg-accent/15 border border-accent/30 font-bold text-accent hover:bg-accent/25 active:scale-[0.98] tap text-sm disabled:opacity-40"
      >
        Copy Vanta address
      </button>
    </Drawer>
  )
}
