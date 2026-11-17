import { parseBlob } from "music-metadata"
import type { TagRead } from "./builder.ts"

type InFile = { key: string; file: File }
type InMessage = { id: number; files: InFile[] }

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<InMessage>) => void) | null
  postMessage: (message: unknown) => void
}

scope.onmessage = (event) => {
  void readBatch(event.data)
}

async function readBatch(message: InMessage) {
  const tags: TagRead[] = []
  for (const item of message.files) {
    tags.push({ key: item.key, ...(await readFile(item.file)) })
  }
  scope.postMessage({ id: message.id, tags })
}

async function readFile(file: File): Promise<Omit<TagRead, "key">> {
  try {
    const metadata = await parseBlob(file, { duration: true, skipCovers: false })
    const year = yearOf(metadata.common.year, metadata.common.date)
    return {
      artist: metadata.common.artist?.trim() ?? "",
      title: metadata.common.title?.trim() ?? "",
      album: metadata.common.album?.trim() ?? "",
      year,
      genre: (metadata.common.genre ?? []).join(", "),
      duration: positive(metadata.format.duration),
      bitrate: positive(metadata.format.bitrate) || positive(metadata.format.overallBitrate),
      hasCover: (metadata.common.picture?.length ?? 0) > 0,
    }
  } catch {
    return { artist: "", title: "", album: "", year: null, genre: "", duration: 0, bitrate: 0, hasCover: false }
  }
}

function yearOf(year: number | undefined, date: string | undefined) {
  if (typeof year === "number" && Number.isInteger(year) && year > 0) return year
  const match = /(\d{4})/.exec(date ?? "")
  if (!match) return null
  const parsed = Number(match[1])
  return parsed > 0 ? parsed : null
}

function positive(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0
}
