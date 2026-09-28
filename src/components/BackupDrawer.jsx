import { useState } from 'react'
import Drawer from './Drawer'
import { playHaptic } from '../lib/haptic'
import { copyText } from '../lib/clipboard'

// Backup & restore sheet.
//
// Two modes, because it is the same screen with a different question: "keep a
// copy of this device's keys" (export) or "put someone else's copy back"
// (import). Reached from Settings — see the two rows there.
//
// The UI is intentionally blunt about the trade: a backup is a file containing
// the keys to the money, so it gets one passphrase field, one explicit
// confirmation on restore, and a warning about where that file should live.

const field =
  'w-full px-4 py-3.5 rounded-2xl bg-black/40 border border-white/10 text-white font-mono text-[12px] placeholder:text-muted/60 focus:outline-none focus:border-accent/50'
const primary =
  'w-full py-3.5 rounded-2xl bg-accent hover:bg-accent-hi font-bold text-black shadow-lg shadow-accent/20 active:scale-[0.98] tap text-sm disabled:opacity-50'
const secondary =
  'w-full py-3.5 rounded-2xl bg-white/5 border border-hair font-semibold text-white/80 hover:bg-white/10 active:scale-[0.98] tap text-sm disabled:opacity-50'

export default function BackupDrawer({ open, onClose, mode = 'export', notify, onRestored }) {
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [blob, setBlob] = useState('')
  const [restoreText, setRestoreText] = useState('')
  const [pending, setPending] = useState(null) // decrypted payload awaiting confirmation

  const reset = () => {
    setPassphrase('')
    setConfirm('')
    setBlob('')
    setRestoreText('')
    setPending(null)
  }

  const close = () => {
    reset()
    onClose?.()
  }

  const buildBackup = async () => {
    if (busy) return
    if (passphrase !== confirm) {
      notify('Those passphrases do not match', '⚠️')
      return
    }
    setBusy(true)
    try {
      const { createBackup } = await import('../lib/backup.js')
      const res = await createBackup(passphrase)
      if (!res.ok) {
        notify(res.error, '⚠️')
        return
      }
      setBlob(res.text)
      playHaptic('success')
      notify('Backup ready — save the text somewhere safe', '🔐')
    } catch (err) {
      notify(`Could not build the backup: ${err?.message || err}`, '⚠️')
    } finally {
      setBusy(false)
    }
  }

  const inspectBackup = async () => {
    if (busy) return
    setBusy(true)
    try {
      const { openBackup, describeBackup } = await import('../lib/backup.js')
      const res = await openBackup(restoreText, passphrase)
      if (!res.ok) {
        notify(res.error, '⚠️')
        return
      }
      setPending({ payload: res.payload, summary: describeBackup(res.payload) })
      playHaptic('pop')
    } catch (err) {
      notify(`Could not read the backup: ${err?.message || err}`, '⚠️')
    } finally {
      setBusy(false)
    }
  }

  const applyRestore = async () => {
    if (!pending || busy) return
    setBusy(true)
    try {
      const { applyBackup } = await import('../lib/backup.js')
      const res = applyBackup(pending.payload)
      if (!res.ok) {
        notify(res.error, '⚠️')
        return
      }
      playHaptic('success')
      notify('Restored — reloading to rebuild the identity', '✅')
      onRestored?.()
    } catch (err) {
      notify(`Could not restore: ${err?.message || err}`, '⚠️')
    } finally {
      setBusy(false)
    }
  }

  const exporting = mode === 'export'

  return (
    <Drawer
      open={open}
      onClose={close}
      title={exporting ? 'Back up this device' : 'Restore from backup'}
      subtitle="Keys never leave your phone"
    >
      {exporting ? (
        <>
          <span className="text-[12px] leading-relaxed text-muted">
            Vanta keeps your shielded identity and your in-app wallet in this app&apos;s storage.
            Nothing is synced anywhere, so clearing this app&apos;s data — or uninstalling it — loses
            both, and the SOL behind them with them. A backup is the only way back.
          </span>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Passphrase (8+ characters)
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete="new-password"
              placeholder="something only you know"
              className={field}
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              placeholder="repeat it"
              className={field}
            />
            <span className="text-[10px] leading-snug text-muted">
              It encrypts the file. Vanta cannot recover it for you — there is no reset.
            </span>
          </div>

          <button onClick={buildBackup} disabled={busy || !passphrase || !confirm} className={primary}>
            {busy ? 'Encrypting…' : 'Create backup'}
          </button>

          {blob && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                Your backup — save this text
              </span>
              <textarea
                readOnly
                value={blob}
                onFocus={(e) => e.target.select()}
                rows={5}
                className={`${field} resize-none`}
              />
              <button
                onClick={() => copyText(blob, notify, 'Backup copied — store it in a password manager', '📋')}
                className={secondary}
              >
                Copy backup text
              </button>
              <span className="text-[10px] leading-snug text-muted">
                Paste it into your password manager or a notes app you trust. Anyone with this text
                <span className="font-semibold text-white/80"> and </span>
                the passphrase can spend your private balance.
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          <span className="text-[12px] leading-relaxed text-muted">
            Restoring replaces this device&apos;s shielded identity
            {pending?.summary?.wallet ? ' and its in-app wallet' : ''} with the one in the backup. Do
            this on a fresh install after a wipe — it rebuilds your private balance from the same
            identity.
          </span>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Backup text
            </label>
            <textarea
              value={restoreText}
              onChange={(e) => setRestoreText(e.target.value)}
              rows={5}
              placeholder="paste the text your backup produced"
              className={`${field} resize-none`}
            />
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Passphrase
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete="current-password"
              placeholder="the one you set when you exported"
              className={field}
            />
          </div>

          {!pending ? (
            <button onClick={inspectBackup} disabled={busy || !restoreText || !passphrase} className={primary}>
              {busy ? 'Opening…' : 'Open backup'}
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="w-full rounded-2xl p-4 bg-black/40 border border-accent/30 flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                  Ready to restore
                </span>
                {pending.summary.createdAt && (
                  <span className="text-[11px] text-white/80">
                    Made {new Date(pending.summary.createdAt).toLocaleString()}
                  </span>
                )}
                {pending.summary.wallet && (
                  <span className="text-[11px] font-mono text-white/80 break-all">
                    In-app wallet {pending.summary.wallet}
                  </span>
                )}
                <span className="text-[11px] text-muted">
                  {[pending.summary.hasNotes ? 'cached notes' : null, pending.summary.hasHistory ? 'history' : null]
                    .filter(Boolean)
                    .join(' · ') || 'identity only'}
                </span>
              </div>
              <button onClick={applyRestore} disabled={busy} className={primary}>
                {busy ? 'Restoring…' : 'Restore and reload'}
              </button>
              <button onClick={() => setPending(null)} disabled={busy} className={secondary}>
                Use a different backup
              </button>
            </div>
          )}
        </>
      )}

      <span className="text-[10px] leading-snug text-muted">
        A device wallet (Seed Vault / Phantom / Solflare) is not part of a backup — its key stays in
        your wallet app. Just reconnect it.
      </span>
    </Drawer>
  )
}
