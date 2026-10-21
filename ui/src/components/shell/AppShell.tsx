import type { ReactNode } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { strings } from "@/lib/strings"
import { StatusBar } from "./StatusBar"
import { Toolbar } from "./Toolbar"
import { TopBar } from "./TopBar"
import { useShellStatus } from "./use-shell-status"

export interface AppShellProps {
  title?: string
  subtitle?: string
  actions?: ReactNode
  children?: ReactNode
}

interface PageMeta {
  title: string
  subtitle: string
}

function usePageMeta(): PageMeta {
  const { pathname } = useLocation()

  if (pathname === "/") {
    return { title: strings.overview.title, subtitle: strings.overview.subtitle }
  }
  if (pathname.startsWith("/accounts/")) {
    return { title: strings.accounts.details, subtitle: strings.accounts.subtitle }
  }
  if (pathname.startsWith("/accounts")) {
    return { title: strings.accounts.title, subtitle: strings.accounts.subtitle }
  }
  if (pathname.startsWith("/keys")) {
    return { title: strings.keys.title, subtitle: strings.keys.subtitle }
  }
  if (pathname.startsWith("/usage")) {
    return { title: strings.usage.title, subtitle: strings.usage.subtitle }
  }
  if (pathname.startsWith("/logs")) {
    return { title: strings.logs.title, subtitle: strings.logs.subtitle }
  }
  if (pathname.startsWith("/models")) {
    return { title: strings.models.title, subtitle: strings.models.subtitle }
  }
  if (pathname.startsWith("/settings")) {
    return { title: strings.settings.title, subtitle: strings.settings.subtitle }
  }
  if (pathname.startsWith("/connect")) {
    return { title: strings.connect.title, subtitle: strings.connect.subtitle }
  }
  return { title: strings.app.name, subtitle: "" }
}

export function AppShell({ title, subtitle, actions, children }: AppShellProps) {
  const meta = usePageMeta()
  const shellStatus = useShellStatus()

  return (
    <div className="flex h-screen flex-col bg-background">
      <TopBar status={shellStatus.server} />
      <Toolbar
        title={title ?? meta.title}
        subtitle={subtitle ?? meta.subtitle}
        actions={actions}
      />
      <main className="flex-1 overflow-y-auto px-6 pb-5">{children ?? <Outlet />}</main>
      <StatusBar
        status={shellStatus.server}
        currentAccount={shellStatus.currentAccount}
        rpm={shellStatus.rpm}
        version={shellStatus.version}
      />
    </div>
  )
}
