const libraryFolder = "library"
const legacyFolder = "music"

type SyncHandle = {
  write(data: Uint8Array, options?: { at?: number }): number
  truncate(size: number): void
  flush(): void
  close(): void
}

type FileWithSync = FileSystemFileHandle & {
  createSyncAccessHandle?: () => Promise<SyncHandle>
}

export type ByteSink = {
  write(chunk: Uint8Array): void | Promise<void>
  close(): void | Promise<void>
  abort(): Promise<void>
}

export function phoneStorageAvailable() {
  return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function"
}

export async function clearPhoneMusic() {
  const root = await navigator.storage.getDirectory()
  await root.removeEntry(libraryFolder, { recursive: true }).catch(() => {})
  await root.removeEntry(legacyFolder, { recursive: true }).catch(() => {})
}

export async function writePhoneFile(path: string, data: Uint8Array) {
  const sink = await openLibrarySink(path)
  try {
    await sink.write(data)
    await sink.close()
  } catch (error) {
    await sink.abort()
    throw error
  }
}

export async function openLibrarySink(path: string): Promise<ByteSink> {
  const { directory, handle, name } = await fileIn(libraryFolder, path, true)
  const sync = await openSyncHandle(handle)
  if (sync) return syncSink(directory, name, sync)
  const stream = await handle.createWritable()
  let closed = false
  return {
    async write(chunk) {
      const copy = new Uint8Array(chunk.byteLength)
      copy.set(chunk)
      await stream.write(copy)
    },
    async close() {
      if (closed) return
      closed = true
      await stream.close()
    },
    async abort() {
      if (!closed) {
        closed = true
        await stream.abort().catch(async () => {
          await stream.close().catch(() => {})
        })
      }
      await directory.removeEntry(name).catch(() => {})
    },
  }
}

export async function phoneFile(path: string) {
  for (const folder of [libraryFolder, legacyFolder]) {
    try {
      const { handle } = await fileIn(folder, path, false)
      return await handle.getFile()
    } catch {
      continue
    }
  }
  return null
}

export async function listPhoneFiles() {
  const files: { path: string; file: File }[] = []
  const seen = new Set<string>()
  for (const folder of [libraryFolder, legacyFolder]) {
    const directory = await folderHandle(folder, false)
    if (directory) await walk(directory, "", files, seen)
  }
  return files
}

async function openSyncHandle(handle: FileSystemFileHandle) {
  const open = (handle as FileWithSync).createSyncAccessHandle
  if (!open) return null
  try {
    return await open.call(handle)
  } catch {
    return null
  }
}

function syncSink(directory: FileSystemDirectoryHandle, name: string, access: SyncHandle): ByteSink {
  access.truncate(0)
  let offset = 0
  let closed = false
  return {
    write(chunk) {
      if (closed) return
      const copy = new Uint8Array(chunk.byteLength)
      copy.set(chunk)
      let pending = copy
      while (pending.byteLength > 0) {
        const written = access.write(pending, { at: offset })
        const count = typeof written === "number" ? written : pending.byteLength
        if (count <= 0) throw new Error("The song could not be saved.")
        offset += count
        pending = pending.subarray(count)
      }
    },
    close() {
      if (closed) return
      closed = true
      access.flush()
      access.close()
    },
    async abort() {
      if (!closed) {
        closed = true
        try { access.truncate(0) } catch { /* the handle may already be closed */ }
        try { access.flush() } catch { /* ignore */ }
        try { access.close() } catch { /* ignore */ }
      }
      await directory.removeEntry(name).catch(() => {})
    },
  }
}

async function folderHandle(folder: string, create: boolean) {
  const root = await navigator.storage.getDirectory()
  try {
    return await root.getDirectoryHandle(folder, { create })
  } catch {
    return null
  }
}

async function fileIn(folder: string, path: string, create: boolean) {
  const parts = path.split("/").filter(Boolean).map((part) => part.normalize("NFC"))
  if (parts.length === 0) throw new Error("Missing song path")
  const root = await navigator.storage.getDirectory()
  let directory = await root.getDirectoryHandle(folder, { create })
  for (const part of parts.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(part, { create })
  }
  const name = parts[parts.length - 1]
  const handle = await directory.getFileHandle(name, { create })
  return { directory, handle, name }
}

async function walk(
  directory: FileSystemDirectoryHandle,
  prefix: string,
  files: { path: string; file: File }[],
  seen: Set<string>,
) {
  for await (const [name, handle] of directory.entries()) {
    const path = prefix ? `${prefix}/${name}` : name
    if (handle.kind === "directory") await walk(handle, path, files, seen)
    else if (handle.kind === "file" && !seen.has(path)) {
      seen.add(path)
      files.push({ path, file: await handle.getFile() })
    }
  }
}
