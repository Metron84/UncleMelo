import { openLibrarySink } from "./phone.ts"
import { importPendingSongs, openZip, planZip, readLibraryText, type StoredImport } from "./zip.ts"

type InspectMessage = { type: "inspect"; file: File; completed: StoredImport[] }
type ExtractMessage = { type: "extract"; file: File; completed: StoredImport[] }
type AckMessage = { type: "ack" }
type CancelMessage = { type: "cancel" }
type InMessage = InspectMessage | ExtractMessage | AckMessage | CancelMessage

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<InMessage>) => void) | null
  postMessage: (message: unknown) => void
}

const inbox: InMessage[] = []
let waiter: ((message: InMessage) => void) | null = null
let pumping = false
let cancelled = false

scope.onmessage = (event) => {
  const message = event.data
  if (message.type === "cancel") cancelled = true
  if (waiter) {
    const resolve = waiter
    waiter = null
    resolve(message)
    return
  }
  inbox.push(message)
  void pump()
}

function receive() {
  const next = inbox.shift()
  if (next) return Promise.resolve(next)
  return new Promise<InMessage>((resolve) => {
    waiter = resolve
  })
}

async function pump() {
  if (pumping) return
  pumping = true
  try {
    while (inbox.length > 0) {
      const message = inbox.shift()
      if (!message || message.type === "ack" || message.type === "cancel") continue
      if (message.type === "inspect") await inspect(message)
      if (message.type === "extract") await extract(message)
    }
  } catch (error) {
    scope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "That zip couldn't be read.",
    })
  } finally {
    pumping = false
    if (inbox.length > 0) void pump()
  }
}

async function inspect(message: InspectMessage) {
  cancelled = false
  const opened = await openZip(message.file)
  try {
    const plan = planZip(opened.entries, message.file.name, message.completed)
    scope.postMessage({
      type: "inspected",
      total: plan.songs.length,
      already: plan.already,
      alreadyBytes: plan.alreadyBytes,
      remainingBytes: plan.remainingBytes,
    })
  } finally {
    await opened.reader.close()
  }
}

async function extract(message: ExtractMessage) {
  const opened = await openZip(message.file)
  try {
    const plan = planZip(opened.entries, message.file.name, message.completed)
    if (plan.libraryFilename) {
      const entry = opened.entries.find((item) => item.filename === plan.libraryFilename)
      if (entry && !entry.directory) {
        try {
          const text = await readLibraryText(entry)
          scope.postMessage({ type: "library", text })
          await waitAck()
        } catch (error) {
          console.error("Skipped library.json", error)
        }
      }
    }
    if (cancelled) {
      scope.postMessage({ type: "finished", cancelled: true })
      return
    }
    let done = plan.already
    scope.postMessage({ type: "progress", done, total: plan.songs.length })
    const outcome = await importPendingSongs(opened.entries, plan.pending, {
      aborted: () => cancelled,
      openSink: openLibrarySink,
      onSaved: async (song) => {
        done += 1
        scope.postMessage({ type: "saved", path: song.path, size: song.size, done, total: plan.songs.length })
        await waitAck()
      },
      onSkipped: async (song, error) => {
        done += 1
        const reason = error instanceof Error ? error.message : "Couldn't save this song"
        scope.postMessage({ type: "skipped", name: song.name, path: song.path, reason, done, total: plan.songs.length })
        await waitAck()
      },
    })
    scope.postMessage({ type: "finished", cancelled: outcome === "cancelled" || cancelled })
  } finally {
    await opened.reader.close()
  }
}

async function waitAck() {
  const message = await receive()
  if (message.type === "cancel") cancelled = true
}
