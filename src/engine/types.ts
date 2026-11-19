export type Handoff = {
  how: "manual" | "natural"
  position: number
  duration: number
  fresh: boolean
}

export type PlaybackEnd = {
  position: number
  duration: number
}

export type Listener = {
  time: (current: number, duration: number) => void
  play: () => void
  pause: () => void
  ended: (info: PlaybackEnd) => void
  handoff: (info: Handoff) => void
}

export type EngineHooks = {
  emitHandoff: (info: Handoff) => void
  emitTime: (current: number, duration: number) => void
  emitPlay: () => void
  emitPause: () => void
  emitEnded: (info: PlaybackEnd) => void
  setPlaybackState: (playing: boolean) => void
  publishPosition: (audio: HTMLAudioElement, force: boolean) => void
  nextFile: () => Promise<File | null>
}

export type Engine = {
  audioElement: () => HTMLAudioElement
  hasLoadedFile: () => boolean
  playbackTime: () => number
  playFile: (file: File) => Promise<void>
  pausePlayback: () => void
  resumePlayback: () => Promise<void>
  restartTrack: () => void
  seekTo: (seconds: number) => void
  seekBy: (seconds: number) => void
  setCrossfadeSeconds: (seconds: number) => void
  setNaturalHandoff: (enabled: boolean) => void
  setOutputMuted: (muted: boolean) => Promise<void>
  fadeOutForSleep: (seconds: number, done: () => void) => void
  cancelSleepFade: () => void
  holdAutoAdvance: () => void
  releaseAutoAdvance: () => void
}
