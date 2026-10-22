import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { OnboardingCard } from "./OnboardingCard"

it("leads new users to browser login and Kiro IDE import", () => {
  render(
    <MemoryRouter>
      <OnboardingCard />
    </MemoryRouter>,
  )
  // Base UI 的 Button 渲染成链接时带 role="button"，按文字找到所在的 <a>。
  expect(screen.getByText("浏览器登录").closest("a")).toHaveAttribute("href", "/accounts?add=oauth")
  expect(screen.getByText("从 Kiro IDE 导入").closest("a")).toHaveAttribute("href", "/accounts?add=kiroide")
  expect(screen.getByText(/用浏览器登录 Kiro/)).toBeInTheDocument()
})
