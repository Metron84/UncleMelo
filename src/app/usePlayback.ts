import { useEffect, useMemo, useRef, useState } from "react"
import { isListeningMode, listeningModes, pickNext, type ListeningMode, type PlayHistory } from "../brain/pick.ts"
import {
  advanceIndex,
  comingTracks,
  nextRepeat,
  restoredPlayback,
  shuffleRemaining,
  type RepeatMode,
  type SleepChoice,
} from "./playback-order.ts"
import {
  audioElement,
  cancelSleepFade,
  fadeOutForSleep,
  hasLoadedFile,
  pausePlayback,
  playFile,
  playbackTime,
  restartTrack,
  resumePlayback,
  seekTo,
  setCrossfadeSeconds,
  setMediaSession,
  setNaturalHandoff,
  setOutputMuted,
  setPlaybackState,
  setUpcomingProvider,
  subscribePlayback,
  type Handoff,
} from "../engine/player.ts"
import { artworkFor, genreSquareUrl } from "../library/artwork.ts"
import { genreCover, sortLibrary } from "../library/browse.ts"
import {
  deleteHidden,
  loadAllCovers,
  loadCrossfade,
  loadHiddenIds,
  loadLastTrackId,
  loadLoveIds,
  loadMode,
  loadPlays,
  loadRepeat,
  loadShuffle,
  recordPlay,
  saveCrossfade,
  saveHidden,
  saveLastTrackId,
  saveLove,
  saveMode,
  saveRepeat,
  saveShuffle,
  type PlayRecord,
} from "../library/db.ts"
import { readPermission, resolveTrackFile } from "../library/folder.ts"
import { phoneFile, phoneStorageAvailable } from "../library/phone.ts"
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
  sessionFile?: (path: string) => File | null,
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
  const [ahead, setAhead] = useState<TrackRecord[]>([])
  const [scope, setScope] = useState<TrackRecord[] | null>(null)
  const [scopePlayed, setScopePlayed] = useState<string[]>([])
  const [art, setArt] = useState<Record<string, string>>({})
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState<RepeatMode>("off")
  const [muted, setMuted] = useState(false)
  const [loved, setLoved] = useState<Set<string>>(() => new Set())
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [crossfade, setCrossfade] = useState(6)
  const [sleepEnds, setSleepEnds] = useState<number | null>(null)
  const [sleepSong, setSleepSong] = useState(false)
  const [sleeping, setSleeping] = useState(false)
  const [sleepNow, setSleepNow] = useState(() => Date.now())

  const directoryRef = useRef(directory)
  const tracksRef = useRef(tracks)
  const queueRef = useRef(queue)
  const indexRef = useRef(index)
  const currentRef = useRef(current)
  const nextRef = useRef<TrackRecord | null>(null)
  const endlessRef = useRef(endless)
  const modeRef = useRef(mode)
  const historyRef = useRef(history)
  const aheadRef = useRef(ahead)
  const scopeRef = useRef(scope)
  const sessionRef = useRef<Session | null>(null)
  const armedRef = useRef<TrackRecord | null>(null)
  const coversRef = useRef(new Map<string, CoverArt>())
  const booted = useRef(false)
  const lostAccess = useRef(onPermissionLost)
  const sessionFileRef = useRef(sessionFile)
  const shuffleRef = useRef(false)
  const repeatRef = useRef<RepeatMode>("off")
  const originalRef = useRef<TrackRecord[]>([])
  const lovedRef = useRef<Set<string>>(new Set())
  const hiddenRef = useRef<Set<string>>(new Set())
  const sleepSongRef = useRef(false)
  const sleepEndsRef = useRef<number | null>(null)
  const sleepingRef = useRef(false)
  const runSleepRef = useRef(() => {})
  const mutedRef = useRef(false)
  const bridge = useRef({
    handoff: (_info: Handoff) => {},
    ended: (_position: number, _duration: number) => {},
    next: () => {},
    previous: () => {},
    play: () => {},
  })

  const upcoming = useMemo(() => {
    if (ahead[0]) return { track: ahead[0], reason: "" }
    const queued = !endless && queue[index + 1] ? queue[index + 1] : null
    if (queued) return { track: queued, reason: "" }
    if (repeat === "all" && queue.length > 0) {
      const wrapped = queue[(index + 1) % queue.length]
      if (wrapped) return { track: wrapped, reason: "" }
    }
    if (!current) return { track: null as TrackRecord | null, reason: "" }
    const played = new Set(scopePlayed)
    const remaining = scope?.filter((track) => track.id !== current.id && !played.has(track.id)) ?? null
    const pool = remaining && remaining.length > 0 ? remaining : tracks
    const choice = pickNext(current, pool, history, mode, Date.now(), Math.random, { loved, hidden })
    return { track: choice?.track ?? null, reason: choice?.reason ?? "" }
  }, [ahead, endless, queue, index, current, tracks, history, mode, scope, scopePlayed, repeat, loved, hidden])

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
    aheadRef.current = ahead
    scopeRef.current = scope
    lostAccess.current = onPermissionLost
    sessionFileRef.current = sessionFile
    shuffleRef.current = shuffle
    repeatRef.current = repeat
    lovedRef.current = loved
    hiddenRef.current = hidden
    sleepSongRef.current = sleepSong
    sleepEndsRef.current = sleepEnds
    mutedRef.current = muted
    bridge.current.next = () => void skip(1)
    bridge.current.previous = () => void skip(-1)
    bridge.current.play = () => void toggle()
    bridge.current.handoff = onHandoff
    bridge.current.ended = (position, length) => {
      logLeave(position, length, "ended")
      if (sleepingRef.current || sleepSongRef.current) {
        if (sleepSongRef.current) runSleepRef.current()
        return
      }
      void skip(1, "ended")
    }
  })

  useEffect(() => {
    if (tracks.length === 0 || booted.current) return
    let live = true
    Promise.all([loadLastTrackId(), loadMode(), loadPlays(), loadShuffle(), loadRepeat(), loadCrossfade(), loadLoveIds(), loadHiddenIds()])
      .then(async ([last, savedMode, plays, shuffleOn, savedRepeat, fade, loveIds, hiddenIds]) => {
        if (!live) return
        const sorted = sortLibrary(tracks)
        const found = last ? sorted.findIndex((track) => track.id === last) : 0
        const start = found >= 0 ? found : 0
        if (isListeningMode(savedMode)) {
          modeRef.current = savedMode
          setMode(savedMode)
        }
        setHistory(plays)
        setCrossfadeSeconds(fade)
        setCrossfade(fade)
        repeatRef.current = savedRepeat
        setRepeat(savedRepeat)
        if (savedRepeat === "one") setNaturalHandoff(false)
        shuffleRef.current = shuffleOn
        setShuffle(shuffleOn)
        lovedRef.current = new Set(loveIds)
        setLoved(lovedRef.current)
        hiddenRef.current = new Set(hiddenIds)
        setHidden(hiddenRef.current)
        const covers = await loadAllCovers()
        if (!live) return
        const urls: Record<string, string> = {}
        for (const cover of covers) {
          const url = URL.createObjectURL(cover.blob)
          urls[cover.id] = url
          coversRef.current.set(cover.id, { url, type: cover.blob.type || "image/jpeg" })
        }
        setArt(urls)
        originalRef.current = sorted
        const ordered = shuffleOn ? shuffleRemaining(sorted, start, Math.random) : sorted
        setQueue(ordered)
        setIndex(start)
        setCurrent(ordered[start] ?? null)
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
        if (repeatRef.current === "one") setNaturalHandoff(false)
        if (sleepSongRef.current && Number.isFinite(nextDuration) && nextDuration - currentTime <= 10) {
          setNaturalHandoff(false)
          runSleepRef.current()
        }
      },
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      ended: (info) => bridge.current.ended(info.position, info.duration),
      handoff: (info) => bridge.current.handoff(info),
    })
  }, [])

  useEffect(() => {
    if (sleepEnds === null) return
    const id = window.setInterval(() => {
      const now = Date.now()
      setSleepNow(now)
      if (sleepEndsRef.current !== null && now >= sleepEndsRef.current) runSleepRef.current()
    }, 1000)
    return () => window.clearInterval(id)
  }, [sleepEnds])

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
    setArt((existing) => ({ ...existing, [track.id]: art.url }))
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
    if (scopeRef.current?.some((track) => track.id === armed.id)) {
      setScopePlayed((ids) => (ids.includes(armed.id) ? ids : [...ids, armed.id]))
    }
    const consumedAhead = aheadRef.current[0]?.id === armed.id
    if (consumedAhead) {
      const rest = aheadRef.current.slice(1)
      aheadRef.current = rest
      setAhead(rest)
    } else if (info.how === "natural") {
      const list = queueRef.current
      const at = indexRef.current
      const queued = !endlessRef.current ? list[at + 1] : undefined
      const wrapped = repeatRef.current === "all" && list.length > 0 ? list[(at + 1) % list.length] : undefined
      if (queued && queued.id === armed.id) {
        indexRef.current = at + 1
        setIndex(at + 1)
      } else if (wrapped && wrapped.id === armed.id) {
        const nextAt = (at + 1) % list.length
        indexRef.current = nextAt
        setIndex(nextAt)
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
    const local = sessionFileRef.current?.(track.path)
    if (local) return local
    if (phoneStorageAvailable()) {
      const stored = await phoneFile(track.path)
      if (stored) return stored
    }
    const folder = directoryRef.current
    if (!folder) {
      setNotice("That song couldn't be opened.")
      return null
    }
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

  function clearPlans() {
  aheadRef.current = []
  setAhead([])
  scopeRef.current = null
  setScope(null)
  setScopePlayed([])
}

  async function playInserted(track: TrackRecord) {
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

  async function replayCurrent() {
    const track = currentRef.current
    if (!track) return
    restartTrack()
    setElapsed(0)
    try {
      await resumePlayback()
    } catch {
      setNotice("That song couldn't be opened.")
      return
    }
    startSession(track)
  }

  async function skip(step: number, how: "manual" | "ended" = "manual") {
    if (sleepingRef.current && how === "ended") return
    if (step < 0 && playbackTime() > 5) {
      restartTrack()
      setElapsed(0)
      return
    }
    if (how === "ended" && repeatRef.current === "one") {
      await replayCurrent()
      return
    }
    if (step > 0 && aheadRef.current[0]) {
      await playInserted(aheadRef.current[0])
      return
    }
    const list = queueRef.current
    const at = indexRef.current
    if (step < 0 && at > 0) {
      await goTo(list[at - 1], list, at - 1)
      return
    }
    if (step < 0 && list.length > 1) {
      await goTo(list[list.length - 1], list, list.length - 1)
      return
    }
    if (step > 0) {
      const nextAt = advanceIndex(at, list.length, repeatRef.current, how === "manual")
      const stayInList = !endlessRef.current || repeatRef.current === "all"
      if (stayInList && nextAt !== null) {
        await goTo(list[nextAt], list, nextAt)
        return
      }
    }
    const bias = { loved: lovedRef.current, hidden: hiddenRef.current }
    const choice =
      nextRef.current && nextRef.current.id !== currentRef.current?.id
        ? { track: nextRef.current, reason: "" }
        : pickNext(currentRef.current, tracksRef.current, historyRef.current, modeRef.current, Date.now(), Math.random, bias)
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
    clearPlans()
    endlessRef.current = true
    setEndless(true)
    const choice = pickNext(currentRef.current, tracksRef.current, historyRef.current, modeRef.current, Date.now(), Math.random, {
      loved: lovedRef.current,
      hidden: hiddenRef.current,
    })
    if (!choice) return
    void goTo(choice.track, [choice.track], 0)
  }

  function playList(list: TrackRecord[], at: number) {
    if (list.length === 0) return
    clearPlans()
    endlessRef.current = false
    setEndless(false)
    const safe = Math.min(Math.max(at, 0), list.length - 1)
    originalRef.current = list
    const ordered = shuffleRef.current ? shuffleRemaining(list, safe, Math.random) : list
    void goTo(ordered[safe], ordered, safe)
  }

  function rememberQueue(track: TrackRecord, where: "next" | "end") {
    const without = aheadRef.current.filter((item) => item.id !== track.id)
    const next = where === "next" ? [track, ...without] : [...without, track]
    aheadRef.current = next
    setAhead(next)
  }

  function shuffleGroup(list: TrackRecord[]) {
    if (list.length === 0) return
    aheadRef.current = []
    setAhead([])
    scopeRef.current = list
    setScope(list)
    setScopePlayed([])
    endlessRef.current = true
    setEndless(true)
    const choice = pickNext(currentRef.current, list, historyRef.current, modeRef.current, Date.now(), Math.random, {
      loved: lovedRef.current,
      hidden: hiddenRef.current,
    })
    if (!choice) return
    void goTo(choice.track, [choice.track], 0)
  }

  function toggleShuffle() {
    if (endlessRef.current) return
    const next = !shuffleRef.current
    shuffleRef.current = next
    setShuffle(next)
    void saveShuffle(next)
    const list = queueRef.current
    const at = indexRef.current
    if (next) {
      originalRef.current = list
      const ordered = shuffleRemaining(list, at, Math.random)
      queueRef.current = ordered
      setQueue(ordered)
      return
    }
    const playing = list[at]
    const original = originalRef.current.length > 0 ? originalRef.current : list
    if (!playing) return
    const restored = restoredPlayback(original, playing, (item, currentTrack) => item.id === currentTrack.id)
    queueRef.current = restored.list
    indexRef.current = restored.index
    setQueue(restored.list)
    setIndex(restored.index)
  }

  function cycleRepeat() {
    const next = nextRepeat(repeatRef.current)
    repeatRef.current = next
    setRepeat(next)
    setNaturalHandoff(next !== "one")
    void saveRepeat(next)
  }

  async function toggleMute() {
    const next = !mutedRef.current
    mutedRef.current = next
    setMuted(next)
    await setOutputMuted(next)
  }

  function toggleLove() {
    const trackId = currentRef.current?.id
    if (!trackId) return
    const next = new Set(lovedRef.current)
    const on = !next.has(trackId)
    if (on) next.add(trackId)
    else next.delete(trackId)
    lovedRef.current = next
    setLoved(next)
    void saveLove(trackId, on)
  }

  function hideFromUncle(track: TrackRecord) {
    const next = new Set(hiddenRef.current)
    next.add(track.id)
    hiddenRef.current = next
    setHidden(next)
    void saveHidden(track.id)
  }

  function restoreHidden(id: string) {
    const next = new Set(hiddenRef.current)
    next.delete(id)
    hiddenRef.current = next
    setHidden(next)
    void deleteHidden(id)
  }

  function chooseCrossfade(seconds: number) {
    const safe = seconds === 0 || seconds === 3 || seconds === 6 || seconds === 10 ? seconds : 6
    setCrossfade(safe)
    setCrossfadeSeconds(safe)
    void saveCrossfade(safe)
  }

  function runSleep() {
    if (sleepingRef.current) return
    sleepingRef.current = true
    setSleeping(true)
    sleepSongRef.current = false
    setSleepSong(false)
    setSleepEnds(null)
    fadeOutForSleep(10, () => {
      sleepingRef.current = false
      setSleeping(false)
      setNaturalHandoff(repeatRef.current !== "one")
    })
  }

  useEffect(() => {
    runSleepRef.current = runSleep
  })

  function chooseSleep(choice: SleepChoice) {
    if (choice === "off") {
      cancelSleepFade()
      sleepingRef.current = false
      setSleeping(false)
      sleepSongRef.current = false
      setSleepSong(false)
      setSleepEnds(null)
      setNaturalHandoff(repeatRef.current !== "one")
      return
    }
    if (sleepingRef.current) {
      cancelSleepFade()
      sleepingRef.current = false
      setSleeping(false)
    }
    if (choice === "song") {
      sleepSongRef.current = true
      setSleepSong(true)
      setSleepEnds(null)
      return
    }
    sleepSongRef.current = false
    setSleepSong(false)
    setSleepEnds(Date.now() + Number(choice) * 60 * 1000)
    setSleepNow(Date.now())
  }

  function writeQueue(list: TrackRecord[], at = indexRef.current) {
    queueRef.current = list
    indexRef.current = at
    setQueue(list)
    setIndex(at)
  }

  function commitComing(next: TrackRecord[]) {
    if (endlessRef.current) {
      aheadRef.current = next
      setAhead(next)
      return
    }
    const at = indexRef.current
    const head = queueRef.current.slice(0, at + 1)
    aheadRef.current = []
    setAhead([])
    writeQueue([...head, ...next], at)
    if (!shuffleRef.current) originalRef.current = queueRef.current
  }

  function clearComing() {
    commitComing([])
    const currentId = currentRef.current?.id
    const at = originalRef.current.findIndex((track) => track.id === currentId)
    if (at >= 0) originalRef.current = originalRef.current.slice(0, at + 1)
  }

  function reorderComing(next: TrackRecord[]) {
    const before = comingTracks(aheadRef.current, queueRef.current, indexRef.current, endlessRef.current)
    commitComing(next)
    if (endlessRef.current) return
    if (!shuffleRef.current) {
      originalRef.current = queueRef.current
      return
    }
    const keep = new Set(next.map((track) => track.id))
    const removed = new Set(before.filter((track) => !keep.has(track.id)).map((track) => track.id))
    const currentId = currentRef.current?.id
    originalRef.current = originalRef.current.filter((track) => track.id === currentId || !removed.has(track.id))
  }

  function seek(seconds: number) {
    seekTo(seconds)
    setElapsed(Math.max(0, seconds))
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
    playNext: (track: TrackRecord) => rememberQueue(track, "next"),
    addToQueue: (track: TrackRecord) => rememberQueue(track, "end"),
    shuffleGroup,
    art,
    history,
    cycleMode,
    letUncleChoose,
    endless,
    scope,
    shuffle,
    repeat,
    muted,
    loved: current ? loved.has(current.id) : false,
    lovedIds: loved,
    toggleShuffle,
    cycleRepeat,
    toggleMute: () => void toggleMute(),
    toggleLove,
    hideFromUncle,
    restoreHidden,
    hiddenTracks: tracks.filter((track) => hidden.has(track.id)).map((track) => ({ id: track.id, title: track.title, artist: track.artist })),
    crossfade,
    chooseCrossfade,
    sleepOn: sleepSong || sleepEnds !== null || sleeping,
    sleepMark: sleepSong ? "End" : sleepEnds !== null ? `${Math.max(1, Math.ceil((sleepEnds - sleepNow) / 60000))}m` : null,
    chooseSleep,
    coming: comingTracks(ahead, queue, index, endless),
    reorderComing,
    clearComing,
    handsToUncle: repeat === "off",
    seek,
  }
}
