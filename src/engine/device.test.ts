import { describe, expect, it } from "vitest"
import { usesSimpleEngine } from "./device.ts"

describe("simple playback device", () => {
  it("uses the simple engine on iPhone, iPad, and a touch Mac", () => {
    expect(usesSimpleEngine("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5)).toBe(true)
    expect(usesSimpleEngine("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", 5)).toBe(true)
    expect(usesSimpleEngine("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true)
  })

  it("keeps the two-deck engine on a desktop Mac and other computers", () => {
    expect(usesSimpleEngine("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false)
    expect(usesSimpleEngine("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0)).toBe(false)
    expect(usesSimpleEngine("Mozilla/5.0 (X11; Linux x86_64)", 1)).toBe(false)
  })
})
