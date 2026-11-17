import { useEffect, useRef } from "react"
import type { LibraryView } from "../app/useLibrary.ts"
import type { ScanProgress } from "../library/builder.ts"
import { supportsDirectoryPicker } from "../library/folder.ts"
import { ReadingProgress } from "./ReadingProgress.tsx"

type WelcomeProps = {
  view: Exclude<LibraryView, "ready">
  busy: boolean
  message: string | null
  progress: ScanProgress | null
  onChoose: () => void
  onFiles: (list: FileList) => void
  onReconnect: () => void
  onCancel: () => void
}

export function Welcome({ view, busy, message, progress, onChoose, onFiles, onReconnect, onCancel }: WelcomeProps) {
  const reconnecting = view === "reconnect"
  const fileChooser = !supportsDirectoryPicker()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = inputRef.current
    const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent)
    if (!input || iphone || !("webkitdirectory" in HTMLInputElement.prototype)) return
    input.setAttribute("webkitdirectory", "")
    input.setAttribute("directory", "")
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center bg-bg px-6 text-text">
      <p className="text-body font-medium">UncleMelo</p>
      {view !== "loading" && (
        <>
          <h1 className="mt-8 text-title font-medium">Your music. Your folders. No internet needed.</h1>
          <p className="mt-4 text-body text-muted">
            {fileChooser
              ? "In Files, hold UncleMelo Music and tap Compress. Then choose the zip here. The songs stay on this phone."
              : "Point UncleMelo at your UncleMelo Music folder once."}
          </p>
          {progress ? (
            <ReadingProgress done={progress.done} total={progress.total} label={progress.label} onCancel={onCancel} />
          ) : fileChooser && !reconnecting ? (
            <>
              <button
                type="button"
                className="mt-8 h-12 self-start rounded-full bg-accent px-6 text-body font-medium text-on-accent disabled:opacity-60"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
              >
                Choose music files
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.zip,application/zip"
                className="hidden"
                onChange={(event) => {
                  const files = event.target.files
                  if (files && files.length > 0) onFiles(files)
                  event.target.value = ""
                }}
              />
              <p className="mt-4 text-meta text-muted">The phone needs about 4 GB free.</p>
            </>
          ) : (
            <button
              type="button"
              className="mt-8 h-12 self-start rounded-full bg-accent px-6 text-body font-medium text-on-accent disabled:opacity-60"
              onClick={reconnecting ? onReconnect : onChoose}
              disabled={busy}
              aria-busy={busy}
            >
              {reconnecting ? "Reconnect music" : "Build my library"}
            </button>
          )}
          {busy && !progress && <p className="mt-6 text-body">Reading your music</p>}
          {message && <p className="mt-4 text-body text-muted">{message}</p>}
          <p className="mt-6 text-meta text-muted">Nothing is uploaded. Files stay where they are.</p>
        </>
      )}
    </main>
  )
}
