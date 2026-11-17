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

export type PlayRecord = {
  id?: number
  trackId: string
  startedAt: number
  playedSeconds: number
  completed: boolean
  skipped: boolean
  hour: number
  mode: string
}

const directoryKey = "directory"
const lastTrackKey = "lastTrackId"
const modeKey = "mode"

const stores = {
  tracks: "id, genre, decade, artist, *collections",
  settings: "key",
  covers: "id",
}

class UncleMeloDB extends Dexie {
  tracks!: Table<TrackRecord, string>
  settings!: Table<SettingRecord, string>
  covers!: Table<CoverRecord, string>
  plays!: Table<PlayRecord, number>

  constructor() {
    super("unclemelo")
    this.version(1).stores(stores)
    this.version(2).stores({
      ...stores,
      plays: "++id, trackId, startedAt, mode",
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

export async function saveMode(mode: string) {
  await db.settings.put({ key: modeKey, value: mode })
}

export async function loadMode() {
  const row = await db.settings.get(modeKey)
  return typeof row?.value === "string" ? row.value : null
}

export async function recordPlay(play: PlayRecord) {
  await db.plays.add(play)
}

export async function loadPlays() {
  return db.plays.orderBy("startedAt").toArray()
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
