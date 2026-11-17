import { useState } from "react"
import { NowPlaying } from "../ui/NowPlaying.tsx"
import { applyTheme, readTheme, saveTheme, type ThemeName } from "./theme.ts"

export default function App() {
  const [theme, setTheme] = useState<ThemeName>(() => {
    const initial = readTheme()
    applyTheme(initial)
    return initial
  })

  function toggleTheme() {
    const next = theme === "night" ? "day" : "night"
    saveTheme(next)
    setTheme(next)
  }

  return <NowPlaying theme={theme} onToggleTheme={toggleTheme} />
}
