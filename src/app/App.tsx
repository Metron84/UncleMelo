import { useState } from "react"
import { NowPlaying } from "../ui/NowPlaying.tsx"
import { LibrarySheet } from "../ui/LibrarySheet.tsx"
import { Welcome } from "../ui/Welcome.tsx"
import { applyTheme, readTheme, saveTheme, type ThemeName } from "./theme.ts"
import { useLibrary } from "./useLibrary.ts"
import { usePlayback } from "./usePlayback.ts"

export default function App() {
  const [theme, setTheme] = useState<ThemeName>(() => {
    const initial = readTheme()
    applyTheme(initial)
    return initial
  })
  const [libraryOpen, setLibraryOpen] = useState(false)
  const library = useLibrary()
  const playback = usePlayback(library.handle, library.tracks, library.loseAccess)

  function toggleTheme() {
    const next = theme === "night" ? "day" : "night"
    saveTheme(next)
    setTheme(next)
  }

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

  return (
    <>
      <NowPlaying
        theme={theme}
        onToggleTheme={toggleTheme}
        track={playback.track}
        next={playback.next}
        playing={playback.playing}
        elapsed={playback.elapsed}
        duration={playback.duration}
        coverUrl={playback.coverUrl}
        notice={playback.notice}
        onToggle={playback.toggle}
        onPrevious={playback.previous}
        onNext={playback.nextTrack}
        onOpenLibrary={() => setLibraryOpen(true)}
      />
      {libraryOpen && (
        <LibrarySheet
          tracks={library.tracks}
          currentId={playback.track?.id ?? null}
          busy={library.busy}
          message={library.message}
          onClose={() => setLibraryOpen(false)}
          onPlay={playback.playList}
          onRescan={() => void library.rescan()}
        />
      )}
    </>
  )
}
