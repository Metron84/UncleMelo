import { BlobReader, TextWriter, ZipReader, configure, type Entry, type FileEntry } from "@zip.js/zip.js"

configure({ useWebWorkers: false })

const audioExtensions = new Set(["mp3", "m4a", "aac", "flac", "wav", "ogg"])
const libraryWrapper = "UncleMelo Music"

export const homeScreenLine = "Add UncleMelo to your Home Screen first for full storage."
export const keepOpenLine = "Keep UncleMelo open until this finishes."

export type StoredImport = {
  path: string
  size: number
}

export type PlannedSong = {
  filename: string
  path: string
  name: string
  size: number
}

type ZipEntryInfo = {
  filename: string
  directory: boolean
  uncompressedSize: number
}

export type ZipPlan = {
  songs: PlannedSong[]
  pending: PlannedSong[]
  already: number
  alreadyBytes: number
  remainingBytes: number
  libraryFilename: string | null
}

export type ByteSink = {
  write(chunk: Uint8Array): void | Promise<void>
  close(): void | Promise<void>
  abort(): Promise<void>
}

export function pathInsideZip(entryName: string, zipFileName: string) {
  const clean = entryName.replaceAll("\\", "/").replace(/^\/+/, "").normalize("NFC")
  if (!clean || clean.endsWith("/")) return null
  const parts = clean.split("/").filter(Boolean)
  if (parts.some((part) => part === "__MACOSX" || part === "_duplicates" || part.startsWith("."))) return null
  const folder = zipFileName.replace(/\.zip$/i, "").normalize("NFC")
  const body = parts[0] === folder || parts[0] === libraryWrapper ? parts.slice(1) : parts
  if (body.length === 0 || body.some((part) => part.startsWith(".") || part === "_duplicates")) return null
  return body.join("/")
}

export function planZip(entries: readonly ZipEntryInfo[], zipFileName: string, completed: readonly StoredImport[]) {
  const songs: PlannedSong[] = []
  let libraryFilename: string | null = null
  for (const entry of entries) {
    if (entry.directory) continue
    const path = pathInsideZip(entry.filename, zipFileName)
    if (!path) continue
    if (path === "library.json" || path.endsWith("/library.json")) {
      libraryFilename = entry.filename
      continue
    }
    if (!audioExtensions.has(extensionOf(path))) continue
    const name = path.split("/").pop() ?? path
    songs.push({ filename: entry.filename, path, name, size: entry.uncompressedSize })
  }
  const done = new Set(completed.filter((row) => row.size > 0).map((row) => keyOf(row.path, row.size)))
  const pending = songs.filter((song) => song.size <= 0 || !done.has(keyOf(song.path, song.size)))
  const alreadySongs = songs.filter((song) => song.size > 0 && done.has(keyOf(song.path, song.size)))
  const alreadyBytes = alreadySongs.reduce((sum, song) => sum + song.size, 0)
  const remainingBytes = pending.reduce((sum, song) => sum + Math.max(0, song.size), 0)
  const plan: ZipPlan = {
    songs,
    pending,
    already: alreadySongs.length,
    alreadyBytes,
    remainingBytes,
    libraryFilename,
  }
  return plan
}

export function continuationLine(done: number, total: number) {
  if (done <= 0 || total <= 0 || done >= total) return null
  return `Continuing from song ${done + 1} of ${total}`
}

export function importSummary(imported: number, total: number, skippedNames: readonly string[]) {
  if (skippedNames.length === 0) return `Imported ${imported} of ${total}`
  return [`Imported ${imported} of ${total} · ${skippedNames.length} skipped`, ...skippedNames].join("\n")
}

export function bytesWithHeadroom(bytes: number) {
  return Math.ceil(Math.max(0, bytes) * 1.1)
}

export function importSpaceNeeded(archiveBytes: number, alreadyBytes: number, remainingBytes: number) {
  return bytesWithHeadroom(Math.max(0, archiveBytes - alreadyBytes, remainingBytes))
}

export function formatGigabytes(bytes: number) {
  const tenths = Math.ceil(Math.max(0, bytes) / 1e8) / 10
  const shown = tenths > 0 ? tenths : 0.1
  return Number.isInteger(shown) ? String(shown) : shown.toFixed(1)
}

export function spaceShortfallMessage(freeBytes: number, neededBytes: number) {
  if (neededBytes <= 0 || freeBytes >= neededBytes) return null
  return `Not enough space on this device. Free up ${formatGigabytes(neededBytes - freeBytes)} GB and try again.`
}

export function storedLibraryPath(path: string, listed: ReadonlySet<string>) {
  const normalised = path.replaceAll("\\", "/").normalize("NFC")
  if (listed.has(normalised)) return normalised
  const stripped = pathInsideZip(normalised, "library.zip")
  if (stripped && listed.has(stripped)) return stripped
  return null
}

export function sortZipFiles<T extends { name: string }>(files: readonly T[]) {
  return [...files].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }))
}

export function runningStandalone() {
  if (typeof window === "undefined") return false
  const installed = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia("(display-mode: standalone)").matches || installed.standalone === true
}

export async function openZip(file: Blob) {
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false })
  const entries = await reader.getEntries()
  return { reader, entries }
}

export async function readLibraryText(entry: FileEntry) {
  return entry.getData(new TextWriter(), { useWebWorkers: false })
}

export async function writeEntry(entry: FileEntry, stream: WritableStream<Uint8Array>) {
  await entry.getData(stream, { useWebWorkers: false })
}

export async function importPendingSongs(
  entries: readonly Entry[],
  pending: readonly PlannedSong[],
  options: {
    aborted: () => boolean
    openSink: (path: string) => Promise<ByteSink>
    onSaved: (song: PlannedSong) => Promise<void>
    onSkipped: (song: PlannedSong, error: unknown) => Promise<void>
  },
) {
  const files = new Map(entries.filter((entry): entry is FileEntry => !entry.directory).map((entry) => [entry.filename, entry]))
  for (const song of pending) {
    if (options.aborted()) return "cancelled" as const
    const entry = files.get(song.filename)
    if (!entry) {
      const missing = new Error("Missing from the zip")
      console.error("Skipped song", song.name, missing)
      await options.onSkipped(song, missing)
      continue
    }
    let sink: ByteSink | null = null
    try {
      sink = await options.openSink(song.path)
      const active = sink
      await writeEntry(entry, new WritableStream<Uint8Array>({
        write(chunk) {
          return active.write(chunk)
        },
      }))
      await sink.close()
      sink = null
      await options.onSaved(song)
    } catch (error) {
      if (sink) await sink.abort()
      console.error("Skipped song", song.name, error)
      await options.onSkipped(song, error)
    }
  }
  return "finished" as const
}

function extensionOf(path: string) {
  const name = path.split("/").pop() ?? path
  const dot = name.lastIndexOf(".")
  return dot === -1 ? "" : name.slice(dot + 1).toLocaleLowerCase()
}

function keyOf(path: string, size: number) {
  return `${path}\u0000${size}`
}
