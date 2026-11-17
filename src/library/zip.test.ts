import { strToU8, zipSync } from "fflate"
import { describe, expect, it } from "vitest"
import { pathInsideZip, readZip } from "./zip.ts"

describe("zip library", () => {
  it("strips the compressed folder name and skips hidden files", () => {
    expect(pathInsideZip("UncleMelo Music/Feist/Mushaboom.mp3", "UncleMelo Music.zip")).toBe("Feist/Mushaboom.mp3")
    expect(pathInsideZip("UncleMelo Music/library.json", "UncleMelo Music.zip")).toBe("library.json")
    expect(pathInsideZip("UncleMelo Music/.hidden/secret.mp3", "UncleMelo Music.zip")).toBeNull()
    expect(pathInsideZip("UncleMelo Music/_duplicates/copy.mp3", "UncleMelo Music.zip")).toBeNull()
  })

  it("reads one song out of a zip", async () => {
    const zipped = zipSync({
      "UncleMelo Music/Feist/Mushaboom.mp3": strToU8("song"),
      "UncleMelo Music/library.json": strToU8('{"tracks":[]}'),
      "UncleMelo Music/.hidden/no.mp3": strToU8("no"),
    })
    const file = new File([zipped], "UncleMelo Music.zip")
    const songs: string[] = []
    const result = await readZip(file, async (path) => {
      songs.push(path)
    }, () => {}, new AbortController().signal)
    expect(songs).toEqual(["Feist/Mushaboom.mp3"])
    expect(result.libraryText).toContain("tracks")
  })
})
