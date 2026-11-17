import { parseBlob, selectCover } from "music-metadata"
import { loadCover, saveCover } from "./db.ts"

const squares = new Map<string, string>()

export function genreSquareUrl(colour: string) {
  const cached = squares.get(colour)
  if (cached) return cached
  const canvas = document.createElement("canvas")
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext("2d")
  if (!context) return ""
  context.fillStyle = colour
  context.fillRect(0, 0, 512, 512)
  const url = canvas.toDataURL("image/png")
  squares.set(colour, url)
  return url
}

export async function artworkFor(id: string, file: File) {
  const cached = await loadCover(id)
  if (cached) return cached
  try {
    const metadata = await parseBlob(file, { duration: false })
    const picture = selectCover(metadata.common.picture)
    if (!picture) return null
    const bytes = picture.data.buffer.slice(
      picture.data.byteOffset,
      picture.data.byteOffset + picture.data.byteLength,
    ) as ArrayBuffer
    const blob = new Blob([bytes], { type: picture.format || "image/jpeg" })
    await saveCover(id, blob)
    return blob
  } catch {
    return null
  }
}
