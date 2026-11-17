import type { TrackRecord } from "./types.ts"

export const folderBlockedMessage = "That folder can't be opened here. Choose the UncleMelo Music folder itself."

export class FolderAccessError extends Error {
  constructor(message = folderBlockedMessage) {
    super(message)
    this.name = "FolderAccessError"
  }
}

export function supportsDirectoryPicker() {
  return typeof window.showDirectoryPicker === "function"
}

export async function pickMusicFolder() {
  try {
    return await window.showDirectoryPicker({ mode: "read", id: "unclemelo-music" })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null
    throw new FolderAccessError()
  }
}

export async function readPermission(handle: FileSystemDirectoryHandle) {
  try {
    return await handle.queryPermission({ mode: "read" })
  } catch {
    return "prompt" as PermissionState
  }
}

export async function requestReadPermission(handle: FileSystemDirectoryHandle) {
  try {
    return await handle.requestPermission({ mode: "read" })
  } catch {
    throw new FolderAccessError()
  }
}

export async function readLibraryJson(root: FileSystemDirectoryHandle) {
  const handle = await findLibraryFile(root)
  if (!handle) return null
  try {
    const data: unknown = JSON.parse(await (await handle.getFile()).text())
    const tracks = tracksInLibraryDocument(data)
    if (!tracks) throw new FolderAccessError()
    return tracks
  } catch (error) {
    if (error instanceof FolderAccessError) throw error
    throw new FolderAccessError()
  }
}

async function findLibraryFile(root: FileSystemDirectoryHandle) {
  const direct = await tryFile(root, "library.json")
  if (direct) return direct
  for await (const [name, handle] of root.entries()) {
    if (handle.kind === "file" && sameName(name, "library.json")) return handle
  }
  return null
}

export async function resolveTrackFile(root: FileSystemDirectoryHandle, path: string) {
  const parts = path.split(/[/\\]/).filter(Boolean)
  if (parts.length === 0) throw new FolderAccessError()
  let directory = root
  for (const part of parts.slice(0, -1)) {
    directory = await childDirectory(directory, part)
  }
  const fileHandle = await childFile(directory, parts[parts.length - 1])
  return fileHandle.getFile()
}

async function childDirectory(directory: FileSystemDirectoryHandle, name: string) {
  const direct = await tryDirectory(directory, name)
  if (direct) return direct
  const normalised = await tryDirectory(directory, name.normalize("NFC"))
  if (normalised) return normalised
  for await (const [entryName, handle] of directory.entries()) {
    if (handle.kind === "directory" && sameName(entryName, name)) return handle
  }
  throw new FolderAccessError()
}

async function childFile(directory: FileSystemDirectoryHandle, name: string) {
  const direct = await tryFile(directory, name)
  if (direct) return direct
  const normalised = await tryFile(directory, name.normalize("NFC"))
  if (normalised) return normalised
  for await (const [entryName, handle] of directory.entries()) {
    if (handle.kind === "file" && sameName(entryName, name)) return handle
  }
  throw new FolderAccessError()
}

async function tryDirectory(directory: FileSystemDirectoryHandle, name: string) {
  try {
    return await directory.getDirectoryHandle(name)
  } catch {
    return null
  }
}

async function tryFile(directory: FileSystemDirectoryHandle, name: string) {
  try {
    return await directory.getFileHandle(name)
  } catch {
    return null
  }
}

function sameName(left: string, right: string) {
  return left.normalize("NFC") === right.normalize("NFC")
}

export function tracksInLibraryDocument(data: unknown): TrackRecord[] | null {
  if (!data || typeof data !== "object" || !("tracks" in data)) return null
  const rows = (data as { tracks?: unknown }).tracks
  if (!Array.isArray(rows)) return null
  return rows.map(asTrack).filter((track): track is TrackRecord => track !== null)
}

function asTrack(value: unknown): TrackRecord | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== "string" || typeof row.path !== "string") return null
  return {
    id: row.id,
    title: typeof row.title === "string" ? row.title : "Untitled",
    artist: typeof row.artist === "string" ? row.artist : "Unknown",
    primaryArtist: typeof row.primaryArtist === "string" ? row.primaryArtist : undefined,
    album: typeof row.album === "string" ? row.album : "",
    year: typeof row.year === "number" ? row.year : null,
    duration: typeof row.duration === "number" ? row.duration : 0,
    genre: typeof row.genre === "string" ? row.genre : "",
    decade: typeof row.decade === "string" ? row.decade : "",
    collections: Array.isArray(row.collections)
      ? row.collections.filter((item): item is string => typeof item === "string")
      : [],
    path: row.path,
  }
}
