import { strings } from "@/lib/strings"

export const mainNav = [
  { value: "/", label: strings.nav.overview },
  { value: "/accounts", label: strings.nav.accounts },
  { value: "/keys", label: strings.nav.keys },
  { value: "/usage", label: strings.nav.usage },
  { value: "/logs", label: strings.nav.logs },
  { value: "/models", label: strings.nav.models },
]

export const settingsSections = [
  "service",
  "accounts",
  "network",
  "features",
  "data",
  "appearance",
  "about",
] as const

export type SettingsSection = (typeof settingsSections)[number]

export const settingsNav = settingsSections.map((value) => ({
  value,
  label: strings.settings.sections[value],
}))

export function isSettingsSection(value: string | undefined): value is SettingsSection {
  return settingsSections.includes(value as SettingsSection)
}
