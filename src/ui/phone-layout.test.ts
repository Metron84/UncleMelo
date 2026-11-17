import { describe, expect, it } from "vitest"
import { phoneGenreFit } from "./phone-layout.ts"

describe("phone genre layout", () => {
  it("fits the header and 12 genre tiles on a 390 by 844 screen", () => {
    const fit = phoneGenreFit(390, 844)
    expect(fit.fits).toBe(true)
    expect(fit.used).toBeLessThanOrEqual(844)
  })

  it("still fits when the iPhone safe areas are included", () => {
    const fit = phoneGenreFit(390, 844, 47, 34)
    expect(fit.fits).toBe(true)
  })
})