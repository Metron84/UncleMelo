import Dexie, { type Table } from "dexie"
import type { ScannedFile } from "./builder.ts"
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
const shuffleKey = "shuffle"
const repeatKey = "repeat"
const crossfadeKey = "crossfade"

export type ImportRecord = {
  path: string
  size: number
}

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
  scanned!: Table<ScannedFile, string>
  imports!: Table<ImportRecord, string>
  loves!: Table<{ id: string }, string>
  hidden!: Table<{ id: string }, string>

  constructor() {
    super("unclemelo")
    this.version(1).stores(stores)
    this.version(2).stores({
      ...stores,
      plays: "++id, trackId, startedAt, mode",
    })
    this.version(3).stores({
      ...stores,
      plays: "++id, trackId, startedAt, mode",
      scanned: "path",
    })
    this.version(4).stores({
      imports: "path",
    })
    this.version(5).stores({
      loves: "id",
      hidden: "id",
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

export async function loadShuffle() {
  const row = await db.settings.get(shuffleKey)
  return row?.value === true
}

export async function saveShuffle(on: boolean) {
  await db.settings.put({ key: shuffleKey, value: on })
}

export async function loadRepeat() {
  const row = await db.settings.get(repeatKey)
  return row?.value === "all" || row?.value === "one" ? row.value : "off"
}

export async function saveRepeat(mode: "off" | "all" | "one") {
  await db.settings.put({ key: repeatKey, value: mode })
}

export async function loadCrossfade() {
  const row = await db.settings.get(crossfadeKey)
  return row?.value === 0 || row?.value === 3 || row?.value === 6 || row?.value === 10 ? row.value : 6
}

export async function saveCrossfade(seconds: number) {
  await db.settings.put({ key: crossfadeKey, value: seconds })
}

export async function loadLoveIds() {
  return (await db.loves.toArray()).map((row) => row.id)
}

export async function saveLove(id: string, loved: boolean) {
  if (loved) await db.loves.put({ id })
  else await db.loves.delete(id)
}

export async function loadHiddenIds() {
  return (await db.hidden.toArray()).map((row) => row.id)
}

export async function saveHidden(id: string) {
  await db.hidden.put({ id })
}

export async function deleteHidden(id: string) {
  await db.hidden.delete(id)
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

export async function loadScanned() {
  return db.scanned.toArray()
}

export async function loadImported() {
  return db.imports.toArray()
}

export async function saveImported(path: string, size: number) {
  await db.imports.put({ path, size })
}

export async function saveJsonLibrary(tracks: TrackRecord[]) {
  await db.transaction("rw", db.tracks, db.scanned, async () => {
    await db.scanned.clear()
    await db.tracks.clear()
    await db.tracks.bulkPut(tracks)
  })
}

export async function saveBuiltLibrary(tracks: TrackRecord[], scanned: ScannedFile[]) {
  await db.transaction("rw", db.tracks, db.scanned, async () => {
    await db.tracks.clear()
    await db.scanned.clear()
    await db.tracks.bulkPut(tracks)
    await db.scanned.bulkPut(scanned)
  })
}

export async function loadAllCovers() {
  return db.covers.toArray()
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
