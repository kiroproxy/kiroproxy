import { lazy, useEffect, useState } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { HashRouter, Navigate, Route, Routes } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { AppShell } from "@/components/shell/AppShell"
import { StartupError } from "@/components/shell/StartupError"
import { ipc } from "@/lib/ipc"
import { createQueryClient } from "@/lib/queries"
import type { IpcErrorShape } from "@/lib/types"
import { OverviewPage } from "@/routes/overview"

// 概览是首屏，直接打包；其余页面按路由拆分，首屏不必加载 recharts 以外的图表、日历等依赖。
const AccountsPage = lazy(() => import("@/routes/accounts").then((m) => ({ default: m.AccountsPage })))
const AccountDetailPage = lazy(() =>
  import("@/routes/account-detail").then((m) => ({ default: m.AccountDetailPage })),
)
const KeysPage = lazy(() => import("@/routes/keys").then((m) => ({ default: m.KeysPage })))
const UsagePage = lazy(() => import("@/routes/usage").then((m) => ({ default: m.UsagePage })))
const LogsPage = lazy(() => import("@/routes/logs").then((m) => ({ default: m.LogsPage })))
const ModelsPage = lazy(() => import("@/routes/models").then((m) => ({ default: m.ModelsPage })))
const SettingsPage = lazy(() => import("@/routes/settings").then((m) => ({ default: m.SettingsPage })))
const ConnectPage = lazy(() => import("@/routes/connect").then((m) => ({ default: m.ConnectPage })))

const queryClient = createQueryClient()

function App() {
  const [startupError, setStartupError] = useState<IpcErrorShape | null>(null)

  useEffect(() => {
    let disposed = false
    void ipc
      .getStartupError()
      .then((error) => {
        if (!disposed) setStartupError(error)
      })
      .catch(() => {
        // 浏览器预览/测试环境没有 Tauri IPC，按正常启动处理。
      })
    return () => {
      disposed = true
    }
  }, [])

  if (startupError) {
    return (
      <StartupError
        error={startupError}
        onRetry={() => {
          void ipc
            .retryStartup()
            .then(() => setStartupError(null))
            .catch(() => window.location.reload())
        }}
      />
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<OverviewPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="accounts/:id" element={<AccountDetailPage />} />
            <Route path="keys" element={<KeysPage />} />
            <Route path="usage" element={<UsagePage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="models" element={<ModelsPage />} />
            <Route path="settings" element={<Navigate to="/settings/service" replace />} />
            <Route path="settings/general" element={<Navigate to="/settings/appearance" replace />} />
            <Route path="settings/:section" element={<SettingsPage />} />
            <Route path="connect" element={<ConnectPage />} />
          </Route>
        </Routes>
      </HashRouter>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App
