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
  tracksInLibraryDocument,
} from "../library/folder.ts"
import { clearPhoneMusic, listPhoneFiles, openPhoneWriter, phoneStorageAvailable, writePhoneFile } from "../library/phone.ts"
import type { TrackRecord } from "../library/types.ts"
import { readZip } from "../library/zip.ts"

export type LibraryView = "loading" | "welcome" | "reconnect" | "ready"

const emptyFolderMessage = "No music files were found in that folder."
const phoneKey = "phoneLibrary"

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
  const phoneRef = useRef(false)

  useEffect(() => {
    let live = true
    const controller = new AbortController()
    abortRef.current = controller
    async function boot() {
      const stored = supportsDirectoryPicker() ? await loadDirectory() : null
      if (!live) return
      if (!stored) {
        const phoneTracks = await loadPhoneTracks()
        if (!live) return
        if (phoneTracks) {
          phoneRef.current = true
          setTracks(phoneTracks)
          setView("ready")
          return
        }
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
    const picked = [...list]
    const zips = picked.filter((file) => file.name.toLocaleLowerCase().endsWith(".zip"))
    const loose = filesFromList(picked.filter((file) => !file.name.toLocaleLowerCase().endsWith(".zip")))
    if (zips.length === 0 && loose.length === 0) {
      setMessage("No music files were found.")
      return
    }
    setBusy(true)
    setMessage(null)
    const controller = begin()
    try {
      if (!phoneStorageAvailable()) throw new Error("This browser can't keep the music on the phone.")
      await keepPhoneStorage()
      await ensureRoom(zips, loose)
      await clearPhoneMusic()
      let libraryText: string | null = null
      for (const zip of zips) {
        const writer = openPhoneWriter()
        try {
          const saved = await readZip(
            zip,
            async (path, data, final) => {
              await writer.write(path, data, final)
            },
            (read, total) => {
              const scale = 1024 * 1024
              setProgress({
                done: Math.round(read / scale),
                total: Math.max(1, Math.round(total / scale)),
                label: "Saving your music",
              })
            },
            controller.signal,
          )
          libraryText = saved.libraryText ?? libraryText
        } finally {
          await writer.close()
        }
      }
      for (const entry of loose) {
        await writePhoneFile(entry.path, new Uint8Array(await entry.file.arrayBuffer()))
      }
      const entries = (await listPhoneFiles()).map(entryFromStored)
      if (entries.length === 0) throw new Error("No music files were found.")
      const rows = await tracksFromPhone(entries, libraryText, controller.signal, setProgress)
      await db.settings.put({ key: phoneKey, value: true })
      filesRef.current = new Map()
      sessionEntries.current = []
      sessionScanned.current = []
      phoneRef.current = true
      setSessionOnly(false)
      handleRef.current = null
      setHandle(null)
      setTracks(rows)
      setView("ready")
    } catch (error) {
      if (abortRef.current !== controller) return
      if (error instanceof ScanCancelled) {
        await db.settings.put({ key: phoneKey, value: false })
        return
      }
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
      if (phoneRef.current && !handleRef.current) {
        const entries = (await listPhoneFiles()).map(entryFromStored)
        const built = await buildLibrary(entries, await loadScanned(), setProgress, controller.signal)
        await saveBuiltLibrary(built.tracks, built.scanned)
        setTracks(built.tracks)
        return
      }
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

function entryFromStored(item: { path: string; file: File }): FileEntry {
  const name = item.path.split("/").pop() ?? item.path
  return {
    path: item.path,
    name,
    size: item.file.size,
    lastModified: item.file.lastModified,
    file: item.file,
    collection: item.path.includes("/") ? item.path.slice(0, item.path.indexOf("/")) : null,
  }
}

async function loadPhoneTracks() {
  if (!phoneStorageAvailable()) return null
  const row = await db.settings.get(phoneKey)
  if (row?.value !== true) return null
  const tracks = await db.tracks.toArray()
  return tracks.length > 0 ? tracks : null
}

async function keepPhoneStorage() {
  try {
    await navigator.storage.persist?.()
  } catch {
    return
  }
}

async function ensureRoom(zips: File[], loose: FileEntry[]) {
  const estimate = await navigator.storage.estimate()
  const free = (estimate.quota ?? 0) - (estimate.usage ?? 0)
  const incoming = zips.reduce((sum, file) => sum + file.size, 0) + loose.reduce((sum, entry) => sum + entry.size, 0)
  if (free > 0 && incoming > free) throw new Error("This phone doesn't have room for that library.")
}

async function tracksFromPhone(
  entries: FileEntry[],
  libraryText: string | null,
  signal: AbortSignal,
  onProgress: (progress: ScanProgress) => void,
) {
  const listed = new Set(entries.map((entry) => entry.path))
  let parsed: TrackRecord[] | null = null
  if (libraryText) {
    try {
      parsed = tracksInLibraryDocument(JSON.parse(libraryText))
    } catch {
      parsed = null
    }
  }
  const matched = parsed?.filter((track) => listed.has(track.path)) ?? []
  if (matched.length > 0) {
    await saveJsonLibrary(matched)
    return matched
  }
  const built = await buildLibrary(entries, [], onProgress, signal)
  await saveBuiltLibrary(built.tracks, built.scanned)
  return built.tracks
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
