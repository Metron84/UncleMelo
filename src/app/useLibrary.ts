import { useEffect, useRef, useState } from "react"
import {
  buildLibrary,
  collectAudio,
  filesFromList,
  ScanCancelled,
  stopScanWorker,
  type FileEntry,
  type ScanProgress,
  type ScannedFile,
} from "../library/builder.ts"
import { db, loadDirectory, loadScanned, saveBuiltLibrary, saveDirectory, saveJsonLibrary } from "../library/db.ts"
import {
  folderBlockedMessage,
  pickMusicFolder,
  readLibraryJson,
  readPermission,
  requestReadPermission,
  supportsDirectoryPicker,
} from "../library/folder.ts"
import type { TrackRecord } from "../library/types.ts"

export type LibraryView = "loading" | "welcome" | "reconnect" | "ready"

const emptyFolderMessage = "No music files were found in that folder."

export function useLibrary() {
  const [view, setView] = useState<LibraryView>("loading")
  const [tracks, setTracks] = useState<TrackRecord[]>([])
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [sessionOnly, setSessionOnly] = useState(false)
  const handleRef = useRef<FileSystemDirectoryHandle | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const filesRef = useRef(new Map<string, File>())
  const sessionEntries = useRef<FileEntry[]>([])
  const sessionScanned = useRef<ScannedFile[]>([])

  useEffect(() => {
    let live = true
    const controller = new AbortController()
    abortRef.current = controller
    async function boot() {
      const stored = supportsDirectoryPicker() ? await loadDirectory() : null
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
      setBusy(true)
      try {
        let rows = await db.tracks.toArray()
        if (rows.length === 0) {
          setView("welcome")
          rows = await ingest(stored, controller.signal)
        }
        if (!live) return
        setTracks(rows)
        setView("ready")
      } catch (error) {
        if (!live || abortRef.current !== controller) return
        if (!(error instanceof ScanCancelled)) setMessage(error instanceof Error ? error.message : folderBlockedMessage)
        setView("welcome")
      } finally {
        if (live && abortRef.current === controller) {
          setBusy(false)
          setProgress(null)
        }
      }
    }
    void boot()
    return () => {
      live = false
      controller.abort()
      stopScanWorker()
    }
  }, [])

  function remember(directory: FileSystemDirectoryHandle) {
    handleRef.current = directory
    setHandle(directory)
  }

  function begin() {
    abortRef.current?.abort()
    stopScanWorker()
    const controller = new AbortController()
    abortRef.current = controller
    return controller
  }

  async function ingest(directory: FileSystemDirectoryHandle, signal: AbortSignal) {
    const json = await readLibraryJson(directory)
    if (signal.aborted) throw new ScanCancelled()
    if (json) {
      await saveJsonLibrary(json)
      await saveDirectory(directory)
      return json
    }
    const previous = await loadScanned()
    const entries = await collectAudio(directory, signal)
    if (entries.length === 0) throw new Error(emptyFolderMessage)
    const built = await buildLibrary(entries, previous, setProgress, signal)
    await saveBuiltLibrary(built.tracks, built.scanned)
    await saveDirectory(directory)
    return built.tracks
  }

  async function choose() {
    setBusy(true)
    setMessage(null)
    const controller = begin()
    try {
      const directory = await pickMusicFolder()
      if (!directory) return
      const rows = await ingest(directory, controller.signal)
      filesRef.current = new Map()
      sessionEntries.current = []
      sessionScanned.current = []
      setSessionOnly(false)
      remember(directory)
      setTracks(rows)
      setView("ready")
    } catch (error) {
      if (abortRef.current !== controller || error instanceof ScanCancelled) return
      setMessage(error instanceof Error ? error.message : folderBlockedMessage)
    } finally {
      if (abortRef.current === controller) {
        setBusy(false)
        setProgress(null)
      }
    }
  }

  async function chooseFiles(list: FileList) {
    const entries = filesFromList(list)
    if (entries.length === 0) {
      setMessage("No music files were found.")
      return
    }
    setBusy(true)
    setMessage(null)
    const controller = begin()
    try {
      const built = await buildLibrary(entries, [], setProgress, controller.signal)
      filesRef.current = new Map(entries.map((entry) => [entry.path, entry.file]))
      sessionEntries.current = entries
      sessionScanned.current = built.scanned
      handleRef.current = null
      setHandle(null)
      setSessionOnly(true)
      setTracks(built.tracks)
      setView("ready")
    } catch (error) {
      if (abortRef.current !== controller || error instanceof ScanCancelled) return
      setMessage(error instanceof Error ? error.message : "Those files couldn't be read.")
    } finally {
      if (abortRef.current === controller) {
        setBusy(false)
        setProgress(null)
      }
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
      let rows = await db.tracks.toArray()
      if (rows.length === 0) rows = await ingest(directory, begin().signal)
      setTracks(rows)
      setView("ready")
    } catch (error) {
      if (error instanceof ScanCancelled) return
      setMessage(error instanceof Error ? error.message : folderBlockedMessage)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function rescan() {
    setBusy(true)
    setMessage(null)
    const controller = begin()
    try {
      if (sessionOnly) {
        const built = await buildLibrary(sessionEntries.current, sessionScanned.current, setProgress, controller.signal)
        sessionScanned.current = built.scanned
        setTracks(built.tracks)
        return
      }
      const directory = handleRef.current
      if (!directory) return
      const state = await readPermission(directory)
      if (state !== "granted") {
        setView("reconnect")
        return
      }
      setTracks(await ingest(directory, controller.signal))
    } catch (error) {
      if (abortRef.current !== controller || error instanceof ScanCancelled) return
      setMessage(error instanceof Error ? error.message : folderBlockedMessage)
    } finally {
      if (abortRef.current === controller) {
        setBusy(false)
        setProgress(null)
      }
    }
  }

  function cancelScan() {
    abortRef.current?.abort()
    stopScanWorker()
  }

  function loseAccess() {
    setView("reconnect")
  }

  function fileFor(path: string) {
    return filesRef.current.get(path) ?? null
  }

  return {
    view,
    tracks,
    busy,
    message,
    progress,
    sessionOnly,
    handle,
    choose,
    chooseFiles,
    reconnect,
    rescan,
    cancelScan,
    loseAccess,
    fileFor,
  }
}
