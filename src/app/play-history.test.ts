import { describe, expect, it } from "vitest"
import {
  choosePrevious,
  createPlayStack,
  currentTrack,
  forwardTrack,
  hasForward,
  hasPrevious,
  markRestart,
  PLAY_HISTORY_LIMIT,
  rememberTrack,
  stepBack,
} from "./play-history.ts"

const same = (left: string, right: string) => left === right

function play(stack: ReturnType<typeof createPlayStack<string>>, track: string) {
  return rememberTrack(stack, track, same)
}

describe("play history", () => {
  it("goes back, back, then forward through the same songs before anything new", () => {
    let stack = createPlayStack<string>()
    stack = play(stack, "a")
    stack = play(stack, "b")
    stack = play(stack, "c")
    expect(currentTrack(stack)).toBe("c")

    stack = stepBack(stack)
    stack = stepBack(stack)
    expect(currentTrack(stack)).toBe("a")
    expect(forwardTrack(stack)).toBe("b")

    stack = play(stack, "b")
    stack = play(stack, "c")
    expect(currentTrack(stack)).toBe("c")
    expect(hasForward(stack)).toBe(false)
    expect(stack.tracks).toEqual(["a", "b", "c"])

    stack = play(stack, "d")
    expect(stack.tracks).toEqual(["a", "b", "c", "d"])
  })

  it("drops the forward songs when a different song plays after going back", () => {
    let stack = play(play(play(createPlayStack<string>(), "a"), "b"), "c")
    stack = stepBack(stack)
    stack = stepBack(stack)
    stack = play(stack, "z")
    expect(stack.tracks).toEqual(["a", "z"])
    expect(currentTrack(stack)).toBe("z")
  })

  it("restarts past 3 seconds and goes back at 3 seconds", () => {
    const again = { now: 0, restartedAt: null, hasPrevious: true, remote: false }
    expect(choosePrevious({ ...again, position: 3.01 })).toBe("restart")
    expect(choosePrevious({ ...again, position: 10 })).toBe("restart")
    expect(choosePrevious({ ...again, position: 3 })).toBe("back")
    expect(choosePrevious({ ...again, position: 0 })).toBe("back")
  })

  it("goes back when previous is pressed again within 2 seconds of a restart", () => {
    const restarted = markRestart(play(play(createPlayStack<string>(), "a"), "b"), 5_000)
    expect(restarted.restartedAt).toBe(5_000)
    const held = { position: 12, restartedAt: 5_000, hasPrevious: true, remote: false }
    expect(choosePrevious({ ...held, now: 5_000 })).toBe("back")
    expect(choosePrevious({ ...held, now: 7_000 })).toBe("back")
    expect(choosePrevious({ ...held, now: 7_001 })).toBe("restart")
  })

  it("restarts when nothing has played before, including from the lock screen", () => {
    const empty = { position: 1, now: 0, restartedAt: null, hasPrevious: false, remote: false }
    expect(choosePrevious(empty)).toBe("restart")
    expect(choosePrevious({ ...empty, remote: true, position: 40 })).toBe("restart")
    expect(hasPrevious(createPlayStack<string>())).toBe(false)
  })

  it("always goes back from the lock screen when a previous song exists", () => {
    expect(choosePrevious({ position: 40, now: 0, restartedAt: null, hasPrevious: true, remote: true })).toBe("back")
  })

  it("keeps at most 200 songs", () => {
    let stack = createPlayStack<string>()
    for (let index = 0; index < PLAY_HISTORY_LIMIT + 5; index += 1) stack = play(stack, String(index))
    expect(stack.tracks).toHaveLength(PLAY_HISTORY_LIMIT)
    expect(stack.tracks[0]).toBe("5")
    expect(currentTrack(stack)).toBe(String(PLAY_HISTORY_LIMIT + 4))
  })
})
