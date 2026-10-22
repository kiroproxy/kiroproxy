import { Navigate, useParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { AccountsSection } from "@/components/settings/AccountsSection"
import { DataSection } from "@/components/settings/DataSection"
import { FeaturesSection } from "@/components/settings/FeaturesSection"
import { NetworkSection } from "@/components/settings/NetworkSection"
import { RestartBanner, SettingRow, SettingsCard } from "@/components/settings/parts"
import { ServiceSection } from "@/components/settings/ServiceSection"
import { UpdateCard } from "@/components/settings/UpdateCard"
import { SegmentedNav } from "@/components/shell/TopBar"
import { LoadError } from "@/components/shell/LoadError"
import { isSettingsSection } from "@/components/shell/nav"
import { useSettings } from "@/lib/queries"
import { strings } from "@/lib/strings"
import { themeOptions, useTheme, type Theme } from "@/lib/theme"
import type { SettingsView } from "@/lib/types"

function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  return (
    <SettingsCard>
      <SettingRow label={strings.settings.theme}>
        <SegmentedNav
          items={themeOptions}
          value={theme}
          onChange={(next) => setTheme(next as Theme)}
          ariaLabel={strings.settings.theme}
        />
      </SettingRow>
      <SettingRow label={strings.settings.reduceMotion} desc={strings.settings.reduceMotionHint}>
        <Badge variant="neutral">{strings.settings.reduceMotionValue}</Badge>
      </SettingRow>
      <SettingRow label={strings.settings.language} desc={strings.settings.appearanceLanguageHint}>
        <span className="text-[12.5px] text-muted-foreground">{strings.settings.languageValue}</span>
      </SettingRow>
    </SettingsCard>
  )
}

function AboutSection({ data }: { data: SettingsView }) {
  return (
    <>
      <SettingsCard>
      <SettingRow label={strings.settings.version}>
        <code className="font-mono text-[12px]">v{data.version}</code>
      </SettingRow>
      <SettingRow label={strings.settings.upstreamCredit}>
        <span className="text-[12px] text-muted-foreground">TsinHzl/kiro2cc-proxy · hank9999/kiro.rs</span>
      </SettingRow>
      <SettingRow label={strings.settings.license}>
        <span className="text-[12px] text-muted-foreground">MIT</span>
      </SettingRow>
      <SettingRow label={strings.settings.projectLink}>
        <span className="text-[12px] text-muted-foreground">github.com/kiroproxy/kiroproxy</span>
      </SettingRow>
      </SettingsCard>
      <UpdateCard />
    </>
  )
}

export function SettingsPage() {
  const { section } = useParams<{ section: string }>()
  const settings = useSettings()

  if (!isSettingsSection(section)) return <Navigate to="/settings/service" replace />
  if (section === "appearance") {
    return (
      <section className="flex flex-col gap-3">
        <AppearanceSection />
      </section>
    )
  }
  if (settings.isError) return <LoadError error={settings.error} onRetry={() => void settings.refetch()} />
  if (!settings.data) return <Skeleton className="h-64 w-full rounded-[16px]" />

  const data = settings.data
  return (
    <section aria-label={strings.settings.sections[section]} className="flex flex-col gap-3">
      <RestartBanner />
      {/* key 使用分区名：切换分区时表单从当前设置重新初始化 */}
      {section === "service" ? <ServiceSection key={section} data={data} /> : null}
      {section === "accounts" ? <AccountsSection key={section} data={data} /> : null}
      {section === "network" ? <NetworkSection key={section} data={data} /> : null}
      {section === "features" ? <FeaturesSection key={section} data={data} /> : null}
      {section === "data" ? <DataSection data={data} /> : null}
      {section === "about" ? <AboutSection data={data} /> : null}
    </section>
  )
}
