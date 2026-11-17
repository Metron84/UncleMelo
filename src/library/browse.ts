import type { TrackRecord } from "./types.ts"

export type BrowseMode = "Genre" | "Decade" | "Artist" | "Collections"

export const browseModes: readonly BrowseMode[] = ["Genre", "Decade", "Artist", "Collections"]

const genres = [
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

export function buildGroups(tracks: readonly TrackRecord[], mode: BrowseMode): LibraryGroup[] {
  if (mode === "Genre") return genreGroups(tracks)
  if (mode === "Decade") return namedGroups(tracks, (track) => track.decade, decadeOrder)
  if (mode === "Artist") return namedGroups(tracks, (track) => track.artist, artistOrder)
  return collectionGroups(tracks)
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

function collectionGroups(tracks: readonly TrackRecord[]) {
  const names = new Set<string>()
  for (const track of tracks) {
    for (const name of track.collections) names.add(name)
  }
  const known = collectionOrder.filter((name) => names.has(name))
  const extra = [...names]
    .filter((name) => !collectionOrder.includes(name as (typeof collectionOrder)[number]))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  return [...known, ...extra].map((name) =>
    groupFrom(
      name,
      tracks.filter((track) => track.collections.includes(name)),
      null,
    ),
  )
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

function decadeOrder(names: string[]) {
  return [...names].sort((a, b) => decadeValue(b) - decadeValue(a))
}

function decadeValue(name: string) {
  const value = Number.parseInt(name, 10)
  return Number.isFinite(value) ? value : 0
}

function artistOrder(names: string[]) {
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
}
