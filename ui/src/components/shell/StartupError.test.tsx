import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { StartupError } from "./StartupError"

describe("StartupError", () => {
  it("shows the error code, message and retry action", () => {
    render(
      <StartupError
        error={{ code: "config_invalid", message: "config.json 无法解析" }}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText("config_invalid")).toBeInTheDocument()
    expect(screen.getByText("config.json 无法解析")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument()
  })
})
