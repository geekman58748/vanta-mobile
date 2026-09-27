import Drawer from './Drawer'
import { playHaptic } from '../lib/haptic'
import { stampToTime } from '../lib/format'

const DAY_MS = 86_400_000

// "View All →" / the header chart button. Combines the two sheets the reference
// templates split across files: gemini's spending-analytics chart, and the
// sibling template's allTxnDrawer full activity list. Both re-pointed at Vanta's
// real privacy activity instead of fake USD spending.
export default function ActivityDrawer({
  open,
  onClose,
  transactions,
  filter,
  setFilter,
  onOpenReceipt,
}) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const buckets = Array.from({ length: 7 }, (_, i) => {
    const start = now.getTime() - (6 - i) * DAY_MS
    return {
      label: new Date(start).toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2),
      start,
      end: start + DAY_MS,
      value: 0,
    }
  })

  let intoPool = 0
  let outOfPool = 0
  for (const tx of transactions) {
    const value = Number(tx.value) || 0
    if (tx.mode === 'Shield') intoPool += value
    if (tx.mode === 'Shadow' || tx.mode === 'Ghost') outOfPool += value
    const bucket = buckets.find((b) => tx.at >= b.start && tx.at < b.end)
    if (bucket) bucket.value += value
  }

  const max = Math.max(...buckets.map((b) => b.value), 0)
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)

  const CHIPS = [
    ['all', 'All'],
    ['private', 'Private'],
    ['public', 'Public'],
  ]

  const visible = transactions.filter((tx) => {
    if (filter === 'private') return tx.isPrivate
    if (filter === 'public') return !tx.isPrivate
    return true
  })

  const openReceipt = (tx) => {
    playHaptic('pop')
    onOpenReceipt(tx)
  }

  return (
    <Drawer open={open} onClose={onClose} title="Privacy analytics" subtitle="This week on devnet">
      <div className="w-full bg-black/50 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Daily volume</span>
          <span className="text-accent font-semibold">{transactions.length} transfers</span>
        </div>

        <div className="w-full h-32 flex items-end justify-between gap-2 pt-4">
          {buckets.map((b, i) => {
            const isToday = b.label === todayLabel && i === buckets.length - 1
            const height = max > 0 ? Math.max((b.value / max) * 100, 4) : 4
            return (
              <div
                key={b.start}
                className={`w-full rounded-t-lg tap relative flex flex-col justify-end items-center ${
                  isToday
                    ? 'bg-accent shadow-lg shadow-accent/50'
                    : 'bg-accent/15 hover:bg-accent/30'
                }`}
                style={{ height: `${height}%` }}
                title={`${b.value} ${b.value === 1 ? 'unit' : 'units'}`}
              >
                {b.value > 0 && (
                  <span
                    className={`text-[9px] mb-1 ${isToday ? 'text-black font-bold' : 'text-muted'}`}
                  >
                    {b.value.toFixed(2)}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex justify-between text-[11px] font-medium text-muted pt-1 border-t border-white/5">
          {buckets.map((b, i) => (
            <span
              key={b.start}
              className={i === buckets.length - 1 ? 'text-accent font-bold' : ''}
            >
              {b.label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-accent/10 border border-accent/20">
          <span className="text-xs text-muted font-medium">Into the pool</span>
          <div className="text-xl font-extrabold text-accent mt-0.5 tnum">
            {intoPool.toFixed(3)}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-danger/10 border border-danger/20">
          <span className="text-xs text-muted font-medium">Out of the pool</span>
          <div className="text-xl font-extrabold text-danger mt-0.5 tnum">
            {outOfPool.toFixed(3)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
        {CHIPS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              playHaptic('tap')
              setFilter(key)
            }}
            className={`px-3.5 py-1.5 rounded-full text-[12px] tap whitespace-nowrap ${
              filter === key
                ? 'bg-accent/15 text-accent border border-accent/30 font-semibold'
                : 'bg-white/5 text-muted border border-hair font-medium hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-y-auto overscroll-contain no-scrollbar flex flex-col divide-y divide-white/5 max-h-[38vh]">
        {visible.length === 0 ? (
          <div className="py-8 text-center text-muted text-sm">
            No activity yet.
            <br />
            Shield some SOL to start the chart.
          </div>
        ) : (
          visible.map((tx, i) => (
            <div
              key={`${tx.at}-${i}`}
              onClick={() => openReceipt(tx)}
              className="py-3 px-2 flex justify-between items-center gap-3 cursor-pointer hover:bg-white/5 active:bg-white/10 rounded-xl transition-colors"
            >
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-white text-[13px] truncate">{tx.title}</span>
                <span className="text-[11px] text-muted">
                  {tx.time}
                  {tx.isPrivate ? ' • 🔒 private' : ' • public'}
                </span>
              </div>
              <span
                className={`text-[13px] font-bold shrink-0 tnum ${
                  tx.type === 'income' ? 'text-accent' : 'text-danger'
                }`}
              >
                {tx.amount}
              </span>
            </div>
          ))
        )}
      </div>

      <span className="text-[10px] text-muted leading-relaxed">
        Charts are built from activity in this browser session. Vanta keeps no server-side
        history, so a reload starts the week over. Tap any row for its on-chain reference.
        {transactions.length ? ` Last stamped ${stampToTime(transactions[0].at)}.` : ''}
      </span>
    </Drawer>
  )
}
