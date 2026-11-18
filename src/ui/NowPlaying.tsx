import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { moveItem, type RepeatMode, type SleepChoice } from "../app/playback-order.ts"
import type { ThemeName } from "../app/theme.ts"
import type { ListeningMode } from "../brain/pick.ts"
import { genreCover } from "../library/browse.ts"
import type { TrackRecord } from "../library/types.ts"
import { SettingsMenu, type HiddenTrack } from "./SettingsMenu.tsx"

type NowPlayingProps = {
  theme: ThemeName
  onToggleTheme: () => void
  mode: ListeningMode
  onCycleMode: () => void
  track: TrackRecord | null
  next: TrackRecord | null
  nextReason: string
  playing: boolean
  elapsed: number
  duration: number
  coverUrl: string | null
  notice: string | null
  onToggle: () => void
  onPrevious: () => void
  onNext: () => void
  onOpenLibrary: () => void
  showLibrary?: boolean
  onShare?: () => void
  onClose?: () => void
  skipped?: string[]
  shuffle: boolean
  shuffleDisabled: boolean
  onShuffle: () => void
  repeat: RepeatMode
  onRepeat: () => void
  muted: boolean
  onMute: () => void
  loved: boolean
  onLove: () => void
  sleepOn: boolean
  sleepMark: string | null
  onSleep: (choice: SleepChoice) => void
  coming: TrackRecord[]
  onReorder: (tracks: TrackRecord[]) => void
  onClearQueue: () => void
  handsToUncle: boolean
  queueOpen: boolean
  onQueue: (open: boolean) => void
  onSeek: (seconds: number) => void
  onNotForMe: () => void
  crossfade: number
  onCrossfade: (seconds: number) => void
  hiddenTracks: HiddenTrack[]
  onRestoreHidden: (id: string) => void
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
  mode,
  onCycleMode,
  track,
  next,
  nextReason,
  playing,
  elapsed,
  duration,
  coverUrl,
  notice,
  onToggle,
  onPrevious,
  onNext,
  onOpenLibrary,
  showLibrary = true,
  onShare,
  onClose,
  skipped = [],
  shuffle,
  shuffleDisabled,
  onShuffle,
  repeat,
  onRepeat,
  muted,
  onMute,
  loved,
  onLove,
  sleepOn,
  sleepMark,
  onSleep,
  coming,
  onReorder,
  onClearQueue,
  handsToUncle,
  queueOpen,
  onQueue,
  onSeek,
  onNotForMe,
  crossfade,
  onCrossfade,
  hiddenTracks,
  onRestoreHidden,
}: NowPlayingProps) {
  const [more, setMore] = useState(false)
  const [sleepOpen, setSleepOpen] = useState(false)
  const colour = genreCover(track?.genre ?? "")
  const repeatLabel = repeat === "one" ? "Repeat one" : repeat === "all" ? "Repeat all" : "Repeat off"

  return (
    <main
      className={`mx-auto flex w-full flex-col bg-bg px-6 text-text ${onClose ? "h-dvh max-w-none" : "min-h-dvh max-w-[480px]"}`}
      style={onClose ? { paddingTop: "env(safe-area-inset-top, 0px)" } : undefined}
    >
      <header className="flex h-11 items-center justify-between">
        {onClose ? (
          <button type="button" className="grid h-11 w-11 place-items-center" aria-label="Close" onClick={onClose}>
            <ChevronDown />
          </button>
        ) : (
          <p className="text-body font-medium">UncleMelo</p>
        )}
        <div className="flex items-center">
          <button
            type="button"
            className="grid h-11 place-items-center px-1"
            aria-label={`Listening mode ${mode}. Change mode.`}
            onClick={onCycleMode}
          >
            <span className="flex h-8 items-center rounded-full border border-line px-3 text-meta text-muted">
              {mode}
            </span>
          </button>
          {!onClose && (
            <SettingsMenu
              skipped={skipped}
              crossfade={crossfade}
              onCrossfade={onCrossfade}
              hiddenTracks={hiddenTracks}
              onRestoreHidden={onRestoreHidden}
            />
          )}
          {!onClose && (
            <button
              type="button"
              className="grid h-11 w-11 place-items-center"
              aria-label={theme === "night" ? "Use daylight theme" : "Use late night theme"}
              onClick={onToggleTheme}
            >
              {theme === "night" ? <SunIcon /> : <MoonIcon />}
            </button>
          )}
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

      <div className="mt-10 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-title font-medium">{track?.title ?? "Nothing playing"}</h1>
          <p className="text-body text-muted">{track?.artist ?? "Open the library to choose a song"}</p>
        </div>
        <div className="relative">
          <button type="button" className="grid h-11 w-11 place-items-center text-muted" aria-label="More" aria-expanded={more} onClick={() => setMore((open) => !open)} disabled={!track}>
            <MoreIcon />
          </button>
          {more && track && (
            <div className="absolute right-0 top-11 z-30 w-40 overflow-hidden rounded-[14px] border border-line bg-surface" role="menu">
              <button
                type="button"
                role="menuitem"
                className="block h-11 w-full px-4 text-left text-body"
                onClick={() => {
                  onNotForMe()
                  setMore(false)
                }}
              >
                Not for me
              </button>
            </div>
          )}
        </div>
      </div>
      {notice && <p className="mt-2 text-meta text-muted">{notice}</p>}

      <SeekBar elapsed={elapsed} duration={duration} onSeek={onSeek} />

      <div className="mt-[22px] flex items-center justify-between">
        <button
          type="button"
          className={`relative grid h-11 w-11 place-items-center ${shuffle && !shuffleDisabled ? "text-accent" : "text-muted"}`}
          aria-label={shuffleDisabled ? "Uncle is choosing" : shuffle ? "Turn shuffle off" : "Turn shuffle on"}
          aria-pressed={shuffle && !shuffleDisabled}
          onClick={onShuffle}
          disabled={shuffleDisabled || !track}
        >
          <ShuffleIcon />
        </button>
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
        <button
          type="button"
          className={`relative grid h-11 w-11 place-items-center ${repeat === "off" ? "text-muted" : "text-accent"}`}
          aria-label={repeatLabel}
          aria-pressed={repeat !== "off"}
          onClick={onRepeat}
          disabled={!track}
        >
          <RepeatIcon />
          {repeat === "one" && <span className="absolute right-1 top-1 text-[9px] font-medium leading-none">1</span>}
        </button>
      </div>

      <div className="mt-2 flex items-center justify-evenly">
        <button type="button" className={`grid h-11 w-11 place-items-center ${loved ? "text-accent" : "text-muted"}`} aria-label={loved ? "Loved" : "Love"} aria-pressed={loved} onClick={onLove} disabled={!track}>
          <HeartIcon filled={loved} />
        </button>
        <button type="button" className={`grid h-11 w-11 place-items-center ${queueOpen ? "text-accent" : "text-muted"}`} aria-label="Up next" aria-expanded={queueOpen} onClick={() => onQueue(!queueOpen)}>
          <QueueIcon />
        </button>
        <div className="relative">
          <button
            type="button"
            className={`relative grid h-11 w-11 place-items-center ${sleepOn ? "text-accent" : "text-muted"}`}
            aria-label={sleepMark ? `Sleep timer, ${sleepMark}` : "Sleep timer"}
            aria-expanded={sleepOpen}
            onClick={() => setSleepOpen((open) => !open)}
          >
            <SleepIcon />
            {sleepMark && <span className="absolute bottom-0.5 text-[9px] leading-none">{sleepMark}</span>}
          </button>
          {sleepOpen && (
            <SleepMenu
              onChoose={(choice) => {
                onSleep(choice)
                setSleepOpen(false)
              }}
            />
          )}
        </div>
        <button
          type="button"
          className={`grid h-11 w-11 place-items-center ${muted ? "text-accent" : "text-muted"}`}
          aria-label={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
          title="Mutes UncleMelo. Phone volume buttons still control the system volume."
          onClick={onMute}
        >
          {muted ? <SpeakerOffIcon /> : <SpeakerIcon />}
        </button>
      </div>
      {queueOpen && (
        <QueueSheet
          tracks={coming}
          showUncle={handsToUncle}
          onClose={() => onQueue(false)}
          onReorder={onReorder}
          onClear={onClearQueue}
        />
      )}

      <div className="mt-auto flex flex-col items-center pt-8 text-center">
        <div className="flex items-center gap-1">
          <p className="text-meta text-muted">
            Uncle's pick
            <span className="mt-1 block">up next</span>
          </p>
          {onShare && (
            <button type="button" className="grid h-11 w-11 place-items-center" aria-label="Share" onClick={onShare}>
              <ShareIcon />
            </button>
          )}
        </div>
        {next && (
          <>
            <p className="mt-3 text-body">{next.title}</p>
            <p className="text-meta text-muted">{next.artist}</p>
            {nextReason && <p className="text-meta text-muted">{nextReason}</p>}
          </>
        )}
      </div>

      {showLibrary && (
        <div className="flex justify-center pb-6 pt-6">
          <button type="button" className="flex h-11 w-40 flex-col items-center justify-center gap-1.5" aria-label="Library" onClick={onOpenLibrary}>
            <span className="h-1 w-10 rounded-full bg-line" aria-hidden="true" />
            <span className="text-meta text-muted">Library</span>
          </button>
        </div>
      )}
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

function ChevronDown() {
  return (
    <Glyph>
      <path d="M6.5 9.5 12 15l5.5-5.5" />
    </Glyph>
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

function ShareIcon() {
  return (
    <Glyph size={20}>
      <path d="M12 4v9" />
      <path d="M8.5 7 12 3.75 15.5 7" />
      <path d="M6 11.5V19h12v-7.5" />
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

function ShuffleIcon() {
  return (
    <Glyph size={20}>
      <path d="M4 7h3.2c2.2 0 3.4 1.1 4.6 2.8L16 16.5h4" />
      <path d="M16 4.5 20 7.5 16 10.5" />
      <path d="M4 17h3.2c2.2 0 3.4-1.1 4.6-2.8" />
      <path d="M14.2 9.2 16 7.5h4" />
      <path d="M16 13.5 20 16.5 16 19.5" />
    </Glyph>
  )
}

function RepeatIcon() {
  return (
    <Glyph size={20}>
      <path d="M7 7h8.5A3.5 3.5 0 0 1 19 10.5V13" />
      <path d="M16 4.5 19 7.5 16 10.5" />
      <path d="M17 17H8.5A3.5 3.5 0 0 1 5 13.5V11" />
      <path d="M8 19.5 5 16.5 8 13.5" />
    </Glyph>
  )
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <Glyph size={20}>
      <path d="M12 18.5s-5.6-3.4-5.6-7.2A3.1 3.1 0 0 1 12 8.6a3.1 3.1 0 0 1 5.6 2.7c0 3.8-5.6 7.2-5.6 7.2z" fill={filled ? "currentColor" : "none"} />
    </Glyph>
  )
}

function QueueIcon() {
  return (
    <Glyph size={20}>
      <path d="M8 7h11M8 12h11M8 17h11" />
      <path d="M4 7h.01M4 12h.01M4 17h.01" />
    </Glyph>
  )
}

function SleepIcon() {
  return (
    <Glyph size={20}>
      <circle cx="12" cy="13" r="6" />
      <path d="M12 10.5V13l2 1.4" />
      <path d="M9 4.5h6" />
    </Glyph>
  )
}

function SpeakerIcon() {
  return (
    <Glyph size={20}>
      <path d="M4 10v4h3.2L12 18V6L7.2 10H4z" />
      <path d="M15.2 9.4a3.4 3.4 0 0 1 0 5.2" />
      <path d="M17.2 7.2a6 6 0 0 1 0 9.6" />
    </Glyph>
  )
}

function SpeakerOffIcon() {
  return (
    <Glyph size={20}>
      <path d="M4 10v4h3.2L12 18V6L7.2 10H4z" />
      <path d="M16 10.5 20 14.5M20 10.5 16 14.5" />
    </Glyph>
  )
}

function MoreIcon() {
  return (
    <Glyph size={20}>
      <path d="M6 12h.01M12 12h.01M18 12h.01" />
    </Glyph>
  )
}

function GripIcon() {
  return (
    <Glyph size={18}>
      <path d="M8 7h.01M12 7h.01M16 7h.01M8 12h.01M12 12h.01M16 12h.01M8 17h.01M12 17h.01M16 17h.01" />
    </Glyph>
  )
}

function CloseIcon() {
  return (
    <Glyph size={18}>
      <path d="M8 8l8 8M16 8l-8 8" />
    </Glyph>
  )
}

function SeekBar({ elapsed, duration, onSeek }: { elapsed: number; duration: number; onSeek: (seconds: number) => void }) {
  const bar = useRef<HTMLDivElement>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  const shown = scrub ?? elapsed
  const progress = duration === 0 ? 0 : Math.min(100, (shown / duration) * 100)
  const remaining = Math.max(0, duration - shown)

  function point(clientX: number) {
    const node = bar.current
    if (!node || duration <= 0) return 0
    const rect = node.getBoundingClientRect()
    const ratio = rect.width === 0 ? 0 : Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * duration
  }

  function down(event: ReactPointerEvent<HTMLDivElement>) {
    if (duration <= 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const next = point(event.clientX)
    setScrub(next)
    onSeek(next)
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (scrub === null) return
    const next = point(event.clientX)
    setScrub(next)
    onSeek(next)
  }

  return (
    <div className="mt-7">
      <div
        ref={bar}
        data-no-swipe
        className="group relative flex h-7 cursor-pointer items-center"
        role="slider"
        aria-label="Playback progress"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.round(duration))}
        aria-valuenow={Math.floor(shown)}
        tabIndex={0}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => setScrub(null)}
        onPointerCancel={() => setScrub(null)}
      >
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-line">
          <div className="h-full bg-text" style={{ width: `${progress}%` }} />
        </div>
        <span
          aria-hidden="true"
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text ${scrub === null ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}
          style={{ left: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between text-meta text-muted">
        <span>{formatTime(shown)}</span>
        <span>-{formatTime(remaining)}</span>
      </div>
    </div>
  )
}

function SleepMenu({ onChoose }: { onChoose: (choice: SleepChoice) => void }) {
  const choices: { id: SleepChoice; label: string }[] = [
    { id: "15", label: "15 min" },
    { id: "30", label: "30 min" },
    { id: "60", label: "60 min" },
    { id: "song", label: "End of song" },
    { id: "off", label: "Off" },
  ]
  return (
    <div data-no-swipe className="absolute bottom-12 left-1/2 z-30 w-44 -translate-x-1/2 overflow-hidden rounded-[14px] border border-line bg-surface" role="menu">
      {choices.map((choice) => (
        <button key={choice.id} type="button" role="menuitem" className="block h-11 w-full px-4 text-left text-body" onClick={() => onChoose(choice.id)}>
          {choice.label}
        </button>
      ))}
    </div>
  )
}

function QueueSheet({
  tracks,
  showUncle,
  onClose,
  onReorder,
  onClear,
}: {
  tracks: TrackRecord[]
  showUncle: boolean
  onClose: () => void
  onReorder: (tracks: TrackRecord[]) => void
  onClear: () => void
}) {
  const [draft, setDraft] = useState<TrackRecord[] | null>(null)
  const order = draft ?? tracks

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      event.preventDefault()
      onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" data-no-swipe>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative flex max-h-[80%] w-full flex-col rounded-t-[20px] bg-bg text-text" role="dialog" aria-label="Up next">
        <div className="flex h-12 shrink-0 items-center px-2">
          <button type="button" className="grid h-11 w-11 place-items-center" aria-label="Close" onClick={onClose}>
            <ChevronDown />
          </button>
          <h2 className="flex-1 text-center text-body font-medium">Up next</h2>
          <button
            type="button"
            className="h-11 px-3 text-meta text-muted disabled:opacity-40"
            onClick={() => {
              setDraft(null)
              onClear()
            }}
            disabled={order.length === 0}
          >
            Clear
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          {order.length === 0 && <p className="px-6 py-4 text-body text-muted">Nothing queued</p>}
          {order.map((track, index) => (
            <QueueRow
              key={`${track.id}-${index}`}
              track={track}
              index={index}
              list={order}
              onRemove={() => {
                setDraft(null)
                onReorder(order.filter((_, item) => item !== index))
              }}
              onPreview={setDraft}
              onCommit={(next) => {
                setDraft(null)
                onReorder(next)
              }}
            />
          ))}
          {showUncle && <p className="px-6 py-3 text-meta text-muted">Uncle's pick</p>}
        </div>
      </div>
    </div>
  )
}

function QueueRow({
  track,
  index,
  list,
  onRemove,
  onPreview,
  onCommit,
}: {
  track: TrackRecord
  index: number
  list: TrackRecord[]
  onRemove: () => void
  onPreview: (next: TrackRecord[]) => void
  onCommit: (next: TrackRecord[]) => void
}) {
  const [shift, setShift] = useState(0)

  function swipe(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target
    if (target instanceof Element && target.closest("button")) return
    const startX = event.clientX
    const startY = event.clientY
    let dx = 0
    let horizontal = false
    function move(e: PointerEvent) {
      const next = e.clientX - startX
      const dy = e.clientY - startY
      if (!horizontal) {
        if (Math.abs(next) < 8 && Math.abs(dy) < 8) return
        if (Math.abs(dy) > Math.abs(next)) return
        horizontal = true
      }
      dx = Math.min(0, next)
      setShift(dx)
    }
    function up() {
      if (dx < -72) onRemove()
      setShift(0)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  function drag(event: ReactPointerEvent<HTMLButtonElement>) {
    event.stopPropagation()
    const start = list
    const startY = event.clientY
    const from = index
    let latest = start
    function move(e: PointerEvent) {
      const target = Math.min(start.length - 1, Math.max(0, from + Math.round((e.clientY - startY) / 56)))
      latest = moveItem(start, from, target)
      onPreview(latest)
    }
    function up() {
      onCommit(latest)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  return (
    <div className="flex h-14 items-center" style={{ transform: `translateX(${shift}px)` }} onPointerDown={swipe}>
      <button type="button" className="grid h-11 w-11 shrink-0 place-items-center text-muted" aria-label={`Reorder ${track.title}`} onPointerDown={drag}>
        <GripIcon />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body">{track.title}</p>
        <p className="truncate text-meta text-muted">{track.artist}</p>
      </div>
      <button type="button" className="grid h-11 w-11 shrink-0 place-items-center text-muted" aria-label={`Remove ${track.title}`} onClick={onRemove}>
        <CloseIcon />
      </button>
    </div>
  )
}
