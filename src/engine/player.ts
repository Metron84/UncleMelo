import { isIosPlayback } from "./device.ts"
import { createSimplePlayer } from "./simple-player.ts"
import type { Engine, EngineHooks, Listener } from "./types.ts"
import { createWebPlayer } from "./web-player.ts"

export type { Handoff, PlaybackEnd } from "./types.ts"
export { CROSSFADE_SECONDS } from "./web-player.ts"
export { isIosPlayback } from "./device.ts"

type SessionActions = {
  play: () => void
  pause: () => void
  next: () => void
  previous: () => void
}

const listeners = new Set<Listener>()
const transport: SessionActions = {
  play: () => void engine.resumePlayback(),
  pause: () => engine.pausePlayback(),
  next: () => {},
  previous: () => {},
}

let upcoming: (() => Promise<File | null>) | null = null
let lastPositionAt = 0
let handlersInstalled = false

const hooks: EngineHooks = {
  emitHandoff: (info) => {
    for (const listener of listeners) listener.handoff(info)
  },
  emitTime: (current, duration) => {
    for (const listener of listeners) listener.time(current, duration)
  },
  emitPlay: () => {
    for (const listener of listeners) listener.play()
  },
  emitPause: () => {
    for (const listener of listeners) listener.pause()
  },
  emitEnded: (info) => {
    for (const listener of listeners) listener.ended(info)
  },
  setPlaybackState: (playing) => setPlaybackState(playing),
  publishPosition: (audio, force) => publishPosition(audio, force),
  nextFile: () => (upcoming ? upcoming() : Promise.resolve(null)),
}

const engine: Engine = isIosPlayback() ? createSimplePlayer(hooks) : createWebPlayer(hooks)

installMediaSession()

export function audioElement() {
  return engine.audioElement()
}

export function hasLoadedFile() {
  return engine.hasLoadedFile()
}

export function playbackTime() {
  return engine.playbackTime()
}

export function playFile(file: File) {
  return engine.playFile(file)
}

export function pausePlayback() {
  engine.pausePlayback()
}

export async function resumePlayback() {
  await engine.resumePlayback()
}

export function restartTrack() {
  engine.restartTrack()
}

export function seekTo(seconds: number) {
  engine.seekTo(seconds)
}

export function seekBy(seconds: number) {
  engine.seekBy(seconds)
}

export function setCrossfadeSeconds(seconds: number) {
  engine.setCrossfadeSeconds(seconds)
}

export function setNaturalHandoff(enabled: boolean) {
  engine.setNaturalHandoff(enabled)
}

export function setOutputMuted(muted: boolean) {
  return engine.setOutputMuted(muted)
}

export function fadeOutForSleep(seconds: number, done: () => void) {
  engine.fadeOutForSleep(seconds, done)
}

export function cancelSleepFade() {
  engine.cancelSleepFade()
}

export function holdAutoAdvance() {
  engine.holdAutoAdvance()
}

export function releaseAutoAdvance() {
  engine.releaseAutoAdvance()
}

export function setUpcomingProvider(provider: () => Promise<File | null>) {
  upcoming = provider
}

export function subscribePlayback(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setMediaSession(
  track: { title: string; artist: string; album: string; artwork: string | null; artworkType?: string },
  actions: SessionActions,
) {
  transport.play = actions.play
  transport.pause = actions.pause
  transport.next = actions.next
  transport.previous = actions.previous
  if (!("mediaSession" in navigator)) return
  const artwork = track.artwork
    ? [{ src: track.artwork, sizes: "512x512", type: track.artworkType || "image/jpeg" }]
    : []
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork,
  })
  installMediaSession()
  publishPosition(engine.audioElement(), true)
}

export function setPlaybackState(playing: boolean) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return
  navigator.mediaSession.playbackState = playing ? "playing" : "paused"
}

function installMediaSession() {
  if (handlersInstalled || typeof navigator === "undefined" || !("mediaSession" in navigator)) return
  handlersInstalled = true
  const session = navigator.mediaSession
  const phone = isIosPlayback()
  listen(session, "play", () => transport.play())
  listen(session, "pause", () => transport.pause())
  listen(session, "previoustrack", () => transport.previous())
  listen(session, "nexttrack", () => transport.next())
  listen(session, "seekto", (details) => {
    if (typeof details.seekTime === "number") engine.seekTo(details.seekTime)
  })
  if (phone) {
    listen(session, "seekforward", null)
    listen(session, "seekbackward", null)
  } else {
    listen(session, "seekforward", (details) => engine.seekBy(details.seekOffset ?? 10))
    listen(session, "seekbackward", (details) => engine.seekBy(-(details.seekOffset ?? 10)))
  }
}

function listen(
  session: MediaSession,
  action: MediaSessionAction,
  handler: ((details: MediaSessionActionDetails) => void) | null,
) {
  try {
    session.setActionHandler(action, handler)
  } catch {
    // This browser does not support the action.
  }
}

function publishPosition(audio: HTMLAudioElement, force: boolean) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return
  const now = performance.now()
  if (!force && now - lastPositionAt < 1000) return
  const duration = audio.duration
  if (!Number.isFinite(duration) || duration <= 0) return
  lastPositionAt = now
  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: audio.playbackRate || 1,
      position: Math.min(Math.max(0, audio.currentTime || 0), duration),
    })
  } catch {
    // Ignore a position the browser will not accept.
  }
}
