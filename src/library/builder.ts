import type { TrackRecord } from "./types.ts"

export const audioExtensions = new Set(["mp3", "m4a", "aac", "flac", "wav", "ogg"])

export const scanBatchSize = 20

export type ScanProgress = {
  done: number
  total: number
  label?: string
}

export type FileEntry = {
  path: string
  name: string
  size: number
  lastModified: number
  file: File
  collection: string | null
}

export type TagRead = {
  key: string
  artist: string
  title: string
  album: string
  year: number | null
  genre: string
  duration: number
  bitrate: number
  hasCover: boolean
}

export type ScannedFile = {
  path: string
  name: string
  size: number
  lastModified: number
  bitrate: number
  hasCover: boolean
  track: TrackRecord
}

export class ScanCancelled extends Error {
  constructor() {
    super("Scan cancelled")
    this.name = "ScanCancelled"
  }
}

const genreRules: { genre: string; keywords: string[] }[] = [
  { genre: "Singer-Songwriter", keywords: ["singer-songwriter", "singer songwriter"] },
  { genre: "Indie Folk", keywords: ["indie folk", "folk rock", "americana"] },
  { genre: "Indie & Alternative", keywords: ["shoegaze", "britpop", "grunge", "alternative", "indie", "emo"] },
  { genre: "Hip-Hop", keywords: ["hip-hop", "hip hop", "trap", "drill", "rap"] },
  { genre: "R&B & Soul", keywords: ["r&b", "rnb", "motown", "funk", "soul"] },
  { genre: "Pop", keywords: ["dance-pop", "synth-pop", "synthpop", "pop"] },
  { genre: "Electronic & Dance", keywords: ["electronic", "techno", "trance", "house", "dance", "edm"] },
  { genre: "Country & Bluegrass", keywords: ["bluegrass", "country"] },
  { genre: "Soundtrack & Score", keywords: ["soundtrack", "classical", "score", "ost"] },
  { genre: "Folk", keywords: ["folk"] },
  { genre: "Rock", keywords: ["hard rock", "metal", "punk", "rock"] },
]

const keptWhole = new Set([
  "crosby, stills & nash",
  "crosby, stills, nash & young",
  "peter, paul & mary",
  "tyler, the creator",
])

const junkPatterns = [
  /\((?:official audio|official video|lyrics|hd)\)/gi,
  /\[4k\]/gi,
  /\.wmv\b/gi,
]

export function mapGenre(raw: string) {
  const text = raw.trim().toLocaleLowerCase()
  if (!text) return "Unsorted"
  let best: { genre: string; length: number } | null = null
  for (const rule of genreRules) {
    for (const keyword of rule.keywords) {
      if (!hasKeyword(text, keyword)) continue
      if (!best || keyword.length > best.length) best = { genre: rule.genre, length: keyword.length }
    }
  }
  return best?.genre ?? "Unsorted"
}

export function decadeFromYear(year: number | null) {
  if (year === null || !Number.isInteger(year) || year < 1000 || year > 9999) return "Unknown decade"
  return `${Math.floor(year / 10) * 10}s`
}

export function leadArtist(artist: string) {
  const trimmed = artist.trim().replace(/\s+/g, " ")
  if (!trimmed) return "Unknown"
  if (keptWhole.has(trimmed.toLocaleLowerCase())) return trimmed
  const comma = trimmed.indexOf(", ")
  if (comma === -1) return trimmed
  const rest = trimmed.slice(comma + 2)
  if (/^(the|a|an)\b/i.test(rest)) return trimmed
  if (isAmpersandBand(trimmed)) return trimmed
  return trimmed.slice(0, comma).trim() || "Unknown"
}

export function parseFileName(fileName: string) {
  let text = fileName.replace(/\.(mp3|m4a|aac|flac|wav|ogg)$/i, "")
  for (const pattern of junkPatterns) text = text.replace(pattern, " ")
  text = text.replace(/\s+/g, " ").trim()
  let previous = ""
  while (text !== previous) {
    previous = text
    text = text.replace(/^\d{1,3}\s*-\s+/, "").replace(/^NA\s*-\s+/i, "").trim()
  }
  const splitAt = text.indexOf(" - ")
  if (splitAt === -1) return { artist: "", title: text }
  return {
    artist: text.slice(0, splitAt).trim(),
    title: text.slice(splitAt + 3).trim(),
  }
}

