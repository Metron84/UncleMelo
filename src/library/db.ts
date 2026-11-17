import Dexie, { type Table } from "dexie"
import type { TrackRecord } from "./types.ts"

type SettingRecord = {
  key: string
  value: unknown
}

type CoverRecord = {
  id: string
  blob: Blob
}

const directoryKey = "directory"
const lastTrackKey = "lastTrackId"

class UncleMeloDB extends Dexie {
  tracks!: Table<TrackRecord, string>
  settings!: Table<SettingRecord, string>
  covers!: Table<CoverRecord, string>

  constructor() {
    super("unclemelo")
    this.version(1).stores({
      tracks: "id, genre, decade, artist, *collections",
      settings: "key",
      covers: "id",
    })
  }
}

export const db = new UncleMeloDB()

export async function saveDirectory(handle: FileSystemDirectoryHandle) {
  await db.settings.put({ key: directoryKey, value: handle })
}

export async function loadDirectory() {
  const row = await db.settings.get(directoryKey)
  return isDirectoryHandle(row?.value) ? row.value : null
}

export async function saveLastTrackId(id: string) {
  await db.settings.put({ key: lastTrackKey, value: id })
}

export async function loadLastTrackId() {
  const row = await db.settings.get(lastTrackKey)
  return typeof row?.value === "string" ? row.value : null
}

export async function replaceTracks(tracks: TrackRecord[]) {
  await db.transaction("rw", db.tracks, async () => {
    await db.tracks.clear()
    await db.tracks.bulkPut(tracks)
  })
}

export async function loadCover(id: string) {
  const row = await db.covers.get(id)
  return row?.blob ?? null
}

export async function saveCover(id: string, blob: Blob) {
  await db.covers.put({ id, blob })
}

function isDirectoryHandle(value: unknown): value is FileSystemDirectoryHandle {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "directory"
}
