export function ReadingProgress({ done, total, onCancel }: { done: number; total: number; onCancel: () => void }) {
  const pct = total === 0 ? 0 : Math.min(100, (done / total) * 100)
  return (
    <div className="mt-6">
      <p className="text-body">
        Reading your music · {done} of {total}
      </p>
      <div
        className="mt-3 h-[3px] overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label="Reading your music"
      >
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <button type="button" className="mt-3 h-11 text-body text-muted" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
