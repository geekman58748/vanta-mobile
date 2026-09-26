// Toast banner from gemini-code-1789825749253.html — icon well + message,
// slide-down on mount, auto-dismissed by the caller.
export default function Toast({ message, icon = '✓' }) {
  if (!message) return null

  return (
    <div className="fixed top-5 inset-x-0 z-[100] flex justify-center px-4 pointer-events-none">
      <div className="w-full max-w-[380px] bg-card border border-hair-hi text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 toast-anim">
        <div className="w-8 h-8 shrink-0 rounded-full bg-accent/15 text-accent flex items-center justify-center font-bold text-sm">
          {icon}
        </div>
        <span className="text-xs font-medium text-white/90">{message}</span>
      </div>
    </div>
  )
}
