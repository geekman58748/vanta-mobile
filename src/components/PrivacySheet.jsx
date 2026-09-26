import Drawer from './Drawer'
import HonestyRows from './HonestyRows'
import { RESIDUALS } from '../lib/honesty'

/**
 * The "what leaks" sheet — Vanta's whole thesis, stated out loud.
 *
 * The rows themselves are NOT defined here: they come from lib/honesty.js so the
 * same wording ships on every receipt. See that file for the rules on what each
 * action is allowed to claim.
 */
const ORDER = ['Shield', 'Shadow', 'Ghost']

export default function PrivacySheet({ open, onClose }) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="What leaks"
      subtitle="Everything Vanta hides, and everything it does not"
    >
      <div className="flex flex-col gap-3">
        {ORDER.map((mode) => (
          <HonestyRows key={mode} mode={mode} />
        ))}
      </div>

      <div className="rounded-2xl bg-black/40 border border-hair p-3.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          Residuals we will not hide from you
        </span>
        <ul className="mt-1.5 flex flex-col gap-1.5 text-[11px] text-muted leading-snug list-disc pl-4">
          {RESIDUALS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <span className="text-[10px] text-muted leading-relaxed text-center">
        Devnet · unaudited · not for real funds
      </span>
    </Drawer>
  )
}
