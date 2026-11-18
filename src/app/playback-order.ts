export type RepeatMode = "off" | "all" | "one"
export type SleepChoice = "15" | "30" | "60" | "song" | "off"

export const crossfadeOptions = [
  { seconds: 0, label: "Off" },
  { seconds: 3, label: "3s" },
  { seconds: 6, label: "6s" },
  { seconds: 10, label: "10s" },
] as const

export function isCrossfadeChoice(value: number): value is 0 | 3 | 6 | 10 {
  return value === 0 || value === 3 || value === 6 || value === 10
}

export function fisherYates<T>(items: readonly T[], random: () => number): T[] {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    const item = next[index]
    next[index] = next[swap]
    next[swap] = item
  }
  return next
}

export function shuffleRemaining<T>(items: readonly T[], index: number, random: () => number): T[] {
  if (items.length === 0) return []
  const at = Math.min(Math.max(index, 0), items.length - 1)
  return [...items.slice(0, at + 1), ...fisherYates(items.slice(at + 1), random)]
}

export function restoredPlayback<T>(
  original: readonly T[],
  current: T,
  same: (item: T, current: T) => boolean,
): { list: T[]; index: number } {
  const index = original.findIndex((item) => same(item, current))
  if (index < 0) return { list: [...original], index: 0 }
  return { list: [...original], index }
}

export function nextRepeat(mode: RepeatMode): RepeatMode {
  if (mode === "off") return "all"
  if (mode === "all") return "one"
  return "off"
}

export function advanceIndex(index: number, length: number, repeat: RepeatMode, manual: boolean): number | null {
  if (length <= 0) return null
  if (repeat === "one" && !manual) return index
  const next = index + 1
  if (next < length) return next
  if (repeat === "all") return 0
  return null
}

export function comingTracks<T>(ahead: readonly T[], queue: readonly T[], index: number, endless: boolean): T[] {
  if (endless) return [...ahead]
  return [...ahead, ...queue.slice(index + 1)]
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items]
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
