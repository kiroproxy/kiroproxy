/// <reference types="node" />
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { cwd } from "node:process"
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const paperCss = readFileSync(resolve(cwd(), "src/styles/paper.css"), "utf8")

const requiredTokens = ["--background", "--panel", "--card", "--subtle", "--primary", "--quota"]

describe("Paper theme", () => {
  it("defines the required light and dark tokens", () => {
    for (const token of requiredTokens) {
      expect(paperCss).toContain(`${token}:`)
    }
    expect(paperCss).toContain(".dark {")
    expect(paperCss).toContain('@import "tailwindcss"')
  })

  it("imports the shadcn variants and animations the ui components depend on", () => {
    // 缺少这两行时 data-horizontal: 等变体与 animate-in 动画全部失效。
    expect(paperCss).toContain('@import "tw-animate-css"')
    expect(paperCss).toContain('@import "shadcn/tailwind.css"')
    expect(paperCss).toContain("prefers-reduced-motion: reduce")
  })

  it("uses Source Serif 4 for titles and tabular numerals", () => {
    expect(paperCss).toContain('"Source Serif 4"')
    expect(paperCss).toContain("font-variant-numeric: tabular-nums")
  })
})

describe("shadcn Base UI components", () => {
  it("renders a Button with the Paper capsule shape and a visible keyboard focus", () => {
    render(<Button variant="danger">删除</Button>)
    const button = screen.getByRole("button", { name: "删除" })
    expect(button.className).toContain("rounded-full")
    expect(button.className).toContain("text-text-danger")
    expect(button.className).toContain("focus-visible:ring-1")
  })

  it("renders semantic Badge variants", () => {
    render(<Badge variant="success">正常</Badge>)
    expect(screen.getByText("正常").className).toContain("bg-success-soft")
  })
})
