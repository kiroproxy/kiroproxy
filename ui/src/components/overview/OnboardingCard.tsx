import { Link } from "react-router-dom"
import { ArrowRightIcon, SparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { strings } from "@/lib/strings"

const steps = [
  { title: "导出 KAM 账号", detail: "在 Kiro Account Manager 中导出 JSON" },
  { title: "导入本应用", detail: "粘贴 JSON，或手动填写 refreshToken" },
  { title: "配置代理", detail: "国内网络需填写上游 HTTP/SOCKS5 代理" },
]

export function OnboardingCard() {
  return (
    <Card className="relative gap-4 overflow-hidden rounded-[22px] border-dashed p-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 size-52 rounded-full bg-[radial-gradient(circle_at_30%_20%,var(--orb-start),var(--orb-end))] opacity-10 blur-2xl"
      />
      <div className="relative flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.08em] text-faint">
        <SparklesIcon className="size-3.5" />
        快速开始
      </div>
      <div className="relative">
        <h2 className="font-serif text-[21px] leading-tight font-semibold">
          {strings.onboarding.title}
        </h2>
        <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
          {strings.onboarding.proxyHint}
        </p>
      </div>

      <ol className="relative flex flex-col gap-2.5">
        {steps.map((step, index) => (
          <li key={step.title} className="flex items-start gap-2.5">
            <span className="num mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-quota-soft text-[10.5px] font-bold text-text-quota">
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold">{step.title}</div>
              <div className="text-[11px] leading-4 text-muted-foreground">{step.detail}</div>
            </div>
          </li>
        ))}
      </ol>

      <div className="relative flex flex-wrap items-center gap-2">
        <Button nativeButton={false} render={<Link to="/accounts" />}>
          {strings.onboarding.importKam}
        </Button>
        <Button nativeButton={false} variant="secondary" render={<Link to="/accounts" />}>
          {strings.onboarding.manualAdd}
        </Button>
      </div>
      <Link
        to="/connect"
        className="relative inline-flex w-fit items-center gap-1 text-[12px] font-medium text-primary hover:underline"
      >
        {strings.onboarding.viewConnect}
        <ArrowRightIcon className="size-3" />
      </Link>
    </Card>
  )
}
