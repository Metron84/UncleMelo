import type { PlayHistory } from "../brain/pick.ts"
import type { TrackRecord } from "./types.ts"

export type BrowseMode = "Genre" | "Decade" | "Artist" | "Collections"

export const browseModes: readonly BrowseMode[] = ["Genre", "Decade", "Artist", "Collections"]

export const genres = [
  { name: "Folk", cover: "#7A6440" },
  { name: "Singer-Songwriter", cover: "#8A6A3B" },
  { name: "Indie Folk", cover: "#5E6B45" },
  { name: "Indie & Alternative", cover: "#3D4E66" },
  { name: "Rock", cover: "#6E4A3C" },
  { name: "Pop", cover: "#6B3F4E" },
  { name: "Hip-Hop", cover: "#3E3A4A" },
  { name: "R&B & Soul", cover: "#58506E" },
  { name: "Electronic & Dance", cover: "#2F5A66" },
  { name: "Country & Bluegrass", cover: "#7A5A3A" },
  { name: "Soundtrack & Score", cover: "#4A4F57" },
  { name: "Unsorted", cover: "#5A5650" },
] as const

const collectionOrder = ["MrMelo Mix", "The Music of Melo"] as const

const fallbackCover = "#4A4F57"

export type LibraryGroup = {
  name: string
  count: number
  cover: string | null
  tracks: TrackRecord[]
}

export function genreCover(name: string) {
  return genres.find((genre) => genre.name === name)?.cover ?? fallbackCover
}

export function sortTracks(tracks: readonly TrackRecord[]) {
  return [...tracks].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }))
}

export function sortLibrary(tracks: readonly TrackRecord[]) {
  return [...tracks].sort((a, b) => {
    const artist = a.artist.localeCompare(b.artist, undefined, { sensitivity: "base" })
    if (artist !== 0) return artist
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
  })
}

export function searchTracks(tracks: readonly TrackRecord[], query: string) {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  return sortTracks(
    tracks.filter(
      (track) =>
        track.title.toLocaleLowerCase().includes(needle) || track.artist.toLocaleLowerCase().includes(needle),
    ),
  )
}

export function buildGroups(tracks: readonly TrackRecord[], mode: BrowseMode, lovedIds?: ReadonlySet<string>): LibraryGroup[] {
  if (mode === "Genre") return genreGroups(tracks)
  if (mode === "Decade") return namedGroups(tracks, (track) => track.decade, decadeOrder)
  if (mode === "Artist") return artistGroups(tracks)
  return collectionGroups(tracks, lovedIds)
}

function genreGroups(tracks: readonly TrackRecord[]) {
  const map = bucket(tracks, (track) => track.genre)
  const known = new Set<string>(genres.map((genre) => genre.name))
  const listed = genres
    .map((genre) => groupFrom(genre.name, map.get(genre.name) ?? [], genre.cover))
    .filter((group) => group.count > 0)
  const extra = [...map.keys()]
    .filter((name) => !known.has(name) && name.length > 0)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((name) => groupFrom(name, map.get(name) ?? [], genreCover(name)))
  return [...listed, ...extra]
}

function namedGroups(
  tracks: readonly TrackRecord[],
  key: (track: TrackRecord) => string,
  order: (names: string[]) => string[],
) {
  const map = bucket(tracks, key)
  return order([...map.keys()].filter((name) => name.length > 0)).map((name) =>
    groupFrom(name, map.get(name) ?? [], null),
  )
}

function collectionGroups(tracks: readonly TrackRecord[], lovedIds?: ReadonlySet<string>) {
  const names = new Set<string>()
  for (const track of tracks) {
    for (const name of track.collections) names.add(name)
  }
  const known = collectionOrder.filter((name) => names.has(name))
  const extra = [...names]
    .filter((name) => name !== "Loved" && !collectionOrder.includes(name as (typeof collectionOrder)[number]))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  const groups = [...known, ...extra].map((name) =>
    groupFrom(
      name,
      tracks.filter((track) => track.collections.includes(name)),
      null,
    ),
  )
  if (!lovedIds) return groups
  return [groupFrom("Loved", tracks.filter((track) => lovedIds.has(track.id)), "#7A3E3A"), ...groups]
}

