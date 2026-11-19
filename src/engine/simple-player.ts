import type { Engine, EngineHooks } from "./types.ts"

const PRELOAD_LEAD_SECONDS = 15

function sameFile(file: File | null, next: File) {
  return (
    file === next ||
    (file !== null && file.name === next.name && file.size === next.size && file.lastModified === next.lastModified)
  )
}

export function createSimplePlayer(hooks: EngineHooks): Engine {
  const audio = new Audio()
  audio.preload = "auto"
  audio.setAttribute("playsinline", "true")

  let currentUrl: string | null = null
  let currentFile: File | null = null
  let nextUrl: string | null = null
  let nextFile: File | null = null
  let outputMuted = false
  let naturalEnabled = true
  let preloadToken = 0
  let preloading = false
  let sleepToken = 0
  let held = 0
  let chaining = false

  audio.addEventListener("timeupdate", () => {
    const duration = audio.duration
    if (!Number.isFinite(duration) || duration <= 0) return
    hooks.emitTime(audio.currentTime, duration)
    hooks.publishPosition(audio, false)
    if (held > 0 || !naturalEnabled || nextUrl || preloading) return
    if (duration - audio.currentTime <= PRELOAD_LEAD_SECONDS) {
      preloading = true
      const token = preloadToken
      void loadNext(token)
    }
  })
  audio.addEventListener("loadedmetadata", () => hooks.publishPosition(audio, true))
  audio.addEventListener("play", () => {
    chaining = false
    hooks.emitPlay()
    hooks.setPlaybackState(true)
  })
  audio.addEventListener("pause", () => {
    if (chaining) return
    if (naturalEnabled && nextUrl && reachedEnd()) return
    hooks.emitPause()
    hooks.setPlaybackState(false)
  })
  audio.addEventListener("ended", onEnded)

  return {
    audioElement: () => audio,
    hasLoadedFile: () => currentUrl !== null,
    playbackTime: () => audio.currentTime || 0,
    playFile,
    pausePlayback,
    resumePlayback,
    restartTrack,
    seekTo,
    seekBy,
    setCrossfadeSeconds: () => {},
    setNaturalHandoff,
    setOutputMuted,
    fadeOutForSleep,
    cancelSleepFade,
    holdAutoAdvance,
    releaseAutoAdvance,
  }

  function reachedEnd() {
    const duration = audio.duration
    return Number.isFinite(duration) && duration > 0 && audio.currentTime >= duration - 0.5
  }

  function onEnded() {
    if (held > 0) return
    if (naturalEnabled && nextUrl) {
      const url = nextUrl
      const file = nextFile
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0
      const position = audio.currentTime > 0 ? audio.currentTime : duration
      const previousUrl = currentUrl
      chaining = true
      nextUrl = null
      nextFile = null
      preloading = false
      preloadToken += 1
      currentUrl = url
      currentFile = file
      audio.src = url
      void audio.play().catch(() => {
        chaining = false
        hooks.emitPause()
        hooks.setPlaybackState(false)
      })
      hooks.setPlaybackState(true)
      revokeIfIdle(previousUrl)
      hooks.emitHandoff({ how: "natural", position, duration, fresh: false })
      hooks.publishPosition(audio, true)
      return
    }
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0
    const position = audio.currentTime > 0 ? audio.currentTime : duration
    hooks.emitEnded({ position, duration })
  }

  async function loadNext(token: number) {
    try {
      const file = await hooks.nextFile()
      if (token !== preloadToken || nextUrl || !file) return
      nextFile = file
      nextUrl = URL.createObjectURL(file)
    } catch {
      if (token === preloadToken) preloading = false
    }
  }

  async function playFile(file: File) {
    const outgoingPosition = audio.currentTime || 0
    const outgoingDuration = Number.isFinite(audio.duration) ? audio.duration : 0
    const fresh = currentUrl === null
    preloadToken += 1
    preloading = false
    const url = adoptUrl(file)
    const previousUrl = currentUrl
    if (previousUrl !== url) audio.src = url
    else audio.currentTime = 0
    currentUrl = url
    currentFile = file
    discardNext(url)
    revokeIfIdle(previousUrl)
    audio.muted = outputMuted
    await audio.play()
    hooks.emitHandoff({
      how: "manual",
      position: fresh ? 0 : outgoingPosition,
      duration: fresh ? 0 : outgoingDuration,
      fresh,
    })
    hooks.publishPosition(audio, true)
    hooks.setPlaybackState(true)
  }

  function adoptUrl(file: File) {
    if (currentUrl && sameFile(currentFile, file)) return currentUrl
    if (nextUrl && sameFile(nextFile, file)) {
      const url = nextUrl
      nextUrl = null
      nextFile = null
      return url
    }
    return URL.createObjectURL(file)
  }

  function discardNext(keep: string | null) {
    if (!nextUrl || nextUrl === keep) return
    const stale = nextUrl
    nextUrl = null
    nextFile = null
    revokeIfIdle(stale)
  }

  function revokeIfIdle(url: string | null) {
    if (!url || url === currentUrl || url === nextUrl) return
    URL.revokeObjectURL(url)
  }

  function pausePlayback() {
    audio.pause()
    hooks.setPlaybackState(false)
  }

  async function resumePlayback() {
    audio.muted = outputMuted
    await audio.play()
    hooks.setPlaybackState(true)
  }

  function restartTrack() {
    audio.currentTime = 0
    hooks.publishPosition(audio, true)
  }

  function seekTo(seconds: number) {
    const duration = Number.isFinite(audio.duration) ? audio.duration : seconds
    audio.currentTime = Math.min(Math.max(0, seconds), duration)
    hooks.publishPosition(audio, true)
  }

  function seekBy(seconds: number) {
    seekTo((audio.currentTime || 0) + seconds)
  }

  function setNaturalHandoff(enabled: boolean) {
    naturalEnabled = enabled
    if (!enabled) {
      preloadToken += 1
      preloading = false
      discardNext(null)
    }
  }

  async function setOutputMuted(muted: boolean) {
    outputMuted = muted
    audio.muted = muted
  }

  function fadeOutForSleep(seconds: number, done: () => void) {
    const token = ++sleepToken
    naturalEnabled = false
    preloadToken += 1
    preloading = false
    discardNext(null)
    window.setTimeout(() => {
      if (token !== sleepToken) return
      pausePlayback()
      done()
    }, Math.max(0, seconds) * 1000)
  }

  function cancelSleepFade() {
    sleepToken += 1
  }

  function holdAutoAdvance() {
    held += 1
    preloadToken += 1
    preloading = false
    discardNext(null)
  }

  function releaseAutoAdvance() {
    held = Math.max(0, held - 1)
  }
}