export function normaliseName(value: string) {
  const stripped = value.replace(/\s*[([].*?[)\]]/g, (bracket) => (dropBracket(bracket) ? "" : bracket))
  return stripped.toLocaleLowerCase().replace(/\s+/g, " ").trim()
}

export async function collectAudio(root: FileSystemDirectoryHandle, signal: AbortSignal) {
  const entries: FileEntry[] = []
  await walk(root, "", null, entries, signal)
  return entries
}

export function filesFromList(list: FileList | readonly File[]) {
  const entries: FileEntry[] = []
  const seen = new Set<string>()
  for (const file of list) {
    const relative = file.webkitRelativePath || file.name
    const parts = relative.split(/[/\\]/).filter(Boolean).map((part) => part.normalize("NFC"))
    if (parts.some((part) => part.startsWith(".") || part === "_duplicates")) continue
    const name = parts[parts.length - 1] ?? file.name
    if (!audioExtensions.has(extensionOf(name))) continue
    let path = parts.join("/")
    if (seen.has(path)) path = `${path}#${file.size}-${file.lastModified}`
    seen.add(path)
    entries.push({
      path,
      name,
      size: file.size,
      lastModified: file.lastModified,
      file,
      collection: parts.length > 1 ? parts[0] : null,
    })
  }
  return entries
}

export async function assembleLibrary(
  entries: readonly FileEntry[],
  previous: readonly ScannedFile[],
  readTags: (batch: { key: string; file: File }[]) => Promise<TagRead[]>,
  onProgress: (progress: ScanProgress) => void,
  signal: AbortSignal,
) {
  if (signal.aborted) throw new ScanCancelled()
  const previousByPath = new Map(previous.map((row) => [row.path, row]))
  const scanned: ScannedFile[] = []
  const pending: FileEntry[] = []
  const total = entries.length
  let done = 0
  onProgress({ done, total })

  for (const entry of entries) {
    if (signal.aborted) throw new ScanCancelled()
    const prior = previousByPath.get(entry.path)
    if (
      prior &&
      prior.name === entry.name &&
      prior.size === entry.size &&
      prior.lastModified === entry.lastModified
    ) {
      scanned.push(prior)
      done += 1
    } else {
      pending.push(entry)
    }
  }
  onProgress({ done, total })

  for (let index = 0; index < pending.length; index += scanBatchSize) {
    if (signal.aborted) throw new ScanCancelled()
    const batch = pending.slice(index, index + scanBatchSize)
    const tags = await readTags(batch.map((entry) => ({ key: entry.path, file: entry.file })))
    if (signal.aborted) throw new ScanCancelled()
    const byKey = new Map(tags.map((tag) => [tag.key, tag]))
    for (const entry of batch) {
      scanned.push(await scannedFrom(entry, byKey.get(entry.path)))
      done += 1
    }
    onProgress({ done, total })
  }

  return { tracks: visibleTracks(scanned), scanned }
}

export function visibleTracks(files: readonly ScannedFile[]) {
  const parent = files.map((_, index) => index)
  const find = (index: number): number => {
    let cursor = index
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]]
      cursor = parent[cursor]
    }
    return cursor
  }
  const union = (left: number, right: number) => {
    const a = find(left)
    const b = find(right)
    if (a !== b) parent[b] = a
  }
  for (let left = 0; left < files.length; left += 1) {
    for (let right = left + 1; right < files.length; right += 1) {
      if (sameRecording(files[left], files[right])) union(left, right)
    }
  }
  const groups = new Map<number, ScannedFile[]>()
  files.forEach((file, index) => {
    const root = find(index)
    const list = groups.get(root)
    if (list) list.push(file)
    else groups.set(root, [file])
  })
  return [...groups.values()].map((group) => group.reduce(prefer).track)
}

export async function buildLibrary(
  entries: readonly FileEntry[],
  previous: readonly ScannedFile[],
  onProgress: (progress: ScanProgress) => void,
  signal: AbortSignal,
) {
  return assembleLibrary(entries, previous, (batch) => readTagsWithWorker(batch, signal), onProgress, signal)
}

function hasKeyword(text: string, keyword: string) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(text)
}

function isAmpersandBand(name: string) {
  if (!name.includes(" & ")) return false
  const parts = name.split(", ")
  if (parts.length < 2) return false
  return parts.every((part) => part.length > 0 && part.split(/\s+/).length <= 4)
}

