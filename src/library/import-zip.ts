import { ScanCancelled, type FileEntry, type ScanProgress } from "./builder.ts"
import { loadImported, saveImported } from "./db.ts"
import { tracksInLibraryDocument } from "./folder.ts"
import { openLibrarySink } from "./phone.ts"
import { importSpaceNeeded, sortZipFiles, spaceShortfallMessage, type StoredImport } from "./zip.ts"
import type { TrackRecord } from "./types.ts"

export class StorageSpaceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StorageSpaceError"
  }
}

type Inspected = {
  total: number
  already: number
  alreadyBytes: number
  remainingBytes: number
}

type WorkerOut =
  | ({ type: "inspected" } & Inspected)
  | { type: "library"; text: string }
  | { type: "progress"; done: number; total: number }
  | { type: "saved"; path: string; size: number; done: number; total: number }
  | { type: "skipped"; name: string; path: string; reason: string; done: number; total: number }
  | { type: "error"; message: string }
  | { type: "finished"; cancelled?: boolean }

let active: Worker | null = null
let pending: ((message: WorkerOut) => void) | null = null
let rejectPending: ((error: Error) => void) | null = null
const queue: WorkerOut[] = []

function worker() {
  if (!active) {
    active = new Worker(new URL("./zip.worker.ts", import.meta.url), { type: "module" })
    active.onmessage = (event: MessageEvent<WorkerOut>) => {
      if (pending) {
        const resolve = pending
        pending = null
        rejectPending = null
        resolve(event.data)
        return
      }
      queue.push(event.data)
    }
    active.onerror = () => {
      const reject = rejectPending
      pending = null
      rejectPending = null
      reject?.(new Error("That zip couldn't be read."))
    }
  }
  return active
}

function nextMessage(signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new ScanCancelled())
  const queued = queue.shift()
  if (queued) return Promise.resolve(queued)
  return new Promise<WorkerOut>((resolve, reject) => {
    const onAbort = () => {
      pending = null
      rejectPending = null
      stopZipWorker()
      reject(new ScanCancelled())
    }
    signal.addEventListener("abort", onAbort, { once: true })
    pending = (message) => {
      signal.removeEventListener("abort", onAbort)
      resolve(message)
    }
    rejectPending = (error) => {
      signal.removeEventListener("abort", onAbort)
      reject(error)
    }
  })
}

export function stopZipWorker() {
  active?.terminate()
  active = null
  pending = null
  rejectPending = null
  queue.length = 0
}

export async function requestWakeLock() {
  let current: WakeLockSentinel | null = null
  const request = async () => {
    try {
      current = (await navigator.wakeLock?.request("screen")) ?? null
    } catch {
      current = null
    }
  }
  await request()
  const onChange = () => {
    if (document.visibilityState === "visible") void request()
  }
  document.addEventListener("visibilitychange", onChange)
  return async () => {
    document.removeEventListener("visibilitychange", onChange)
    try {
      await current?.release()
    } catch {
      return
    }
  }
}

