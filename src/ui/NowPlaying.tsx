import { useState, type ReactNode } from "react"
import type { ThemeName } from "../app/theme.ts"
import { genreCover } from "../library/browse.ts"
import type { TrackRecord } from "../library/types.ts"

const modes = ["Late Night", "Drive", "Focus", "Pre-match"] as const
type Mode = (typeof modes)[number]

type NowPlayingProps = {
  theme: ThemeName
  onToggleTheme: () => void
  track: TrackRecord | null
  next: TrackRecord | null
  playing: boolean
  elapsed: number
  duration: number
  coverUrl: string | null
  notice: string | null
  onToggle: () => void
  onPrevious: () => void
  onNext: () => void
  onOpenLibrary: () => void
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const remainder = safe % 60
  return `${minutes}:${remainder.toString().padStart(2, "0")}`
}

export function NowPlaying({
  theme,
  onToggleTheme,
  track,
  next,
  playing,
  elapsed,
  duration,
  coverUrl,
  notice,
  onToggle,
  onPrevious,
  onNext,
  onOpenLibrary,
}: NowPlayingProps) {
  const [mode, setMode] = useState<Mode>("Late Night")
  const colour = genreCover(track?.genre ?? "")
  const remaining = Math.max(0, duration - elapsed)
  const progress = duration === 0 ? 0 : Math.min(100, (elapsed / duration) * 100)

  function cycleMode() {
    setMode((current) => modes[(modes.indexOf(current) + 1) % modes.length])
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-bg px-6 text-text">
      <header className="flex h-11 items-center justify-between">
        <p className="text-body font-medium">UncleMelo</p>
        <div className="flex items-center">
          <button
            type="button"
            className="grid h-11 place-items-center px-1"
            aria-label={`Listening mode ${mode}. Change mode.`}
            onClick={cycleMode}
          >
            <span className="flex h-8 items-center rounded-full border border-line px-3 text-meta text-muted">
              {mode}
            </span>
          </button>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center"
            aria-label={theme === "night" ? "Use daylight theme" : "Use late night theme"}
            onClick={onToggleTheme}
          >
            {theme === "night" ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <div className="relative mx-auto mt-[52px] h-[282px] w-[282px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full blur-[70px] transition-opacity duration-theme ease-theme"
          style={{ background: colour, opacity: theme === "night" ? 0.32 : 0.22 }}
        >
          {coverUrl && <img src={coverUrl} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="relative h-full w-full overflow-hidden rounded-card shadow-art" style={{ background: colour }}>
          {coverUrl && <img src={coverUrl} alt="" className="h-full w-full object-cover" />}
        </div>
      </div>

      <h1 className="mt-10 text-title font-medium">{track?.title ?? "Nothing playing"}</h1>
      <p className="text-body text-muted">{track?.artist ?? "Open the library to choose a song"}</p>
      {notice && <p className="mt-2 text-meta text-muted">{notice}</p>}

      <div className="mt-7">
        <div
          className="h-[3px] overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, Math.round(duration))}
          aria-valuenow={Math.floor(elapsed)}
          aria-label="Playback progress"
        >
          <div className="h-full bg-text" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-meta text-muted">
          <span>{formatTime(elapsed)}</span>
          <span>-{formatTime(remaining)}</span>
        </div>
      </div>

      <div className="mt-[22px] flex items-center justify-center gap-9">
        <button type="button" className="grid h-[52px] w-[52px] place-items-center" aria-label="Previous track" onClick={onPrevious} disabled={!track}>
          <PreviousIcon />
        </button>
        <button
          type="button"
          className="grid h-[68px] w-[68px] place-items-center rounded-full bg-accent text-on-accent disabled:opacity-60"
          aria-label={playing ? "Pause" : "Play"}
          onClick={onToggle}
          disabled={!track}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" className="grid h-[52px] w-[52px] place-items-center" aria-label="Next track" onClick={onNext} disabled={!track}>
          <NextIcon />
        </button>
      </div>

      <div className="mt-auto flex flex-col items-center pt-8 text-center">
        <p className="text-meta text-muted">
          Uncle's pick
          <span className="mt-1 block">up next</span>
        </p>
        {next && (
          <>
            <p className="mt-3 text-body">{next.title}</p>
            <p className="text-meta text-muted">{next.artist}</p>
          </>
        )}
      </div>

      <div className="flex justify-center pb-6 pt-6">
        <button type="button" className="flex h-11 w-40 flex-col items-center justify-center gap-1.5" aria-label="Library" onClick={onOpenLibrary}>
          <span className="h-1 w-10 rounded-full bg-line" aria-hidden="true" />
          <span className="text-meta text-muted">Library</span>
        </button>
      </div>
    </main>
  )
}

function Glyph({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function SunIcon() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="3.25" />
      <path d="M12 3.5v1.75M12 18.75V20.5M3.5 12h1.75M18.75 12H20.5M5.7 5.7l1.25 1.25M17.05 17.05l1.25 1.25M18.3 5.7l-1.25 1.25M6.95 17.05l-1.25 1.25" />
    </Glyph>
  )
}

function MoonIcon() {
  return (
    <Glyph>
      <path d="M16.2 14.8A6.2 6.2 0 0 1 9.2 7.8 6.4 6.4 0 1 0 16.2 14.8z" />
    </Glyph>
  )
}

function PreviousIcon() {
  return (
    <Glyph>
      <path d="M7 6.5v11" />
      <path d="M17.5 6.75 9 12l8.5 5.25V6.75z" />
    </Glyph>
  )
}

function NextIcon() {
  return (
    <Glyph>
      <path d="M17 6.5v11" />
      <path d="M6.5 6.75 15 12l-8.5 5.25V6.75z" />
    </Glyph>
  )
}

function PlayIcon() {
  return (
    <Glyph size={26}>
      <path d="M8.75 6.25v11.5L17.75 12 8.75 6.25z" />
    </Glyph>
  )
}

function PauseIcon() {
  return (
    <Glyph size={26}>
      <path d="M9 6.5v11M15 6.5v11" />
    </Glyph>
  )
}
