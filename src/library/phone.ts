const musicFolder = "music"

export function phoneStorageAvailable() {
  return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function"
}

export async function clearPhoneMusic() {
  const root = await navigator.storage.getDirectory()
  await root.removeEntry(musicFolder, { recursive: true }).catch(() => {})
}

export async function writePhoneFile(path: string, data: Uint8Array) {
  const writer = openPhoneWriter()
  await writer.write(path, data, true)
  await writer.close()
}

export function openPhoneWriter() {
  let currentPath = ""
  let writable: FileSystemWritableFileStream | null = null

  return {
    async write(path: string, data: Uint8Array | null, final: boolean) {
      if (currentPath !== path || !writable) {
        if (writable) await writable.close()
        writable = await (await fileHandle(path, true)).createWritable()
        currentPath = path
      }
      if (data && data.byteLength > 0) {
        const copy = new Uint8Array(data.byteLength)
        copy.set(data)
        await writable.write(copy)
      }
      if (final) {
        await writable.close()
        writable = null
        currentPath = ""
      }
    },
    async close() {
      if (!writable) return
      await writable.close()
      writable = null
      currentPath = ""
    },
  }
}

export async function phoneFile(path: string) {
  try {
    const handle = await fileHandle(path, false)
    return await handle.getFile()
  } catch {
    return null
  }
}

export async function listPhoneFiles() {
  const files: { path: string; file: File }[] = []
  await walk(await musicRoot(true), "", files)
  return files
}

async function musicRoot(create: boolean) {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(musicFolder, { create })
}

async function fileHandle(path: string, create: boolean) {
  const parts = path.split("/").filter(Boolean).map((part) => part.normalize("NFC"))
  if (parts.length === 0) throw new Error("Missing song path")
  let directory = await musicRoot(create)
  for (const part of parts.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(part, { create })
  }
  return directory.getFileHandle(parts[parts.length - 1], { create })
}

async function walk(directory: FileSystemDirectoryHandle, prefix: string, files: { path: string; file: File }[]) {
  for await (const [name, handle] of directory.entries()) {
    const path = prefix ? `${prefix}/${name}` : name
    if (handle.kind === "directory") await walk(handle, path, files)
    else if (handle.kind === "file") files.push({ path, file: await handle.getFile() })
  }
}
