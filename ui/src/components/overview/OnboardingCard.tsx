import { Link } from "react-router-dom"
import { ArrowRightIcon, SparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { strings } from "@/lib/strings"

export function OnboardingCard() {
  return (
    <Card className="relative gap-4 overflow-hidden rounded-[22px] border-dashed p-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -right-16 size-52 rounded-full bg-[radial-gradient(circle_at_30%_20%,var(--orb-start),var(--orb-end))] opacity-10 blur-2xl"
      />
      <div className="relative flex items-center gap-2 text-[11.5px] font-semibold text-muted-foreground">
        <SparklesIcon className="size-3.5" aria-hidden="true" />
        {strings.onboarding.quickStart}
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
        {strings.onboarding.steps.map((step, index) => (
          <li key={step.title} className="flex items-start gap-2.5">
            <span className="num mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-quota-soft text-[11px] font-bold text-text-quota">
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold">{step.title}</div>
              <div className="text-[11.5px] leading-4 text-muted-foreground">{step.detail}</div>
            </div>
          </li>
        ))}
      </ol>

      <div className="relative flex flex-wrap items-center gap-2">
        {/* 浏览器登录不需要手动粘贴 refreshToken，作为首选；其他方式在添加对话框的页签里 */}
        <Button nativeButton={false} render={<Link to="/accounts?add=oauth" />}>
          {strings.onboarding.browserLogin}
        </Button>
        <Button nativeButton={false} variant="secondary" render={<Link to="/accounts?add=kiroide" />}>
          {strings.onboarding.importKiroIde}
        </Button>
      </div>
      <Link
        to="/connect"
        className="relative inline-flex w-fit items-center gap-1 text-[12px] font-medium text-primary hover:underline"
      >
        {strings.onboarding.viewConnect}
        <ArrowRightIcon className="size-3" aria-hidden="true" />
      </Link>
    </Card>
  )
}
