import { useEffect, useMemo, useRef, useState } from "react"
import { isListeningMode, listeningModes, pickNext, type ListeningMode, type PlayHistory } from "../brain/pick.ts"
import {
  audioElement,
  hasLoadedFile,
  pausePlayback,
  playFile,
  playbackTime,
  restartTrack,
  resumePlayback,
  setMediaSession,
  setPlaybackState,
  setUpcomingProvider,
  subscribePlayback,
  type Handoff,
} from "../engine/player.ts"
import { artworkFor, genreSquareUrl } from "../library/artwork.ts"
import { genreCover, sortLibrary } from "../library/browse.ts"
import { loadLastTrackId, loadMode, loadPlays, recordPlay, saveLastTrackId, saveMode, type PlayRecord } from "../library/db.ts"
import { readPermission, resolveTrackFile } from "../library/folder.ts"
import type { TrackRecord } from "../library/types.ts"

type Session = {
  trackId: string
  startedAt: number
  hour: number
  mode: string
  logged: boolean
}

type CoverArt = { url: string; type: string }

export function usePlayback(
  directory: FileSystemDirectoryHandle | null,
  tracks: TrackRecord[],
  onPermissionLost: () => void,
) {
  const [queue, setQueue] = useState<TrackRecord[]>([])
  const [index, setIndex] = useState(0)
  const [current, setCurrent] = useState<TrackRecord | null>(null)
  const [endless, setEndless] = useState(false)
  const [mode, setMode] = useState<ListeningMode>("Late Night")
  const [history, setHistory] = useState<PlayHistory[]>([])
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(0)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const directoryRef = useRef(directory)
  const tracksRef = useRef(tracks)
  const queueRef = useRef(queue)
  const indexRef = useRef(index)
  const currentRef = useRef(current)
  const nextRef = useRef<TrackRecord | null>(null)
  const endlessRef = useRef(endless)
  const modeRef = useRef(mode)
  const historyRef = useRef(history)
  const sessionRef = useRef<Session | null>(null)
  const armedRef = useRef<TrackRecord | null>(null)
  const coversRef = useRef(new Map<string, CoverArt>())
  const booted = useRef(false)
  const lostAccess = useRef(onPermissionLost)
  const bridge = useRef({
    handoff: (_info: Handoff) => {},
    ended: (_position: number, _duration: number) => {},
    next: () => {},
    previous: () => {},
    play: () => {},
  })

  const upcoming = useMemo(() => {
    const queued = !endless && queue[index + 1] ? queue[index + 1] : null
    if (queued) return { track: queued, reason: "" }
    if (!current) return { track: null as TrackRecord | null, reason: "" }
    const choice = pickNext(current, tracks, history, mode, Date.now())
    return { track: choice?.track ?? null, reason: choice?.reason ?? "" }
  }, [endless, queue, index, current, tracks, history, mode])

  useEffect(() => {
    directoryRef.current = directory
    tracksRef.current = tracks
    queueRef.current = queue
    indexRef.current = index
    currentRef.current = current
    nextRef.current = upcoming.track
    endlessRef.current = endless
    modeRef.current = mode
    historyRef.current = history
    lostAccess.current = onPermissionLost
    bridge.current.next = () => void skip(1)
    bridge.current.previous = () => void skip(-1)
    bridge.current.play = () => void toggle()
    bridge.current.handoff = onHandoff
    bridge.current.ended = (position, length) => {
      logLeave(position, length, "ended")
      void skip(1)
    }
  })

  useEffect(() => {
    if (tracks.length === 0 || booted.current) return
    let live = true
    Promise.all([loadLastTrackId(), loadMode(), loadPlays()])
      .then(([last, savedMode, plays]) => {
        if (!live) return
        const sorted = sortLibrary(tracks)
        const found = last ? sorted.findIndex((track) => track.id === last) : 0
        const start = found >= 0 ? found : 0
        if (isListeningMode(savedMode)) {
          modeRef.current = savedMode
          setMode(savedMode)
        }
        setHistory(plays)
        setQueue(sorted)
        setIndex(start)
        setCurrent(sorted[start] ?? null)
        booted.current = true
      })
      .catch(() => {
        if (!live) return
        const sorted = sortLibrary(tracks)
        setQueue(sorted)
        setCurrent(sorted[0] ?? null)
        booted.current = true
      })
    return () => {
      live = false
    }
  }, [tracks])

  useEffect(() => {
    if (!booted.current) return
    setQueue((existing) => {
      const nextQueue = existing
        .map((item) => tracks.find((track) => track.id === item.id) ?? null)
        .filter((item): item is TrackRecord => item !== null)
      return nextQueue.length > 0 ? nextQueue : sortLibrary(tracks)
    })
  }, [tracks])

  useEffect(() => {
    setUpcomingProvider(async () => {
      const upcoming = nextRef.current
      if (!upcoming) return null
      armedRef.current = upcoming
      const file = await resolveTrack(upcoming)
      if (file) void warmCover(upcoming, file)
      return file
    })
    return subscribePlayback({
      time: (currentTime, nextDuration) => {
        setElapsed(currentTime)
        if (Number.isFinite(nextDuration) && nextDuration > 0) setDuration(nextDuration)
      },
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      ended: (info) => bridge.current.ended(info.position, info.duration),
      handoff: (info) => bridge.current.handoff(info),
    })
  }, [])

  useEffect(() => {
    if (!current) return
    publishSession(current)
    setPlaybackState(playing)
  }, [current, coverUrl, playing, mode])

  function publishSession(track: TrackRecord) {
    const art = sessionArt(track)
    setMediaSession(
      { title: track.title, artist: track.artist, album: track.album, artwork: art.url, artworkType: art.type },
      {
        play: () => bridge.current.play(),
        pause: () => pausePlayback(),
        next: () => bridge.current.next(),
        previous: () => bridge.current.previous(),
      },
    )
  }

  function sessionArt(track: TrackRecord) {
    return coversRef.current.get(track.id) ?? { url: genreSquareUrl(genreCover(track.genre)), type: "image/png" }
  }

  function showCover(track: TrackRecord) {
    const art = coversRef.current.get(track.id)
    setCoverUrl(art?.url ?? null)
  }

  async function warmCover(track: TrackRecord, file: File) {
    const blob = await artworkFor(track.id, file)
    if (!blob) return
    const previous = coversRef.current.get(track.id)
    if (previous?.url.startsWith("blob:")) URL.revokeObjectURL(previous.url)
    const art = { url: URL.createObjectURL(blob), type: blob.type || "image/jpeg" }
    coversRef.current.set(track.id, art)
    if (currentRef.current?.id === track.id) {
      setCoverUrl(art.url)
      publishSession(track)
    }
  }

  function startSession(track: TrackRecord) {
    const startedAt = Date.now()
    sessionRef.current = {
      trackId: track.id,
      startedAt,
      hour: new Date(startedAt).getHours(),
      mode: modeRef.current,
      logged: false,
    }
  }

  function logLeave(position: number, length: number, how: Handoff["how"] | "ended") {
    const session = sessionRef.current
    if (!session || session.logged) return
    session.logged = true
    const row: PlayRecord = {
      trackId: session.trackId,
      startedAt: session.startedAt,
      playedSeconds: Math.round(position * 10) / 10,
      completed: how !== "manual" || (length > 0 && length - position <= 10),
      skipped: how === "manual" && position < 30,
      hour: session.hour,
      mode: session.mode,
    }
    setHistory((existing) => [...existing, row])
    void recordPlay(row)
  }

  function onHandoff(info: Handoff) {
    if (!info.fresh) logLeave(info.position, info.duration, info.how)
    const armed = armedRef.current
    if (!armed) return
    if (info.how === "natural") {
      const list = queueRef.current
      const at = indexRef.current
      const queued = !endlessRef.current ? list[at + 1] : undefined
      if (queued && queued.id === armed.id) {
        indexRef.current = at + 1
        setIndex(at + 1)
      } else {
        endlessRef.current = true
        setEndless(true)
        queueRef.current = [armed]
        indexRef.current = 0
        setQueue([armed])
        setIndex(0)
      }
    }
    currentRef.current = armed
    setCurrent(armed)
    setElapsed(0)
    setDuration(armed.duration)
    showCover(armed)
    startSession(armed)
    publishSession(armed)
    void saveLastTrackId(armed.id)
  }

  async function resolveTrack(track: TrackRecord) {
    const folder = directoryRef.current
    if (!folder) return null
    try {
      return await resolveTrackFile(folder, track.path)
    } catch {
      const state = await readPermission(folder)
      pausePlayback()
      if (state !== "granted") lostAccess.current()
      else setNotice("That song couldn't be opened.")
      return null
    }
  }

  async function goTo(track: TrackRecord, list: TrackRecord[], at: number) {
    queueRef.current = list
    indexRef.current = at
    setQueue(list)
    setIndex(at)
    setNotice(null)
    const file = await resolveTrack(track)
    if (!file) return
    armedRef.current = track
    try {
      await playFile(file)
      void warmCover(track, file)
    } catch {
      setNotice("That song couldn't be opened.")
      setPlaying(false)
    }
  }

  async function skip(step: number) {
    if (step < 0 && playbackTime() > 5) {
      restartTrack()
      setElapsed(0)
      return
    }
    const list = queueRef.current
    const at = indexRef.current
    if (!endlessRef.current && step > 0 && at + 1 < list.length) {
      await goTo(list[at + 1], list, at + 1)
      return
    }
    if (step < 0 && at > 0) {
      await goTo(list[at - 1], list, at - 1)
      return
    }
    if (step < 0 && list.length > 1) {
      await goTo(list[list.length - 1], list, list.length - 1)
      return
    }
    const choice =
      nextRef.current && nextRef.current.id !== currentRef.current?.id
        ? { track: nextRef.current, reason: "" }
        : pickNext(currentRef.current, tracksRef.current, historyRef.current, modeRef.current, Date.now())
    if (!choice) return
    endlessRef.current = true
    setEndless(true)
    await goTo(choice.track, [choice.track], 0)
  }

  async function toggle() {
    const track = currentRef.current
    if (!track) return
    if (hasLoadedFile() && sessionRef.current?.trackId === track.id) {
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
    await goTo(track, queueRef.current.length > 0 ? queueRef.current : [track], indexRef.current)
  }

  function cycleMode() {
    const nextMode = listeningModes[(listeningModes.indexOf(modeRef.current) + 1) % listeningModes.length]
    modeRef.current = nextMode
    setMode(nextMode)
    void saveMode(nextMode)
  }

  function letUncleChoose() {
    endlessRef.current = true
    setEndless(true)
    const choice = pickNext(currentRef.current, tracksRef.current, historyRef.current, modeRef.current, Date.now())
    if (!choice) return
    void goTo(choice.track, [choice.track], 0)
  }

  function playList(list: TrackRecord[], at: number) {
    if (list.length === 0) return
    endlessRef.current = false
    setEndless(false)
    const safe = Math.min(Math.max(at, 0), list.length - 1)
    void goTo(list[safe], list, safe)
  }

  return {
    track: current,
    next: upcoming.track,
    nextReason: upcoming.reason,
    mode,
    playing,
    elapsed,
    duration: duration > 0 ? duration : (current?.duration ?? 0),
    coverUrl,
    notice,
    toggle: () => void toggle(),
    previous: () => void skip(-1),
    nextTrack: () => void skip(1),
    playList,
    cycleMode,
    letUncleChoose,
  }
}
