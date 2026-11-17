import { useEffect, useRef, useState } from "react"
import { readShareName, saveShareName } from "../share/mix.ts"
import { ReflectiveMark } from "./ReflectiveMark.tsx"

type SettingsMenuProps = {
  busy?: boolean
  onRescan?: () => void
  onImport?: (list: FileList) => void
  skipped?: string[]
  sessionOnly?: boolean
}

export function SettingsMenu({ busy = false, onRescan, onImport, skipped = [], sessionOnly = false }: SettingsMenuProps) {
  const [open, setOpen] = useState(false)
  const [showSkipped, setShowSkipped] = useState(false)
  const [name, setName] = useState(() => readShareName())
  const root = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener("pointerdown", onPointer)
    return () => window.removeEventListener("pointerdown", onPointer)
  }, [open])

  return (
    <div className="relative" ref={root}>
      <button type="button" className="grid h-11 w-11 place-items-center" aria-label="Settings" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <GearIcon />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-20 w-64 rounded-card border border-line bg-surface p-4 text-left">
          {onRescan && (
            <button type="button" className="mb-3 block h-11 text-body disabled:opacity-60" onClick={onRescan} disabled={busy}>
              {busy ? "Reading" : "Rescan"}
            </button>
          )}
          {onImport && (
            <>
              <button type="button" className="mb-3 block h-11 text-body" onClick={() => fileRef.current?.click()}>
                Import a zip
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = event.target.files
                  if (files && files.length > 0) onImport(files)
                  event.target.value = ""
                  setOpen(false)
                }}
              />
            </>
          )}
          {sessionOnly && <p className="mb-3 text-meta text-muted">On this browser, you'll need to choose your files again next time.</p>}
          {skipped.length > 0 && (
            <div className="mb-3">
              <button type="button" className="text-meta text-muted" onClick={() => setShowSkipped((value) => !value)}>
                {skipped.length} skipped · view
              </button>
              {showSkipped && (
                <ul className="mt-2 max-h-40 overflow-y-auto text-meta text-text">
                  {skipped.map((name, index) => (
                    <li key={`${name}-${index}`}>{name}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <label className="block text-meta text-muted" htmlFor="share-name">
            Your name for shared mixes
          </label>
          <input
            id="share-name"
            value={name}
            autoComplete="name"
            className="mt-2 h-11 w-full rounded-[14px] bg-bg px-3 text-body text-text"
            onChange={(event) => {
              setName(event.target.value)
              saveShareName(event.target.value)
            }}
          />
          <ReflectiveMark className="mt-4" />
        </div>
      )}
    </div>
  )
}

function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.2 2.8h3.6l.4 2.2a7.2 7.2 0 0 1 1.8 1l2-1 2.5 2.5-1 2a7.2 7.2 0 0 1 1 1.8l2.2.4v3.6l-2.2.4a7.2 7.2 0 0 1-1 1.8l1 2-2.5 2.5-2-1a7.2 7.2 0 0 1-1.8 1l-.4 2.2h-3.6l-.4-2.2a7.2 7.2 0 0 1-1.8-1l-2 1-2.5-2.5 1-2a7.2 7.2 0 0 1-1-1.8l-2.2-.4V10l2.2-.4a7.2 7.2 0 0 1 1-1.8l-1-2 2.5-2.5 2 1a7.2 7.2 0 0 1 1.8-1l.4-2.2Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  )
}
