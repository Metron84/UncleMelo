import { useEffect, useRef, useState } from "react"
import {
  audioElement,
  hasLoadedFile,
  pausePlayback,
  playFile,
  resumePlayback,
  setMediaSession,
  setPlaybackState,
} from "../engine/player.ts"
import { artworkFor } from "../library/artwork.ts"
import { sortLibrary } from "../library/browse.ts"
import { loadLastTrackId, saveLastTrackId } from "../library/db.ts"
import { readPermission, resolveTrackFile } from "../library/folder.ts"
import type { TrackRecord } from "../library/types.ts"

export function usePlayback(
  directory: FileSystemDirectoryHandle | null,
  tracks: TrackRecord[],
  onPermissionLost: () => void,
) {
  const [queue, setQueue] = useState<TrackRecord[]>([])
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(0)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [coverType, setCoverType] = useState("image/jpeg")
  const [notice, setNotice] = useState<string | null>(null)

  const directoryRef = useRef(directory)
  const queueRef = useRef(queue)
  const indexRef = useRef(index)
  const coverUrlRef = useRef<string | null>(null)
  const loadedId = useRef<string | null>(null)
  const playToken = useRef(0)
  const booted = useRef(false)
  const lostAccess = useRef(onPermissionLost)
  const actions = useRef({ toggle: () => {}, next: () => {}, previous: () => {} })

  useEffect(() => {
    directoryRef.current = directory
    queueRef.current = queue
    indexRef.current = index
    lostAccess.current = onPermissionLost
    actions.current = { toggle: () => void toggle(), next: () => skip(1), previous }
  })

  useEffect(() => {
    if (tracks.length === 0 || booted.current) return
    let live = true
    loadLastTrackId()
      .then((last) => {
        if (!live) return
        const sorted = sortLibrary(tracks)
        const found = last ? sorted.findIndex((track) => track.id === last) : 0
        setQueue(sorted)
        setIndex(found >= 0 ? found : 0)
        booted.current = true
      })
      .catch(() => {
        if (!live) return
        setQueue(sortLibrary(tracks))
        setIndex(0)
        booted.current = true
      })
    return () => {
      live = false
    }
  }, [tracks])

  useEffect(() => {
    if (!booted.current) return
    const next = queueRef.current
      .map((item) => tracks.find((track) => track.id === item.id) ?? null)
      .filter((item): item is TrackRecord => item !== null)
    const list = next.length > 0 ? next : sortLibrary(tracks)
    setQueue(list)
    setIndex((current) => (list.length === 0 ? 0 : Math.min(current, list.length - 1)))
  }, [tracks])

  useEffect(() => {
    const audio = audioElement()
    const onTime = () => setElapsed(audio.currentTime)
    const onMeta = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => actions.current.next()
    audio.addEventListener("timeupdate", onTime)
    audio.addEventListener("loadedmetadata", onMeta)
    audio.addEventListener("durationchange", onMeta)
    audio.addEventListener("play", onPlay)
    audio.addEventListener("pause", onPause)
    audio.addEventListener("ended", onEnded)
    return () => {
      audio.removeEventListener("timeupdate", onTime)
      audio.removeEventListener("loadedmetadata", onMeta)
      audio.removeEventListener("durationchange", onMeta)
      audio.removeEventListener("play", onPlay)
      audio.removeEventListener("pause", onPause)
      audio.removeEventListener("ended", onEnded)
    }
  }, [])

  function rememberCover(blob: Blob | null) {
    if (coverUrlRef.current) URL.revokeObjectURL(coverUrlRef.current)
    const url = blob ? URL.createObjectURL(blob) : null
    coverUrlRef.current = url
    setCoverType(blob?.type || "image/jpeg")
    setCoverUrl(url)
  }

  async function begin(track: TrackRecord) {
    const folder = directoryRef.current
    if (!folder) return
    const token = ++playToken.current
    setNotice(null)
    setElapsed(0)
    setDuration(track.duration)
    rememberCover(null)
    try {
      await saveLastTrackId(track.id)
      const file = await resolveTrackFile(folder, track.path)
      if (token !== playToken.current) return
      loadedId.current = track.id
      await playFile(file)
      if (token !== playToken.current) return
      const blob = await artworkFor(track.id, file)
      if (token !== playToken.current) return
      rememberCover(blob)
    } catch {
      if (token !== playToken.current) return
      setPlaying(false)
      const folder = directoryRef.current
      const state = folder ? await readPermission(folder) : "prompt"
      pausePlayback()
      if (state !== "granted") lostAccess.current()
      else setNotice("That song couldn't be opened.")
    }
  }

  function skip(step: number) {
    const list = queueRef.current
    if (list.length === 0) return
    const nextIndex = (indexRef.current + step + list.length) % list.length
    setIndex(nextIndex)
    void begin(list[nextIndex])
  }

  function previous() {
    skip(-1)
  }

  async function toggle() {
    const track = queueRef.current[indexRef.current]
    if (!track) return
    if (loadedId.current === track.id && hasLoadedFile()) {
      if (audioElement().paused) {
        try {
          await resumePlayback()
        } catch {
          setNotice("That song couldn't be opened.")
        }
      } else {
        pausePlayback()
      }
      return
    }
    await begin(track)
  }

  const track = queue[index] ?? null
  const next = queue.length > 1 ? queue[(index + 1) % queue.length] : null

  useEffect(() => {
    if (!track) return
    setMediaSession(
      { title: track.title, artist: track.artist, album: track.album, artwork: coverUrl, artworkType: coverType },
      {
        play: () => actions.current.toggle(),
        pause: () => pausePlayback(),
        next: () => actions.current.next(),
        previous: () => actions.current.previous(),
      },
    )
    setPlaybackState(playing)
  }, [track, coverUrl, coverType, playing])

  function playList(list: TrackRecord[], at: number) {
    if (list.length === 0) return
    const safe = Math.min(Math.max(at, 0), list.length - 1)
    setQueue(list)
    setIndex(safe)
    void begin(list[safe])
  }

  return {
    track,
    next,
    playing,
    elapsed,
    duration: duration > 0 ? duration : (track?.duration ?? 0),
    coverUrl,
    notice,
    toggle: () => void toggle(),
    previous,
    nextTrack: () => skip(1),
    playList,
  }
}