function groupFrom(name: string, tracks: TrackRecord[], cover: string | null): LibraryGroup {
  const list = sortTracks(tracks)
  return { name, count: list.length, cover, tracks: list }
}

function bucket(tracks: readonly TrackRecord[], key: (track: TrackRecord) => string) {
  const map = new Map<string, TrackRecord[]>()
  for (const track of tracks) {
    const name = key(track)
    const list = map.get(name)
    if (list) list.push(track)
    else map.set(name, [track])
  }
  return map
}

export function displayArtist(track: TrackRecord) {
  const named = track.primaryArtist?.trim()
  return named || track.artist
}

export function decadesNewest(tracks: readonly TrackRecord[]) {
  return decadeOrder([...new Set(tracks.map((track) => track.decade).filter(Boolean))])
}

export function genresPresent(tracks: readonly TrackRecord[]) {
  const names = new Set(tracks.map((track) => track.genre))
  return genres.filter((genre) => names.has(genre.name)).map((genre) => genre.name)
}

export type HomeList = "Recently played" | "Most played" | "Rediscover"

const DAY = 24 * 60 * 60 * 1000

export function homeTracks(
  kind: HomeList,
  tracks: readonly TrackRecord[],
  history: readonly PlayHistory[],
  now: number,
) {
  const byId = new Map(tracks.map((track) => [track.id, track]))
  if (kind === "Recently played") {
    const seen = new Set<string>()
    const list: TrackRecord[] = []
    for (const play of [...history].sort((a, b) => b.startedAt - a.startedAt)) {
      if (seen.has(play.trackId)) continue
      seen.add(play.trackId)
      const track = byId.get(play.trackId)
      if (track) list.push(track)
    }
    return list
  }
  if (kind === "Most played") {
    const counts = new Map<string, number>()
    for (const play of history) counts.set(play.trackId, (counts.get(play.trackId) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => byId.get(id) ?? null)
      .filter((track): track is TrackRecord => track !== null)
  }
  const grouped = new Map<string, PlayHistory[]>()
  for (const play of history) {
    const list = grouped.get(play.trackId)
    if (list) list.push(play)
    else grouped.set(play.trackId, [play])
  }
  return [...grouped.entries()]
    .map(([id, plays]) => {
      const track = byId.get(id)
      if (!track) return null
      const completed = plays.filter((play) => play.completed).length / plays.length
      const last = plays.reduce((latest, play) => Math.max(latest, play.startedAt), 0)
      if (completed < 0.7 || now - last < 30 * DAY) return null
      return { track, last }
    })
    .filter((item): item is { track: TrackRecord; last: number } => item !== null)
    .sort((a, b) => a.last - b.last)
    .map((item) => item.track)
}

export function artistLetter(name: string) {
  const char = [...name.trim()][0]?.toLocaleUpperCase() ?? "#"
  return /[A-Z]/.test(char) ? char : "#"
}

export function artistInitial(name: string) {
  return [...name.trim()][0]?.toLocaleUpperCase() ?? "#"
}

function artistGroups(tracks: readonly TrackRecord[]) {
  const map = bucket(tracks, displayArtist)
  return artistOrder([...map.keys()]).map((name) => groupFrom(name, map.get(name) ?? [], dominantCover(map.get(name) ?? [])))
}

function dominantCover(tracks: readonly TrackRecord[]) {
  const counts = new Map<string, number>()
  for (const track of tracks) counts.set(track.genre, (counts.get(track.genre) ?? 0) + 1)
  let best = ""
  let count = 0
  for (const [genre, total] of counts) {
    if (total > count) {
      best = genre
      count = total
    }
  }
  return genreCover(best)
}

function decadeOrder(names: string[]) {
  return [...names].sort((a, b) => decadeValue(b) - decadeValue(a))
}

function decadeValue(name: string) {
  if (name === "Unknown decade") return Number.NEGATIVE_INFINITY
  const value = Number.parseInt(name, 10)
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY
}

function artistOrder(names: string[]) {
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
}
