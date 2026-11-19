import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import type { TrackRecord } from "../library/types.ts"
import { mixUrl, readShareName, shareLink } from "../share/mix.ts"
import { LibraryPanel, PhoneMiniPlayer } from "../ui/LibrarySheet.tsx"
import { MixPage } from "../ui/MixPage.tsx"
import { NowPlaying } from "../ui/NowPlaying.tsx"
import { Welcome } from "../ui/Welcome.tsx"
import { applyTheme, readTheme, saveTheme, type ThemeName } from "./theme.ts"
import { useLibrary } from "./useLibrary.ts"
import { usePlayback } from "./usePlayback.ts"

function useWideScreen() {
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 1024px)").matches)
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)")
    const update = () => setWide(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  return wide
}

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/"
  if (path === "/mix") return <MixPage />
  return <Player />
}

function Player() {
  const [theme, setTheme] = useState<ThemeName>(() => {
    const initial = readTheme()
    applyTheme(initial)
    return initial
  })
  const [nowPlaying, setNowPlaying] = useState(false)
  const [focusToken, setFocusToken] = useState(0)
  const [toast, setToast] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const wide = useWideScreen()
  const library = useLibrary()
  const playback = usePlayback(library.handle, library.tracks, library.loseAccess, library.fileFor)

  function toggleTheme() {
    const next = theme === "night" ? "day" : "night"
    saveTheme(next)
    setTheme(next)
  }

  function focusSearch() {
    setFocusToken((value) => value + 1)
  }

  async function shareMix(title: string, tracks: TrackRecord[]) {
    if (tracks.length === 0) return
    try {
      const result = await shareLink(title, mixUrl(title, tracks, readShareName()))
      if (result !== "copied") return
      setToast(true)
      window.setTimeout(() => setToast(false), 2200)
    } catch {
      setToast(false)
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target
      const typing = target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        focusSearch()
        return
      }
      if (typing || event.repeat) return
      if (wide && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const key = event.key.toLowerCase()
        if (key === "s" || key === "r" || key === "m" || key === "l" || key === "q") {
          event.preventDefault()
          if (key === "s") playback.toggleShuffle()
          else if (key === "r") playback.cycleRepeat()
          else if (key === "m") playback.toggleMute()
          else if (key === "l") playback.toggleLove()
          else setQueueOpen((open) => !open)
          return
        }
      }
      if (event.key === " ") {
        event.preventDefault()
        playback.toggle()
      } else if (event.key === "ArrowRight") {
        playback.nextTrack()
      } else if (event.key === "ArrowLeft") {
        playback.previous()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [playback, wide])

  if (library.view !== "ready") {
    return (
      <Welcome
        view={library.view}
        busy={library.busy}
        message={library.message}
        progress={library.progress}
        onChoose={() => void library.choose()}
        onFiles={(list) => void library.chooseFiles(list)}
        onReconnect={() => void library.reconnect()}
        onCancel={library.cancelScan}
      />
    )
  }

  const uncleSongs = playback.endless ? (playback.scope && playback.scope.length > 0 ? playback.scope : uniqueSongs(playback.track, playback.next)) : []

  const panel = {
    tracks: library.tracks,
    history: playback.history,
    art: playback.art,
    currentId: playback.track?.id ?? null,
    playing: playback.playing,
    busy: library.busy,
    message: library.message,
    progress: library.progress,
    sessionOnly: library.sessionOnly,
    focusToken,
    onPlay: playback.playList,
    onPlayNext: playback.playNext,
    onAddToQueue: playback.addToQueue,
    onShuffleGroup: playback.shuffleGroup,
    onShare: (title: string, tracks: TrackRecord[]) => void shareMix(title, tracks),
    onRescan: () => void library.rescan(),
    onCancelScan: library.cancelScan,
    onLetUncleChoose: () => {
      playback.letUncleChoose()
      if (!wide) setNowPlaying(true)
    },
    onClose: () => setNowPlaying(false),
    theme,
    onToggleTheme: toggleTheme,
    onImport: (list: FileList) => void library.chooseFiles(list),
    skipped: library.importReport?.skipped ?? [],
    lovedIds: playback.lovedIds,
    onNotForMe: playback.hideFromUncle,
    crossfade: playback.crossfade,
    onCrossfade: playback.chooseCrossfade,
    hiddenTracks: playback.hiddenTracks,
    onRestoreHidden: playback.restoreHidden,
  }

  const player = (
    <NowPlaying
      theme={theme}
      onToggleTheme={toggleTheme}
      mode={playback.mode}
      onCycleMode={playback.cycleMode}
      track={playback.track}
      next={playback.next}
      nextReason={playback.nextReason}
      playing={playback.playing}
      elapsed={playback.elapsed}
      duration={playback.duration}
      coverUrl={playback.coverUrl}
      notice={playback.notice}
      onToggle={playback.toggle}
      onPrevious={playback.previous}
      onNext={playback.nextTrack}
      onOpenLibrary={() => undefined}
      showLibrary={false}
      onShare={uncleSongs.length > 0 ? () => void shareMix("Uncle's Pick", uncleSongs) : undefined}
      onClose={wide ? undefined : () => setNowPlaying(false)}
      skipped={library.importReport?.skipped ?? []}
      shuffle={playback.shuffle}
      shuffleDisabled={playback.endless}
      onShuffle={playback.toggleShuffle}
      repeat={playback.repeat}
      onRepeat={playback.cycleRepeat}
      muted={playback.muted}
      onMute={playback.toggleMute}
      loved={playback.loved}
      onLove={playback.toggleLove}
      sleepOn={playback.sleepOn}
      sleepMark={playback.sleepMark}
      onSleep={playback.chooseSleep}
      coming={playback.coming}
      onReorder={playback.reorderComing}
      onClearQueue={playback.clearComing}
      handsToUncle={playback.handsToUncle}
      queueOpen={queueOpen}
      onQueue={setQueueOpen}
      onSeek={playback.seek}
      onNotForMe={() => {
        if (playback.track) playback.hideFromUncle(playback.track)
      }}
      crossfade={playback.crossfade}
      onCrossfade={playback.chooseCrossfade}
      hiddenTracks={playback.hiddenTracks}
      onRestoreHidden={playback.restoreHidden}
    />
  )

  if (!wide) {
    return (
      <div className="flex h-dvh flex-col bg-bg">
        <LibraryPanel {...panel} layout="phone" />
        <PhoneMiniPlayer
          track={playback.track}
          coverUrl={playback.coverUrl}
          playing={playback.playing}
          elapsed={playback.elapsed}
          duration={playback.duration}
          onToggle={playback.toggle}
          onPrevious={playback.previous}
          onOpen={() => setNowPlaying(true)}
          loved={playback.loved}
          onLove={playback.toggleLove}
        />
        <SlidingPlayer open={nowPlaying} onClose={() => setNowPlaying(false)}>
          {player}
        </SlidingPlayer>
        {toast && <CopiedToast />}
        {library.importToast && <ImportToast text={library.importToast} />}
      </div>
    )
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <div className="flex h-dvh min-w-0 max-w-[720px] flex-1 flex-col overflow-hidden border-r border-line">
        <LibraryPanel {...panel} layout="pane" />
      </div>
      <div className="h-dvh w-[420px] shrink-0 overflow-y-auto">{player}</div>
      {toast && <CopiedToast />}
      {library.importToast && <ImportToast text={library.importToast} />}
    </div>
  )
}

function SlidingPlayer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const [drag, setDrag] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startY = useRef<number | null>(null)
  if (!open && drag !== 0) setDrag(0)

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!open) return
    const target = event.target
    if (target instanceof Element && target.closest("button, a, input, [data-no-swipe]")) return
    startY.current = event.clientY
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (startY.current === null) return
    setDrag(Math.max(0, event.clientY - startY.current))
  }

  function pointerUp() {
    if (startY.current === null) return
    startY.current = null
    setDragging(false)
    if (drag > 72) requestAnimationFrame(() => onClose())
    else setDrag(0)
  }

  return (
    <div
      className={`fixed inset-0 z-40 bg-bg ${dragging ? "" : "transition-transform duration-theme ease-theme"} ${open ? "" : "pointer-events-none"}`}
      style={{ transform: open ? `translateY(${drag}px)` : "translateY(100%)", backgroundColor: "var(--bg)" }}
      aria-hidden={!open}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
    >
      {children}
    </div>
  )
}

function CopiedToast() {
  return (
    <p className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-surface px-4 py-2 text-meta text-text" role="status">
      Link copied
    </p>
  )
}

function ImportToast({ text }: { text: string }) {
  return (
    <p
      className="fixed left-1/2 z-50 -translate-x-1/2 rounded-full bg-surface px-4 py-2 text-meta text-text"
      style={{ bottom: "calc(64px + env(safe-area-inset-bottom, 0px) + 12px)" }}
      role="status"
    >
      {text}
    </p>
  )
}

function uniqueSongs(current: TrackRecord | null, next: TrackRecord | null) {
  const songs = [current, next].filter((track): track is TrackRecord => track !== null)
  const seen = new Set<string>()
  return songs.filter((track) => {
    if (seen.has(track.id)) return false
    seen.add(track.id)
    return true
  })
}