export async function importPhoneZips(options: {
  zips: File[]
  loose: FileEntry[]
  signal: AbortSignal
  onProgress: (progress: ScanProgress) => void
  onNotice: (done: number, total: number) => void
}) {
  const zips = sortZipFiles(options.zips)
  try {
    await navigator.storage.persist?.()
  } catch {
    // Persistence is best-effort. The quota check still runs.
  }
  const completed = await loadImported()
  const inspections: { file: File; info: Inspected }[] = []
  const failedZips: string[] = []
  for (const file of zips) {
    if (options.signal.aborted) throw new ScanCancelled()
    try {
      const reply = await post({ type: "inspect", file, completed }, options.signal)
      if (reply.type !== "inspected") throw new Error("That zip couldn't be read.")
      inspections.push({ file, info: reply })
    } catch (error) {
      if (error instanceof ScanCancelled || error instanceof StorageSpaceError) throw error
      console.error("Skipped zip", file.name, error)
      failedZips.push(file.name)
    }
  }

  const looseDone = options.loose.filter((entry) => alreadyStored(completed, entry.path, entry.size))
  const loosePending = options.loose.filter((entry) => !alreadyStored(completed, entry.path, entry.size))
  const zipBytes = inspections.reduce((sum, item) => sum + item.file.size, 0)
  const looseBytes = options.loose.reduce((sum, entry) => sum + entry.size, 0)
  const alreadyBytes = inspections.reduce((sum, item) => sum + item.info.alreadyBytes, 0) + looseDone.reduce((sum, entry) => sum + entry.size, 0)
  const remainingBytes = inspections.reduce((sum, item) => sum + item.info.remainingBytes, 0) + loosePending.reduce((sum, entry) => sum + entry.size, 0)
  const needed = importSpaceNeeded(zipBytes + looseBytes, alreadyBytes, remainingBytes)
  const estimate = await navigator.storage.estimate()
  const free = Math.max(0, (estimate.quota ?? 0) - (estimate.usage ?? 0))
  const space = spaceShortfallMessage(free, needed)
  if (space) throw new StorageSpaceError(space)

  const total = inspections.reduce((sum, item) => sum + item.info.total, 0) + options.loose.length
  const already = inspections.reduce((sum, item) => sum + item.info.already, 0) + looseDone.length
  if (inspections.length === 0 && options.loose.length === 0) throw new Error("That zip couldn't be read.")
  if (total === 0) throw new Error("No music files were found.")
  options.onNotice(already, total)
  options.onProgress({ done: already, total, label: "Saving your music" })

  const skipped = [...failedZips]
  const libraryTracks: TrackRecord[] = []
  const recorded = completed.slice()
  let imported = looseDone.length
  let finished = 0
  for (const [index, item] of inspections.entries()) {
    if (options.signal.aborted) throw new ScanCancelled()
    const futureAlready = inspections.slice(index + 1).reduce((sum, next) => sum + next.info.already, 0)
    try {
      const saved = await extractZip(item.file, recorded, options.signal, (done) => {
        options.onProgress({
          done: finished + done + futureAlready + looseDone.length,
          total,
          label: "Saving your music",
        })
      })
      skipped.push(...saved.skipped)
      recorded.push(...saved.saved)
      libraryTracks.push(...saved.tracks)
      imported += item.info.already + saved.saved.length
    } catch (error) {
      if (error instanceof ScanCancelled || error instanceof StorageSpaceError) throw error
      console.error("Skipped zip", item.file.name, error)
      skipped.push(item.file.name)
      imported += item.info.already
    }
    finished += item.info.total
  }

  for (const [index, entry] of options.loose.entries()) {
    if (options.signal.aborted) throw new ScanCancelled()
    if (!alreadyStored(recorded, entry.path, entry.size)) {
      try {
        await streamLooseFile(entry)
        await saveImported(entry.path, entry.size)
        recorded.push({ path: entry.path, size: entry.size })
        imported += 1
      } catch (error) {
        console.error("Skipped song", entry.name, error)
        skipped.push(entry.name)
      }
    }
    options.onProgress({ done: finished + index + 1, total, label: "Saving your music" })
  }

  const seen = new Set<string>()
  const tracks = libraryTracks.filter((track) => {
    if (seen.has(track.path)) return false
    seen.add(track.path)
    return true
  })
  return {
    libraryText: tracks.length > 0 ? JSON.stringify({ tracks }) : null,
    imported,
    total,
    skipped,
  }
}

function alreadyStored(rows: readonly StoredImport[], path: string, size: number) {
  return size > 0 && rows.some((row) => row.path === path && row.size === size)
}

async function post(message: { type: "inspect"; file: File; completed: StoredImport[] }, signal: AbortSignal) {
  worker().postMessage(message)
  const reply = await nextMessage(signal)
  if (reply.type === "error") throw new Error(reply.message)
  return reply
}

async function extractZip(
  file: File,
  completed: StoredImport[],
  signal: AbortSignal,
  onDone: (done: number) => void,
) {
  worker().postMessage({ type: "extract", file, completed })
  const skipped: string[] = []
  const saved: StoredImport[] = []
  const tracks: TrackRecord[] = []
  while (true) {
    const message = await nextMessage(signal)
    if (message.type === "error") throw new Error(message.message)
    if (message.type === "finished") {
      if (message.cancelled) throw new ScanCancelled()
      return { skipped, saved, tracks }
    }
    if (message.type === "progress") onDone(message.done)
    if (message.type === "library") {
      const parsed = libraryTracks(message.text)
      if (parsed) tracks.push(...parsed)
      worker().postMessage({ type: "ack" })
    }
    if (message.type === "saved") {
      onDone(message.done)
      try {
        await saveImported(message.path, message.size)
        saved.push({ path: message.path, size: message.size })
      } catch (error) {
        console.error("Skipped song", message.path, error)
        skipped.push(message.path.split("/").pop() ?? message.path)
      }
      worker().postMessage({ type: "ack" })
    }
    if (message.type === "skipped") {
      onDone(message.done)
      console.error("Skipped song", message.name, message.reason)
      skipped.push(message.name)
      worker().postMessage({ type: "ack" })
    }
  }
}

function libraryTracks(text: string) {
  try {
    return tracksInLibraryDocument(JSON.parse(text))
  } catch {
    return null
  }
}

async function streamLooseFile(entry: FileEntry) {
  const sink = await openLibrarySink(entry.path)
  try {
    const reader = entry.file.stream().getReader()
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        await sink.write(chunk.value)
      }
    } finally {
      reader.releaseLock()
    }
    await sink.close()
  } catch (error) {
    await sink.abort()
    throw error
  }
}
