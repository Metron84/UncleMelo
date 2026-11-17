const audio = new Audio()
audio.preload = "auto"

let objectUrl: string | null = null

export function audioElement() {
  return audio
}

export async function playFile(file: File) {
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = URL.createObjectURL(file)
  audio.src = objectUrl
  await audio.play()
}

export function pausePlayback() {
  audio.pause()
}

export function resumePlayback() {
  return audio.play()
}

export function hasLoadedFile() {
  return objectUrl !== null
}

type SessionActions = {
  play: () => void
  pause: () => void
  next: () => void
  previous: () => void
}

export function setMediaSession(
  track: { title: string; artist: string; album: string; artwork: string | null; artworkType?: string },
  actions: SessionActions,
) {
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
  navigator.mediaSession.setActionHandler("play", actions.play)
  navigator.mediaSession.setActionHandler("pause", actions.pause)
  navigator.mediaSession.setActionHandler("nexttrack", actions.next)
  navigator.mediaSession.setActionHandler("previoustrack", actions.previous)
}

export function setPlaybackState(playing: boolean) {
  if (!("mediaSession" in navigator)) return
  navigator.mediaSession.playbackState = playing ? "playing" : "paused"
}
