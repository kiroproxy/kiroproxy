import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { strings } from "@/lib/strings"

/**
 * 无账号时的首次引导卡。
 * 完整的 KAM 导入 / 手动添加对话框在 Task 2.6/2.7 接入，这里先提供入口。
 */
export function OnboardingCard() {
  return (
    <Card className="relative min-h-[136px] justify-center gap-3 overflow-hidden rounded-[22px] border-dashed p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-serif text-[22px] leading-tight font-semibold">
            {strings.onboarding.title}
          </h2>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">{strings.onboarding.proxyHint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button nativeButton={false} render={<Link to="/accounts" />}>
            {strings.onboarding.importKam}
          </Button>
          <Button nativeButton={false} variant="secondary" render={<Link to="/accounts" />}>
            {strings.onboarding.manualAdd}
          </Button>
        </div>
      </div>
      <Link
        to="/connect"
        className="w-fit text-[12px] font-medium text-primary hover:underline"
      >
        {strings.onboarding.viewConnect}
      </Link>
    </Card>
  )
}
