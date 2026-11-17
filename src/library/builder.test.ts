import { describe, expect, it } from "vitest"
import {
  assembleLibrary,
  decadeFromYear,
  filesFromList,
  leadArtist,
  mapGenre,
  parseFileName,
  type FileEntry,
  type TagRead,
} from "./builder.ts"

function entry(name: string, path = name, collection: string | null = null, size = 100, lastModified = 1): FileEntry {
  return {
    path,
    name,
    size,
    lastModified,
    file: new File(["song"], name),
    collection,
  }
}

function tags(partial: Partial<TagRead> & Pick<TagRead, "key">): TagRead {
  return {
    artist: "",
    title: "",
    album: "",
    year: null,
    genre: "",
    duration: 180,
    bitrate: 128000,
    hasCover: false,
    ...partial,
  }
}

describe("library builder", () => {
  it("maps genres by the longest keyword and leaves the rest unsorted", () => {
    expect(mapGenre("Folk Rock")).toBe("Indie Folk")
    expect(mapGenre("singer-songwriter")).toBe("Singer-Songwriter")
    expect(mapGenre("Dance-Pop")).toBe("Pop")
    expect(mapGenre("Hip Hop")).toBe("Hip-Hop")
    expect(mapGenre("R&B")).toBe("R&B & Soul")
    expect(mapGenre("")).toBe("Unsorted")
    expect(mapGenre("Spoken Word")).toBe("Unsorted")
  })

  it("keeps band names that use a comma", () => {
    expect(leadArtist("2 Chainz, Lil Wayne")).toBe("2 Chainz")
    expect(leadArtist("Crosby, Stills & Nash")).toBe("Crosby, Stills & Nash")
    expect(leadArtist("Crosby, Stills, Nash & Young")).toBe("Crosby, Stills, Nash & Young")
    expect(leadArtist("Peter, Paul & Mary")).toBe("Peter, Paul & Mary")
    expect(leadArtist("Tyler, The Creator")).toBe("Tyler, The Creator")
  })

  it("reads artist and title from a file name", () => {
    expect(parseFileName("30 - Bob Dylan - Blowin' in the Wind.mp3")).toEqual({
      artist: "Bob Dylan",
      title: "Blowin' in the Wind",
    })
    expect(parseFileName("NA - Feist - Mushaboom (Official Audio).mp3")).toEqual({
      artist: "Feist",
      title: "Mushaboom",
    })
    expect(parseFileName("Song [4K].wmv.flac").title).toBe("Song")
  })

  it("builds a decade from the year", () => {
    expect(decadeFromYear(1987)).toBe("1980s")
    expect(decadeFromYear(null)).toBe("Unknown decade")
  })

  it("hides the lower bitrate duplicate and skips unchanged files on a rescan", async () => {
    const first = entry("Artist - Song (2011 Remaster).mp3", "A/one.mp3", "A", 500, 10)
    const second = entry("Artist - Song.mp3", "A/two.mp3", "A", 900, 11)
    const reads: string[][] = []
    const reader = async (batch: { key: string; file: File }[]) => {
      reads.push(batch.map((item) => item.key))
      return batch.map((item) =>
        tags({
          key: item.key,
          artist: "Artist",
          title: item.key.endsWith("one.mp3") ? "Song (2011 Remaster)" : "Song",
          year: 1987,
          genre: "Folk",
          duration: 200,
          bitrate: item.key.endsWith("two.mp3") ? 320000 : 128000,
        }),
      )
    }
    const built = await assembleLibrary([first, second], [], reader, () => {}, new AbortController().signal)
    expect(built.tracks).toHaveLength(1)
    expect(built.tracks[0]?.path).toBe("A/two.mp3")
    expect(built.tracks[0]?.genre).toBe("Folk")
    expect(built.tracks[0]?.decade).toBe("1980s")
    expect(built.tracks[0]?.collections).toEqual(["A"])
    expect(built.tracks[0]?.primaryArtist).toBe("Artist")

    reads.length = 0
    const again = await assembleLibrary([first, second], built.scanned, reader, () => {}, new AbortController().signal)
    expect(reads).toEqual([])
    expect(again.tracks.map((track) => track.id)).toEqual(built.tracks.map((track) => track.id))

    const changed = { ...second, size: 901, file: new File(["song"], second.name) }
    await assembleLibrary([first, changed], built.scanned, reader, () => {}, new AbortController().signal)
    expect(reads).toEqual([[changed.path]])
  })

  it("uses the top-level folder from a picked file list and skips hidden folders", () => {
    const nested = new File(["a"], "track.mp3")
    Object.defineProperty(nested, "webkitRelativePath", { value: "Folk/Artist/track.mp3" })
    const hidden = new File(["a"], "secret.mp3")
    Object.defineProperty(hidden, "webkitRelativePath", { value: ".hidden/secret.mp3" })
    const dupes = new File(["a"], "copy.mp3")
    Object.defineProperty(dupes, "webkitRelativePath", { value: "_duplicates/copy.mp3" })
    const entries = filesFromList([nested, hidden, dupes])
    expect(entries).toHaveLength(1)
    expect(entries[0]?.collection).toBe("Folk")
    expect(entries[0]?.path).toBe("Folk/Artist/track.mp3")
  })
})
