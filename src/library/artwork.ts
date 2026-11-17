import { parseBlob, selectCover } from "music-metadata"
import { loadCover, saveCover } from "./db.ts"

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
