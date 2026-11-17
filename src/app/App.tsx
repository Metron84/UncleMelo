import { useEffect, useState } from "react"
import type { TrackRecord } from "../library/types.ts"
import { mixUrl, readShareName, shareLink } from "../share/mix.ts"
import { LibraryPanel, LibrarySheet } from "../ui/LibrarySheet.tsx"
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
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [focusToken, setFocusToken] = useState(0)
  const [toast, setToast] = useState(false)
  const wide = useWideScreen()
  const library = useLibrary()
  const playback = usePlayback(library.handle, library.tracks, library.loseAccess, library.fileFor)

  function toggleTheme() {
    const next = theme === "night" ? "day" : "night"
    saveTheme(next)
    setTheme(next)
  }

  function focusSearch() {
    setLibraryOpen(true)
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
  }, [playback])

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
      if (!wide) setLibraryOpen(false)
    },
    onClose: () => setLibraryOpen(false),
  }

  return (
    <div className={wide ? "flex h-dvh overflow-hidden bg-bg" : undefined}>
      {wide && (
        <div className="flex h-dvh min-w-0 max-w-[720px] flex-1 flex-col overflow-hidden border-r border-line">
          <LibraryPanel {...panel} layout="pane" />
        </div>
      )}
      <div className={wide ? "h-dvh w-[420px] shrink-0 overflow-y-auto" : undefined}>
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
          onOpenLibrary={() => setLibraryOpen(true)}
          showLibrary={!wide}
          onShare={uncleSongs.length > 0 ? () => void shareMix("Uncle's Pick", uncleSongs) : undefined}
        />
      </div>
      {!wide && libraryOpen && (
        <LibrarySheet
          {...panel}
          layout="sheet"
          track={playback.track}
          coverUrl={playback.coverUrl}
          onToggle={playback.toggle}
        />
      )}
      {toast && (
        <p className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-surface px-4 py-2 text-meta text-text" role="status">
          Link copied
        </p>
      )}
    </div>
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