function dropBracket(bracket: string) {
  const inner = bracket.toLocaleLowerCase()
  if (/remaster(?:ed)?|\bedit\b|\bmono\b|\bstereo\b|\bversion\b/.test(inner)) return true
  return /\bmix\b/.test(inner) && /\b(?:19|20)\d{2}\b/.test(inner)
}

function extensionOf(name: string) {
  const dot = name.lastIndexOf(".")
  return dot === -1 ? "" : name.slice(dot + 1).toLocaleLowerCase()
}

async function walk(
  directory: FileSystemDirectoryHandle,
  prefix: string,
  collection: string | null,
  entries: FileEntry[],
  signal: AbortSignal,
) {
  for await (const [rawName, handle] of directory.entries()) {
    if (signal.aborted) throw new ScanCancelled()
    const name = rawName.normalize("NFC")
    if (name.startsWith(".") || name === "_duplicates") continue
    if (handle.kind === "directory") {
      const nextPrefix = prefix ? `${prefix}/${name}` : name
      await walk(handle, nextPrefix, collection ?? name, entries, signal)
      continue
    }
    if (handle.kind !== "file" || !audioExtensions.has(extensionOf(name))) continue
    const file = await handle.getFile()
    if (signal.aborted) throw new ScanCancelled()
    entries.push({
      path: prefix ? `${prefix}/${name}` : name,
      name,
      size: file.size,
      lastModified: file.lastModified,
      file,
      collection,
    })
  }
}

async function scannedFrom(entry: FileEntry, tag: TagRead | undefined): Promise<ScannedFile> {
  const parsed = parseFileName(entry.name)
  const artist = clean(tag?.artist) || clean(parsed.artist) || "Unknown"
  const title = clean(tag?.title) || clean(parsed.title) || "Untitled"
  const year = tag?.year ?? null
  const track: TrackRecord = {
    id: await trackId(entry.path),
    title,
    artist,
    primaryArtist: leadArtist(artist),
    album: clean(tag?.album),
    year,
    duration: finite(tag?.duration),
    genre: mapGenre(tag?.genre ?? ""),
    decade: decadeFromYear(year),
    collections: entry.collection ? [entry.collection] : [],
    path: entry.path,
  }
  return {
    path: entry.path,
    name: entry.name,
    size: entry.size,
    lastModified: entry.lastModified,
    bitrate: finite(tag?.bitrate),
    hasCover: tag?.hasCover === true,
    track,
  }
}

function clean(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? ""
}

function finite(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0
}

function sameRecording(left: ScannedFile, right: ScannedFile) {
  const artist = normaliseName(left.track.primaryArtist || left.track.artist)
  const other = normaliseName(right.track.primaryArtist || right.track.artist)
  if (!artist || artist !== other) return false
  const title = normaliseName(left.track.title)
  if (!title || title !== normaliseName(right.track.title)) return false
  return Math.abs(left.track.duration - right.track.duration) <= 3
}

function prefer(left: ScannedFile, right: ScannedFile) {
  if (left.bitrate !== right.bitrate) return left.bitrate > right.bitrate ? left : right
  if (left.size !== right.size) return left.size > right.size ? left : right
  return left.path.localeCompare(right.path) <= 0 ? left : right
}

async function trackId(path: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(path))
  return [...new Uint8Array(digest)].slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

let worker: Worker | null = null
let requestId = 0

function readTagsWithWorker(batch: { key: string; file: File }[], signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new ScanCancelled())
  const id = requestId + 1
  requestId = id
  const current = getWorker()
  return new Promise<TagRead[]>((resolve, reject) => {
    let settled = false
    const finish = (tags: TagRead[] | null, error?: Error) => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", onAbort)
      current.removeEventListener("message", onMessage)
      current.removeEventListener("error", onError)
      if (error) reject(error)
      else resolve(tags ?? [])
    }
    const onAbort = () => {
      finish(null, new ScanCancelled())
      stopScanWorker()
    }
    const onMessage = (event: MessageEvent<{ id: number; tags: TagRead[] }>) => {
      if (event.data.id !== id) return
      finish(event.data.tags)
    }
    const onError = () => finish(null, new Error("Couldn't read these songs."))
    signal.addEventListener("abort", onAbort, { once: true })
    current.addEventListener("message", onMessage)
    current.addEventListener("error", onError)
    current.postMessage({ id, files: batch })
  })
}

function getWorker() {
  if (!worker) worker = new Worker(new URL("./builder.worker.ts", import.meta.url), { type: "module" })
  return worker
}

export function stopScanWorker() {
  worker?.terminate()
  worker = null
}
