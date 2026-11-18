import { describe, expect, it } from "vitest"
import { advanceIndex, restoredPlayback, shuffleRemaining } from "./playback-order.ts"

describe("shuffle", () => {
  it("keeps the current song and shuffles only what follows", () => {
    const original = ["a", "b", "c", "d", "e"]
    const shuffled = shuffleRemaining(original, 1, () => 0)
    expect(shuffled.slice(0, 2)).toEqual(["a", "b"])
    expect(shuffled[1]).toBe("b")
    expect(shuffled).toEqual(["a", "b", "d", "e", "c"])
  })

  it("restores the original order from the current song onward", () => {
    const original = ["a", "b", "c", "d", "e"]
    const shuffled = shuffleRemaining(original, 1, () => 0)
    const current = shuffled[3]
    const restored = restoredPlayback(original, current, (item, playing) => item === playing)
    expect(current).toBe("e")
    expect(restored.list).toEqual(original)
    expect(restored.list[restored.index]).toBe("e")
    expect(restored.list.slice(restored.index)).toEqual(["e"])
  })
})

describe("repeat one", () => {
  it("stays on the song when it ends and advances when skipped", () => {
    expect(advanceIndex(2, 5, "one", false)).toBe(2)
    expect(advanceIndex(2, 5, "one", true)).toBe(3)
    expect(advanceIndex(4, 5, "one", true)).toBeNull()
  })

  it("loops the list for repeat all and stops at the end when repeat is off", () => {
    expect(advanceIndex(4, 5, "all", false)).toBe(0)
    expect(advanceIndex(1, 5, "off", false)).toBe(2)
    expect(advanceIndex(4, 5, "off", false)).toBeNull()
  })
})
