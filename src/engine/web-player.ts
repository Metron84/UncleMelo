import type { Engine, EngineHooks, Handoff } from "./types.ts"

export const CROSSFADE_SECONDS = 6

const MANUAL_FADE_SECONDS = 1.2
const SHORT_FADE_SECONDS = 2
const PRELOAD_LEAD_SECONDS = 20

type Deck = {
  audio: HTMLAudioElement
  gain: GainNode | null
  url: string | null
  file: File | null
}

function sameFile(deck: Deck, file: File) {
  return (
    deck.file === file ||
    (deck.file !== null &&
      deck.file.name === file.name &&
      deck.file.size === file.size &&
      deck.file.lastModified === file.lastModified)
  )
}

export function createWebPlayer(hooks: EngineHooks): Engine {
  const decks: Deck[] = [makeDeck(), makeDeck()]
  let context: AudioContext | null = null
  let master: GainNode | null = null
  let masterLevel = 1
  let outputMuted = false
  let silenceToken = 0
  let crossfadeSeconds = CROSSFADE_SECONDS
  let naturalEnabled = true
  let live = 0
  let fading = false
  let fadeToken = 0
  let prepToken = 0
  let preloadTask: Promise<File | null> | null = null
  let held = 0
  let naturalArmed = false

  for (const [index, deck] of decks.entries()) watchDeck(index, deck)

  return {
    audioElement: () => decks[live].audio,
    hasLoadedFile: () => decks[live].url !== null,
    playbackTime: () => decks[live].audio.currentTime || 0,
    playFile,
    pausePlayback,
    resumePlayback,
    restartTrack,
    seekTo,
    seekBy,
    setCrossfadeSeconds: (seconds) => {
      crossfadeSeconds = seconds
    },
    setNaturalHandoff: (enabled) => {
      naturalEnabled = enabled
      if (!enabled) naturalArmed = false
    },
    setOutputMuted,
    fadeOutForSleep,
    cancelSleepFade,
    holdAutoAdvance: () => {
      held += 1
      prepToken += 1
      preloadTask = null
    },
    releaseAutoAdvance: () => {
      held = Math.max(0, held - 1)
    },
  }

  function makeDeck(): Deck {
    const audio = new Audio()
    audio.preload = "auto"
    return { audio, gain: null, url: null, file: null }
  }

  async function playFile(file: File) {
    await ensureAudio()
    const current = decks[live]
    if (!current.url) {
      assign(current, file)
      setGain(current, 1)
      setGain(decks[1 - live], 0)
      resetPrepare()
      await current.audio.play()
      hooks.emitHandoff({ how: "manual", position: 0, duration: 0, fresh: true })
      hooks.publishPosition(decks[live].audio, true)
      hooks.setPlaybackState(true)
      return
    }
    if (current.audio.paused) await current.audio.play()
    fadeToken += 1
    prepToken += 1
    preloadTask = null
    naturalArmed = true
    if (crossfadeSeconds <= 0) {
      await cutTo(live, file)
      return
    }
    const remaining = current.audio.duration - current.audio.currentTime
    const seconds = Math.min(MANUAL_FADE_SECONDS, Number.isFinite(remaining) && remaining > 0 ? remaining : MANUAL_FADE_SECONDS)
    await fadeFrom(live, file, Math.max(0.05, seconds), "manual")
  }

  function pausePlayback() {
    fadeToken += 1
    const now = context?.currentTime ?? 0
    for (const deck of decks) deck.gain?.gain.cancelScheduledValues(now)
    if (fading) {
      const outgoing = 1 - live
      setGain(decks[live], 1)
      setGain(decks[outgoing], 0)
      release(decks[outgoing])
      fading = false
    }
    for (const deck of decks) deck.audio.pause()
    hooks.setPlaybackState(false)
  }

  async function resumePlayback() {
    await ensureAudio()
    await decks[live].audio.play()
    hooks.setPlaybackState(true)
  }

  function restartTrack() {
    const element = decks[live].audio
    element.currentTime = 0
    hooks.publishPosition(element, true)
  }

  function seekTo(seconds: number) {
    if (fading) cancelCrossfade()
    const element = decks[live].audio
    const duration = Number.isFinite(element.duration) ? element.duration : seconds
    element.currentTime = Math.min(Math.max(0, seconds), duration)
    hooks.publishPosition(element, true)
  }

  function seekBy(seconds: number) {
    seekTo((decks[live].audio.currentTime || 0) + seconds)
  }

  async function setOutputMuted(muted: boolean) {
    await ensureAudio()
    outputMuted = muted
    rampMaster(muted ? 0 : masterLevel, 0.15)
  }

  function fadeOutForSleep(seconds: number, done: () => void) {
    void ensureAudio().then(() => {
      const token = ++silenceToken
      rampMaster(0, seconds)
      window.setTimeout(() => {
        if (token !== silenceToken) return
        pausePlayback()
        rampMaster(outputMuted ? 0 : masterLevel, 0)
        done()
      }, seconds * 1000)
    })
  }

  function cancelSleepFade() {
    silenceToken += 1
    if (context && master) rampMaster(outputMuted ? 0 : masterLevel, 0.15)
  }

  async function ensureAudio() {
    if (!context) {
      context = new AudioContext()
      master = context.createGain()
      master.connect(context.destination)
      for (const deck of decks) {
        const source = context.createMediaElementSource(deck.audio)
        deck.gain = context.createGain()
        deck.gain.gain.value = 0
        source.connect(deck.gain)
        deck.gain.connect(master)
      }
      setGain(decks[live], 1)
    }
    if (context.state === "suspended") await context.resume()
    return context
  }

  function watchDeck(index: number, deck: Deck) {
    deck.audio.addEventListener("timeupdate", () => {
      if (index !== live) return
      const element = deck.audio
      const duration = element.duration
      if (!Number.isFinite(duration) || duration <= 0) return
      hooks.emitTime(element.currentTime, duration)
      hooks.publishPosition(element, false)
      if (held > 0 || fading || naturalArmed || !naturalEnabled || crossfadeSeconds <= 0) return
      const remaining = duration - element.currentTime
      if (!preloadTask && remaining <= PRELOAD_LEAD_SECONDS) preloadTask = preload()
      const fade = autoFadeSeconds(duration)
      if (remaining <= fade) {
        naturalArmed = true
        fading = true
        void runNaturalFade(fade)
      }
    })
    deck.audio.addEventListener("play", () => {
      if (index !== live) return
      hooks.emitPlay()
      hooks.setPlaybackState(true)
    })
    deck.audio.addEventListener("pause", () => {
      if (index !== live || fading) return
      hooks.emitPause()
      hooks.setPlaybackState(false)
    })
    deck.audio.addEventListener("ended", () => {
      if (index !== live || held > 0) return
      const incoming = decks[1 - index]
      if (fading && incoming.url && !incoming.audio.paused) return
      const duration = Number.isFinite(deck.audio.duration) ? deck.audio.duration : 0
      const position = deck.audio.currentTime > 0 ? deck.audio.currentTime : duration
      fadeToken += 1
      fading = false
      naturalArmed = true
      prepToken += 1
      preloadTask = null
      hooks.emitEnded({ position, duration })
    })
  }

  async function preload() {
    const token = prepToken
    const file = await hooks.nextFile()
    if (!file || token !== prepToken) return null
    const idle = decks[1 - live]
    if (!sameFile(idle, file)) assign(idle, file)
    return file
  }

  async function runNaturalFade(seconds: number) {
    const from = live
    const token = fadeToken
    const file = await (preloadTask ?? preload())
    if (!file || from !== live || token !== fadeToken) {
      if (token === fadeToken) fading = false
      return
    }
    await fadeFrom(from, file, seconds, "natural")
  }

  async function fadeFrom(from: number, file: File, seconds: number, how: Handoff["how"]) {
    await ensureAudio()
    const outgoing = decks[from]
    const incoming = decks[1 - from]
    if (!sameFile(incoming, file)) assign(incoming, file)
    incoming.audio.currentTime = 0
    setGain(incoming, 0)
    const position = outgoing.audio.currentTime || 0
    const duration = Number.isFinite(outgoing.audio.duration) ? outgoing.audio.duration : 0
    try {
      await incoming.audio.play()
    } catch (error) {
      fading = false
      naturalArmed = false
      throw error
    }
    if (how === "natural" && from !== live) {
      if (decks[live] !== incoming) incoming.audio.pause()
      fading = false
      return
    }
    live = 1 - from
    fading = true
    resetPrepare()
    hooks.emitHandoff({ how, position, duration, fresh: false })
    hooks.emitTime(incoming.audio.currentTime, incoming.audio.duration || 0)
    hooks.publishPosition(incoming.audio, true)
    ramp(outgoing, incoming, Math.max(0.05, seconds))
    const token = ++fadeToken
    window.setTimeout(() => finishFade(token, from), seconds * 1000 + 40)
  }

  function finishFade(token: number, from: number) {
    if (token !== fadeToken) return
    fading = false
    setGain(decks[from], 0)
    release(decks[from])
    setGain(decks[live], 1)
    hooks.publishPosition(decks[live].audio, true)
  }

  function ramp(outgoing: Deck, incoming: Deck, seconds: number) {
    if (!context || !outgoing.gain || !incoming.gain) return
    const now = context.currentTime + 0.02
    const samples = 128
    schedule(outgoing.gain.gain, curve(samples, "out"), now, seconds)
    schedule(incoming.gain.gain, curve(samples, "in"), now, seconds)
  }

  function schedule(param: AudioParam, values: Float32Array, when: number, seconds: number) {
    param.cancelScheduledValues(when)
    param.setValueAtTime(values[0], when - 0.01)
    param.setValueCurveAtTime(values, when, seconds)
  }

  function curve(samples: number, edge: "in" | "out") {
    const values = new Float32Array(samples)
    for (let index = 0; index < samples; index += 1) {
      const progress = samples === 1 ? 1 : index / (samples - 1)
      const angle = progress * (Math.PI / 2)
      values[index] = edge === "out" ? Math.cos(angle) : Math.sin(angle)
    }
    return values
  }

  function autoFadeSeconds(duration: number) {
    if (crossfadeSeconds <= 0) return Number.POSITIVE_INFINITY
    if (duration < 3 * crossfadeSeconds) return Math.min(SHORT_FADE_SECONDS, duration)
    return Math.min(crossfadeSeconds, duration)
  }

  async function cutTo(from: number, file: File) {
    await ensureAudio()
    const outgoing = decks[from]
    const incoming = decks[1 - from]
    if (!sameFile(incoming, file)) assign(incoming, file)
    incoming.audio.currentTime = 0
    setGain(outgoing, 0)
    setGain(incoming, 1)
    const position = outgoing.audio.currentTime || 0
    const duration = Number.isFinite(outgoing.audio.duration) ? outgoing.audio.duration : 0
    await incoming.audio.play()
    live = 1 - from
    fading = false
    resetPrepare()
    hooks.emitHandoff({ how: "manual", position, duration, fresh: false })
    hooks.emitTime(incoming.audio.currentTime, incoming.audio.duration || 0)
    hooks.publishPosition(incoming.audio, true)
    release(outgoing)
    setGain(decks[live], 1)
  }

  function cancelCrossfade() {
    fadeToken += 1
    fading = false
    naturalArmed = false
    const outgoing = decks[1 - live]
    setGain(decks[live], 1)
    setGain(outgoing, 0)
    if (outgoing.url) release(outgoing)
    prepToken += 1
    preloadTask = null
  }

  function rampMaster(to: number, seconds: number) {
    if (!context || !master) return
    const now = context.currentTime
    const param = master.gain
    const from = Number.isFinite(param.value) ? param.value : masterLevel
    param.cancelScheduledValues(now)
    param.setValueAtTime(from, now)
    if (seconds <= 0) {
      param.setValueAtTime(to, now)
      return
    }
    param.linearRampToValueAtTime(Math.max(0, to), now + seconds)
  }

  function assign(deck: Deck, file: File) {
    if (deck.url) URL.revokeObjectURL(deck.url)
    deck.file = file
    deck.url = URL.createObjectURL(file)
    deck.audio.src = deck.url
  }

  function release(deck: Deck) {
    deck.audio.pause()
    deck.audio.removeAttribute("src")
    deck.audio.load()
    if (deck.url) URL.revokeObjectURL(deck.url)
    deck.url = null
    deck.file = null
  }

  function setGain(deck: Deck, value: number) {
    const param = deck.gain?.gain
    if (!param || !context) return
    const now = context.currentTime
    param.cancelScheduledValues(now)
    param.setValueAtTime(value, now)
  }

  function resetPrepare() {
    prepToken += 1
    preloadTask = null
    naturalArmed = false
  }
}
