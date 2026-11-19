export const PLAY_HISTORY_LIMIT = 200
export const RESTART_AFTER_SECONDS = 3
export const RESTART_AGAIN_MS = 2000

export type PlayStack<T> = {
  tracks: T[]
  index: number
  restartedAt: number | null
}

export function createPlayStack<T>(): PlayStack<T> {
  return { tracks: [], index: -1, restartedAt: null }
}

export function hasPrevious<T>(stack: PlayStack<T>) {
  return stack.index > 0
}

export function hasForward<T>(stack: PlayStack<T>) {
  return stack.index >= 0 && stack.index < stack.tracks.length - 1
}

export function currentTrack<T>(stack: PlayStack<T>) {
  return stack.index >= 0 ? stack.tracks[stack.index] : null
}

export function previousTrack<T>(stack: PlayStack<T>) {
  return hasPrevious(stack) ? stack.tracks[stack.index - 1] : null
}

export function forwardTrack<T>(stack: PlayStack<T>) {
  return hasForward(stack) ? stack.tracks[stack.index + 1] : null
}

export function choosePrevious(input: {
  position: number
  now: number
  restartedAt: number | null
  hasPrevious: boolean
  remote: boolean
}) {
  if (!input.hasPrevious) return "restart" as const
  if (input.remote) return "back" as const
  const again = input.restartedAt !== null && input.now - input.restartedAt <= RESTART_AGAIN_MS
  if (input.position > RESTART_AFTER_SECONDS && !again) return "restart" as const
  return "back" as const
}

export function markRestart<T>(stack: PlayStack<T>, now: number): PlayStack<T> {
  return { tracks: stack.tracks, index: stack.index, restartedAt: now }
}

export function stepBack<T>(stack: PlayStack<T>): PlayStack<T> {
  if (!hasPrevious(stack)) return stack
  return { tracks: stack.tracks, index: stack.index - 1, restartedAt: null }
}

export function rememberTrack<T>(stack: PlayStack<T>, track: T, same: (left: T, right: T) => boolean): PlayStack<T> {
  if (stack.index >= 0 && same(stack.tracks[stack.index], track)) {
    return { tracks: stack.tracks, index: stack.index, restartedAt: null }
  }
  if (hasForward(stack) && same(stack.tracks[stack.index + 1], track)) {
    return { tracks: stack.tracks, index: stack.index + 1, restartedAt: null }
  }
  const tracks = stack.tracks.slice(0, Math.max(0, stack.index + 1))
  tracks.push(track)
  let index = tracks.length - 1
  let kept = tracks
  if (kept.length > PLAY_HISTORY_LIMIT) {
    const drop = kept.length - PLAY_HISTORY_LIMIT
    kept = kept.slice(drop)
    index -= drop
  }
  return { tracks: kept, index, restartedAt: null }
}
