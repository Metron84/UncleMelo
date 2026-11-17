export type ThemeName = "night" | "day"

export const THEME_STORAGE_KEY = "unclemelo-theme"

export function themeFromClock(date = new Date()): ThemeName {
  const hour = date.getHours()
  return hour >= 18 || hour < 7 ? "night" : "day"
}

export function readTheme(): ThemeName {
  const saved = localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === "night" || saved === "day") return saved
  return themeFromClock()
}

export function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme
}

export function saveTheme(theme: ThemeName) {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  applyTheme(theme)
}
