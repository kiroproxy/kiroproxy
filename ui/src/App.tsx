import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HashRouter, Navigate, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/shell/AppShell"
import { AccountDetailPage } from "@/routes/account-detail"
import { AccountsPage } from "@/routes/accounts"
import { ConnectPage } from "@/routes/connect"
import { KeysPage } from "@/routes/keys"
import { LogsPage } from "@/routes/logs"
import { ModelsPage } from "@/routes/models"
import { OverviewPage } from "@/routes/overview"
import { SettingsPage } from "@/routes/settings"
import { UsagePage } from "@/routes/usage"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
})

function App() {
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
            <Route path="settings" element={<Navigate to="/settings/general" replace />} />
            <Route path="settings/:section" element={<SettingsPage />} />
            <Route path="connect" element={<ConnectPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  )
}

export default App
