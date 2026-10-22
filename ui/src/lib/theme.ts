import { useSyncExternalStore } from "react"
import { strings } from "./strings"

export type Theme = "system" | "light" | "dark"

export const THEME_STORAGE_KEY = "kiroproxy.theme"

export const themeOptions: { value: Theme; label: string }[] = [
  { value: "system", label: strings.settings.themeSystem },
  { value: "light", label: strings.settings.themeLight },
  { value: "dark", label: strings.settings.themeDark },
]

const listeners = new Set<() => void>()
let currentTheme: Theme | undefined
let systemMedia: MediaQueryList | undefined

function isTheme(value: string | null): value is Theme {
  return value === "system" || value === "light" || value === "dark"
}

function readStoredTheme(): Theme {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (isTheme(value)) return value
  } catch {
    // localStorage 不可用时跟随系统。
  }
  return "system"
}

export function getTheme(): Theme {
  if (currentTheme === undefined) currentTheme = readStoredTheme()
  return currentTheme
}

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  )
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return
  const dark = theme === "dark" || (theme === "system" && prefersDark())
  document.documentElement.classList.toggle("dark", dark)
}

function emit() {
  for (const listener of listeners) listener()
}

export function setTheme(theme: Theme) {
  currentTheme = theme
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // localStorage 不可用时仅作用于当前会话。
  }
  applyTheme(theme)
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function ensureSystemListener() {
  if (systemMedia || typeof window === "undefined" || typeof window.matchMedia !== "function") return
  systemMedia = window.matchMedia("(prefers-color-scheme: dark)")
  systemMedia.addEventListener("change", () => {
    if (getTheme() === "system") {
      applyTheme("system")
      emit()
    }
  })
}

ensureSystemListener()
applyTheme(getTheme())

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "system" as Theme)
  return { theme, setTheme }
}
