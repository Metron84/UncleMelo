import { useEffect, useRef, useState } from "react"
import { readShareName, saveShareName } from "../share/mix.ts"
import { ReflectiveMark } from "./ReflectiveMark.tsx"

export function SettingsMenu() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(() => readShareName())
  const root = useRef<HTMLDivElement>(null)

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
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
    </svg>
  )
}
