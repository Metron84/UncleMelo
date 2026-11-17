import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate"
import { audioExtensions, ScanCancelled } from "./builder.ts"

export function pathInsideZip(entryName: string, zipFileName: string) {
  const clean = entryName.replaceAll("\\", "/").replace(/^\/+/, "").normalize("NFC")
  if (!clean || clean.endsWith("/")) return null
  const parts = clean.split("/").filter(Boolean)
  if (parts.some((part) => part === "__MACOSX" || part === "_duplicates" || part.startsWith("."))) return null
  const folder = zipFileName.replace(/\.zip$/i, "").normalize("NFC")
  const body = parts[0] === folder ? parts.slice(1) : parts
  if (body.length === 0 || body.some((part) => part.startsWith(".") || part === "_duplicates")) return null
  return body.join("/")
}

export async function readZip(
  file: File,
  onAudio: (path: string, data: Uint8Array) => Promise<void>,
  onProgress: (read: number, total: number) => void,
  signal: AbortSignal,
) {
  if (signal.aborted) throw new ScanCancelled()
  const unzip = new Unzip()
  unzip.register(UnzipInflate)
  unzip.register(UnzipPassThrough)
  let chain = Promise.resolve()
  let failed: Error | null = null
  let libraryText: string | null = null

  unzip.onfile = (entry) => {
    const path = pathInsideZip(entry.name, file.name)
    const chunks: Uint8Array[] = []
    entry.ondata = (error, data, final) => {
      if (failed) return
      if (error) {
        failed = error instanceof Error ? error : new Error("That zip couldn't be read.")
        return
      }
      if (data.length > 0) chunks.push(data.slice())
      if (!final || !path) return
      const bytes = joinChunks(chunks)
      chain = chain.then(async () => {
        if (signal.aborted) throw new ScanCancelled()
        if (path === "library.json" || path.endsWith("/library.json")) {
          libraryText = new TextDecoder().decode(bytes)
          return
        }
        const extension = path.split(".").pop()?.toLocaleLowerCase() ?? ""
        if (!audioExtensions.has(extension)) return
        await onAudio(path, bytes)
      })
    }
    try {
      entry.start()
    } catch {
      entry.terminate()
    }
  }

  const reader = file.stream().getReader()
  let read = 0
  while (true) {
    if (signal.aborted) throw new ScanCancelled()
    const chunk = await reader.read()
    if (chunk.done) {
      unzip.push(new Uint8Array(), true)
      break
    }
    read += chunk.value.byteLength
    onProgress(read, file.size)
    unzip.push(chunk.value, false)
    if (failed) throw failed
  }
  await chain
  if (failed) throw failed
  if (signal.aborted) throw new ScanCancelled()
  return { libraryText }
}

function joinChunks(chunks: Uint8Array[]) {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}
