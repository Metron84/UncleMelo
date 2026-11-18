import type { TrackRecord } from "../library/types.ts"

export const listeningModes = ["Late Night", "Drive", "Focus", "Pre-match"] as const
export type ListeningMode = (typeof listeningModes)[number]

export type PlayHistory = {
  trackId: string
  startedAt: number
  playedSeconds: number
  completed: boolean
  skipped: boolean
  hour: number
  mode: string
}

export type Pick = {
  track: TrackRecord
  reason: string
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const TEMPERATURE = 0.6

const neighbours = [
  ["Folk", "Singer-Songwriter", "Indie Folk"],
  ["Rock", "Indie & Alternative"],
  ["Hip-Hop", "R&B & Soul"],
  ["Pop", "Electronic & Dance"],
] as const

const modeFit: Record<ListeningMode, { likes: readonly string[]; avoids: readonly string[] }> = {
  "Late Night": {
    likes: ["Singer-Songwriter", "Indie Folk", "Folk", "Soundtrack & Score", "R&B & Soul"],
    avoids: ["Electronic & Dance", "Hip-Hop"],
  },
  Drive: {
    likes: ["Rock", "Hip-Hop", "Pop", "Indie & Alternative", "Electronic & Dance"],
    avoids: ["Soundtrack & Score"],
  },
  Focus: {
    likes: ["Soundtrack & Score", "Indie Folk", "Singer-Songwriter", "Folk"],
    avoids: ["Hip-Hop", "Pop"],
  },
  "Pre-match": {
    likes: ["Hip-Hop", "Rock", "Electronic & Dance", "Pop"],
    avoids: ["Soundtrack & Score", "Singer-Songwriter"],
  },
}

export function isListeningMode(value: string | null | undefined): value is ListeningMode {
  return listeningModes.includes(value as ListeningMode)
}

export function primaryArtist(artist: string) {
  const [head] = artist.split(/\s+(?:feat\.?|ft\.?|featuring|&)\s+/i)
  return head.trim().toLocaleLowerCase()
}

export type PickBias = {
  loved?: ReadonlySet<string>
  hidden?: ReadonlySet<string>
}

export function pickNext(
  current: TrackRecord | null,
  library: readonly TrackRecord[],
  history: readonly PlayHistory[],
  mode: ListeningMode,
  now: number,
  random: () => number = Math.random,
  bias: PickBias = {},
): Pick | null {
  const hidden = bias.hidden
  const source = hidden && hidden.size > 0 ? library.filter((track) => !hidden.has(track.id)) : library
  const pool = candidates(source, history, current, now)
  if (pool.length === 0) return null
  const byId = new Map(library.map((track) => [track.id, track]))
  const ranked = pool
    .map((track) => scoreTrack(track, current, history, byId, mode, now, bias.loved))
    .sort((a, b) => b.score - a.score || a.track.id.localeCompare(b.track.id))
  const top = ranked.slice(0, 25)
  const chosen = weighted(top, random)
  return { track: chosen.track, reason: chosen.reason }
}

function candidates(
  library: readonly TrackRecord[],
  history: readonly PlayHistory[],
  current: TrackRecord | null,
  now: number,
) {
  const recent = new Set(
    [...history].sort((a, b) => b.startedAt - a.startedAt).slice(0, 60).map((play) => play.trackId),
  )
  const cutoff = now - 3 * HOUR
  const recentHours = new Set(history.filter((play) => play.startedAt >= cutoff).map((play) => play.trackId))
  const artist = current ? primaryArtist(current.artist) : null
  const rules = [
    (track: TrackRecord) =>
      track.id !== current?.id &&
      !recentHours.has(track.id) &&
      !recent.has(track.id) &&
      (artist === null || primaryArtist(track.artist) !== artist),
    (track: TrackRecord) =>
      track.id !== current?.id &&
      !recentHours.has(track.id) &&
      (artist === null || primaryArtist(track.artist) !== artist),
    (track: TrackRecord) =>
      track.id !== current?.id && (artist === null || primaryArtist(track.artist) !== artist),
    (track: TrackRecord) => track.id !== current?.id,
    () => true,
  ]
  for (const keep of rules) {
    const found = library.filter(keep)
    if (found.length > 0) return found
  }
  return []
}

function scoreTrack(
  track: TrackRecord,
  current: TrackRecord | null,
  history: readonly PlayHistory[],
  byId: Map<string, TrackRecord>,
  mode: ListeningMode,
  now: number,
  loved?: ReadonlySet<string>,
) {
  const trackPlays = history.filter((play) => play.trackId === track.id)
  const artistPlays = history.filter((play) => {
    const owner = byId.get(play.trackId)
    return owner ? primaryArtist(owner.artist) === primaryArtist(track.artist) : false
  })
  const completion = rate(trackPlays, (play) => play.completed)
  const artistCompletion = rate(artistPlays, (play) => play.completed)
  const skipRate = rate(trackPlays, (play) => play.skipped)
  const sameGenre = current ? track.genre === current.genre : false
  const neighbourGenre = current ? isNeighbour(track.genre, current.genre) : false
  const decade = current ? decadesClose(track.decade, current.decade) : false
  const differentDecade = current ? track.decade !== current.decade : false
  const fit = modeFit[mode]
  const modeScore = fit.likes.includes(track.genre) ? 2 : fit.avoids.includes(track.genre) ? -2 : 0
  const lastPlay = trackPlays.reduce((latest, play) => Math.max(latest, play.startedAt), 0)
  const rediscovery = trackPlays.length > 0 && completion >= 0.7 && now - lastPlay >= 30 * DAY
  const timeFit = clustersNear(trackPlays, new Date(now).getHours())
  const love = loved?.has(track.id) ? 2 : 0

  const factors = [
    { value: rediscovery ? 1.5 : 0, reason: "You haven't played this in a while" },
    { value: completion >= 0.7 ? 2 * completion : 0, reason: "One you always finish" },
    {
      value: sameGenre ? 1.5 : 0,
      reason: differentDecade ? "Same mood, different decade" : "Staying in this mood",
    },
    { value: modeScore, reason: `Fits ${mode}` },
    { value: neighbourGenre ? 0.75 : 0, reason: "A neighbour of this sound" },
    { value: timeFit ? 0.5 : 0, reason: "You often play this around now" },
    { value: decade ? 0.5 : 0, reason: "From a nearby decade" },
    { value: artistPlays.length > 0 && artistCompletion >= 0.7 ? artistCompletion : 0, reason: "An artist you stay with" },
    { value: love, reason: "A song you love" },
  ]
  const score =
    2 * completion +
    artistCompletion -
    2 * skipRate +
    (sameGenre ? 1.5 : 0) +
    (neighbourGenre ? 0.75 : 0) +
    (decade ? 0.5 : 0) +
    modeScore +
    (rediscovery ? 1.5 : 0) +
    (timeFit ? 0.5 : 0) +
    love
  const reason = factors.reduce((best, factor) => (factor.value > best.value ? factor : best), factors[0]).reason
  return { track, score, reason }
}

function weighted<T extends { score: number }>(items: T[], random: () => number) {
  const max = Math.max(...items.map((item) => item.score))
  const weights = items.map((item) => Math.exp((item.score - max) / TEMPERATURE))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let roll = random() * total
  for (let index = 0; index < items.length; index += 1) {
    roll -= weights[index]
    if (roll <= 0) return items[index]
  }
  return items[items.length - 1]
}

function rate(plays: readonly PlayHistory[], match: (play: PlayHistory) => boolean) {
  if (plays.length === 0) return 0.5
  return plays.filter(match).length / plays.length
}

function isNeighbour(left: string, right: string) {
  if (!left || !right || left === right) return false
  return neighbours.some((group) => (group as readonly string[]).includes(left) && (group as readonly string[]).includes(right))
}

function decadesClose(left: string, right: string) {
  const a = Number.parseInt(left, 10)
  const b = Number.parseInt(right, 10)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return Math.abs(a - b) <= 10
}

function clustersNear(plays: readonly PlayHistory[], hour: number) {
  if (plays.length === 0) return false
  const near = plays.filter((play) => hourDistance(play.hour, hour) <= 2).length
  return near / plays.length >= 0.5
}

function hourDistance(left: number, right: number) {
  const distance = Math.abs(left - right) % 24
  return Math.min(distance, 24 - distance)
}
