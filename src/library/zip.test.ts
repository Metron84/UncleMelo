import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js"
import { describe, expect, it } from "vitest"
import {
  continuationLine,
  importPendingSongs,
  importSpaceNeeded,
  importSummary,
  openZip,
  planZip,
  pathInsideZip,
  readLibraryText,
  storedLibraryPath,
  sortZipFiles,
  spaceShortfallMessage,
  type ByteSink,
} from "./zip.ts"

describe("zip library", () => {
  it("strips the compressed folder name and skips hidden files", () => {
    expect(pathInsideZip("UncleMelo Music/Feist/Mushaboom.mp3", "UncleMelo Music.zip")).toBe("Feist/Mushaboom.mp3")
    expect(pathInsideZip("UncleMelo Music/library.json", "UncleMelo Music.zip")).toBe("library.json")
    expect(pathInsideZip("UncleMelo Music/.hidden/secret.mp3", "UncleMelo Music.zip")).toBeNull()
    expect(pathInsideZip("UncleMelo Music/_duplicates/copy.mp3", "UncleMelo Music.zip")).toBeNull()
    expect(pathInsideZip("UncleMelo Music/Feist/Mushaboom.mp3", "UncleMelo-part1.zip")).toBe("Feist/Mushaboom.mp3")
    expect(storedLibraryPath("UncleMelo Music/Feist/Mushaboom.mp3", new Set(["Feist/Mushaboom.mp3"]))).toBe("Feist/Mushaboom.mp3")
  })

  it("sorts zip parts in numeric order", () => {
    const files = sortZipFiles([{ name: "UncleMelo-part10.zip" }, { name: "UncleMelo-part2.zip" }, { name: "UncleMelo-part1.zip" }])
    expect(files.map((file) => file.name)).toEqual(["UncleMelo-part1.zip", "UncleMelo-part2.zip", "UncleMelo-part10.zip"])
  })

  it("plans a resume from the songs already stored", () => {
    const plan = planZip(
      [
        { filename: "UncleMelo Music/library.json", directory: false, uncompressedSize: 12 },
        { filename: "UncleMelo Music/Feist/Mushaboom.mp3", directory: false, uncompressedSize: 4 },
        { filename: "UncleMelo Music/Feist/Other.mp3", directory: false, uncompressedSize: 5 },
      ],
      "UncleMelo-part1.zip",
      [{ path: "Feist/Mushaboom.mp3", size: 4 }],
    )
    expect(plan.libraryFilename).toBe("UncleMelo Music/library.json")
    expect(plan.songs).toHaveLength(2)
    expect(plan.already).toBe(1)
    expect(plan.pending.map((song) => song.path)).toEqual(["Feist/Other.mp3"])
    expect(continuationLine(60, 899)).toBe("Continuing from song 61 of 899")
    expect(continuationLine(0, 899)).toBeNull()
  })

  it("asks for the zip size plus 10 percent, minus songs already stored", () => {
    const full = importSpaceNeeded(5_000_000_000, 0, 5_000_000_000)
    expect(spaceShortfallMessage(5_000_000_000, full)).toBe("Not enough space on this device. Free up 0.5 GB and try again.")
    const remaining = importSpaceNeeded(5_000_000_000, 4_000_000_000, 1_000_000_000)
    expect(spaceShortfallMessage(1_200_000_000, remaining)).toBeNull()
    expect(importSummary(897, 899, ["One.mp3", "Two.mp3"])).toBe("Imported 897 of 899 · 2 skipped\nOne.mp3\nTwo.mp3")
  })

  it("reads library.json first and keeps a single song open", async () => {
    const blob = await makeZip({
      "UncleMelo Music/Feist/Other.mp3": "song-b",
      "UncleMelo Music/library.json": '{"tracks":[]}',
      "UncleMelo Music/Feist/Mushaboom.mp3": "song-a",
      "UncleMelo Music/.hidden/no.mp3": "no",
    })
    const file = new File([blob], "UncleMelo-part2.zip")
    const opened = await openZip(file)
    try {
      const plan = planZip(opened.entries, file.name, [])
      const library = opened.entries.find((entry) => entry.filename === plan.libraryFilename)
      if (!library || library.directory) throw new Error("missing library.json")
      const text = await readLibraryText(library)
      expect(text).toContain("tracks")
      const events: string[] = []
      let open = 0
      let maxOpen = 0
      const outcome = await importPendingSongs(opened.entries, plan.pending, {
        aborted: () => false,
        openSink: async (path) => {
          open += 1
          maxOpen = Math.max(maxOpen, open)
          events.push(`open:${path}`)
          const chunks: Uint8Array[] = []
          const sink: ByteSink = {
            write(chunk) {
              chunks.push(chunk.slice())
            },
            close() {
              open -= 1
              events.push(`close:${decode(chunks)}`)
            },
            async abort() {
              open -= 1
            },
          }
          return sink
        },
        onSaved: async (song) => {
          events.push(`saved:${song.name}`)
        },
        onSkipped: async (song) => {
          events.push(`skipped:${song.name}`)
        },
      })
      expect(outcome).toBe("finished")
      expect(maxOpen).toBe(1)
      expect(events).toEqual([
        "open:Feist/Other.mp3",
        "close:song-b",
        "saved:Other.mp3",
        "open:Feist/Mushaboom.mp3",
        "close:song-a",
        "saved:Mushaboom.mp3",
      ])
    } finally {
      await opened.reader.close()
    }
  })

  it("skips a broken song and keeps importing", async () => {
    const blob = await makeZip({
      "Feist/Mushaboom.mp3": "song-a",
      "Feist/Other.mp3": "song-b",
    })
    const file = new File([blob], "songs.zip")
    const opened = await openZip(file)
    try {
      const plan = planZip(opened.entries, file.name, [])
      const skipped: string[] = []
      const saved: string[] = []
      await importPendingSongs(opened.entries, plan.pending, {
        aborted: () => false,
        openSink: async (path) => {
          if (path.endsWith("Mushaboom.mp3")) throw new Error("disk full")
          return {
            write() {},
            close() {},
            async abort() {},
          }
        },
        onSaved: async (song) => {
          saved.push(song.name)
        },
        onSkipped: async (song) => {
          skipped.push(song.name)
        },
      })
      expect(skipped).toEqual(["Mushaboom.mp3"])
      expect(saved).toEqual(["Other.mp3"])
    } finally {
      await opened.reader.close()
    }
  })
})

async function makeZip(entries: Record<string, string>) {
  const writer = new ZipWriter(new BlobWriter("application/zip"))
  const encoder = new TextEncoder()
  for (const [name, text] of Object.entries(entries)) {
    await writer.add(name, new Uint8ArrayReader(encoder.encode(text)))
  }
  return writer.close()
}

function decode(chunks: Uint8Array[]) {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder().decode(bytes)
}
