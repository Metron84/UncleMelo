import { useEffect, useState } from "react"
import { NowPlaying } from "../ui/NowPlaying.tsx"
import { LibraryPanel, LibrarySheet } from "../ui/LibrarySheet.tsx"
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
  const [theme, setTheme] = useState<ThemeName>(() => {
    const initial = readTheme()
    applyTheme(initial)
    return initial
  })
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [focusToken, setFocusToken] = useState(0)
  const wide = useWideScreen()
  const library = useLibrary()
  const playback = usePlayback(library.handle, library.tracks, library.loseAccess)

  function toggleTheme() {
    const next = theme === "night" ? "day" : "night"
    saveTheme(next)
    setTheme(next)
  }

  function focusSearch() {
    setLibraryOpen(true)
    setFocusToken((value) => value + 1)
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
        onChoose={library.choose}
        onReconnect={library.reconnect}
      />
    )
  }

  const panel = {
    tracks: library.tracks,
    history: playback.history,
    art: playback.art,
    currentId: playback.track?.id ?? null,
    playing: playback.playing,
    busy: library.busy,
    message: library.message,
    focusToken,
    onPlay: playback.playList,
    onPlayNext: playback.playNext,
    onAddToQueue: playback.addToQueue,
    onShuffleGroup: playback.shuffleGroup,
    onRescan: () => void library.rescan(),
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
    </div>
  )
}
