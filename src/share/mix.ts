export type MixSong = [string, string]

export type MixPayload = {
  t: string
  by?: string
  s: MixSong[]
}

const shareNameKey = "unclemelo-share-name"

export function readShareName() {
  try {
    return localStorage.getItem(shareNameKey)?.trim() ?? ""
  } catch {
    return ""
  }
}

export function saveShareName(name: string) {
  localStorage.setItem(shareNameKey, name)
  window.dispatchEvent(new Event("unclemelo-share-name"))
}

export function mixPayload(title: string, songs: readonly { artist: string; title: string }[], by: string) {
  const payload: MixPayload = {
    t: title.trim() || "Uncle's Pick",
    s: songs.slice(0, 50).map((song) => [song.artist, song.title]),
  }
  const name = by.trim()
  if (name) payload.by = name
  return payload
}

export function mixUrl(title: string, songs: readonly { artist: string; title: string }[], by: string) {
  return `${window.location.origin}/mix#${encodeMix(mixPayload(title, songs, by))}`
}

export function encodeMix(payload: MixPayload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

export function decodeMix(hash: string): MixPayload | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(raw))
    if (!parsed || typeof parsed !== "object") return null
    const row = parsed as { t?: unknown; by?: unknown; s?: unknown }
    if (typeof row.t !== "string" || !Array.isArray(row.s)) return null
    const songs: MixSong[] = []
    for (const item of row.s) {
      if (!Array.isArray(item) || item.length < 2) return null
      if (typeof item[0] !== "string" || typeof item[1] !== "string") return null
      songs.push([item[0], item[1]])
    }
    const payload: MixPayload = { t: row.t, s: songs }
    if (typeof row.by === "string" && row.by.trim()) payload.by = row.by.trim()
    return payload
  } catch {
    return null
  }
}

export function spotifySearch(artist: string, title: string) {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${title}`.trim())}`
}

export function appleMusicSearch(artist: string, title: string) {
  return `https://music.apple.com/search?term=${encodeURIComponent(`${artist} ${title}`.trim())}`
}

export async function shareLink(title: string, url: string) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url })
      return "shared" as const
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "dismissed" as const
    }
  }
  await navigator.clipboard.writeText(url)
  return "copied" as const
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/")
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  const binary = atob(normalized + pad)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
