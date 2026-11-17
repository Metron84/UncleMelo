import { describe, expect, it } from "vitest"
import { decodeMix, encodeMix, mixPayload, spotifySearch } from "./mix.ts"

describe("shared mixes", () => {
  it("round-trips a mix without files or paths", () => {
    const payload = mixPayload("Folk", [{ artist: "Feist", title: "Mushaboom" }, { artist: "Björk", title: "Venus" }], "Melo")
    expect(payload.s).toEqual([
      ["Feist", "Mushaboom"],
      ["Björk", "Venus"],
    ])
    expect(payload.by).toBe("Melo")
    expect(decodeMix(encodeMix(payload))).toEqual(payload)
    expect(spotifySearch("Feist", "Mushaboom")).toBe("https://open.spotify.com/search/Feist%20Mushaboom")
  })

  it("caps a mix at 50 songs and omits an empty name", () => {
    const songs = Array.from({ length: 60 }, (_, index) => ({ artist: "A", title: `Song ${index}` }))
    const payload = mixPayload("Long", songs, "  ")
    expect(payload.s).toHaveLength(50)
    expect(payload.by).toBeUndefined()
  })
})