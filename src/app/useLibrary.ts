import { useEffect, useRef, useState } from "react"
import { loadDirectory, replaceTracks, saveDirectory, db } from "../library/db.ts"
import {
  folderBlockedMessage,
  pickMusicFolder,
  readLibraryJson,
  readPermission,
  requestReadPermission,
  supportsDirectoryPicker,
} from "../library/folder.ts"
import type { TrackRecord } from "../library/types.ts"

export type LibraryView = "loading" | "unsupported" | "welcome" | "reconnect" | "ready"

export function useLibrary() {
  const [view, setView] = useState<LibraryView>("loading")
  const [tracks, setTracks] = useState<TrackRecord[]>([])
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const handleRef = useRef<FileSystemDirectoryHandle | null>(null)

  useEffect(() => {
    let live = true
    async function boot() {
      if (!supportsDirectoryPicker()) {
        if (live) setView("unsupported")
        return
      }
      const stored = await loadDirectory()
      if (!live) return
      if (!stored) {
        setView("welcome")
        return
      }
      remember(stored)
      const state = await readPermission(stored)
      if (!live) return
      if (state !== "granted") {
        setView("reconnect")
        return
      }
      await openGranted(stored, live)
    }
    boot().catch(() => {
      if (live) {
        setMessage(folderBlockedMessage)
        setView("welcome")
      }
    })
    return () => {
      live = false
    }
  }, [])

  function remember(directory: FileSystemDirectoryHandle) {
    handleRef.current = directory
    setHandle(directory)
  }

  async function openGranted(directory: FileSystemDirectoryHandle, live = true) {
    remember(directory)
    let rows = await db.tracks.toArray()
    if (rows.length === 0) rows = await ingest(directory)
    if (!live) return
    setTracks(rows)
    setView("ready")
  }

  async function choose() {
    setBusy(true)
    setMessage(null)
    try {
      const directory = await pickMusicFolder()
      if (!directory) return
      const rows = await ingest(directory)
      remember(directory)
      setTracks(rows)
      setView("ready")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : folderBlockedMessage)
    } finally {
      setBusy(false)
    }
  }

  async function reconnect() {
    const directory = handleRef.current
    if (!directory) {
      setView("welcome")
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const state = await requestReadPermission(directory)
      if (state !== "granted") return
      await openGranted(directory)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : folderBlockedMessage)
    } finally {
      setBusy(false)
    }
  }

  async function rescan() {
    const directory = handleRef.current
    if (!directory) return
    setBusy(true)
    setMessage(null)
    try {
      const state = await readPermission(directory)
      if (state !== "granted") {
        setView("reconnect")
        return
      }
      const rows = await ingest(directory)
      setTracks(rows)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : folderBlockedMessage)
    } finally {
      setBusy(false)
    }
  }

  function loseAccess() {
    setView("reconnect")
  }

  return { view, tracks, busy, message, handle, choose, reconnect, rescan, loseAccess }
}

async function ingest(directory: FileSystemDirectoryHandle) {
  const rows = await readLibraryJson(directory)
  await replaceTracks(rows)
  await saveDirectory(directory)
  return rows
}
