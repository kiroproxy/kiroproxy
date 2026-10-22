import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import type { ServerStatus } from "@/lib/types"
import { StatusCard } from "./StatusCard"

function renderCard(status?: ServerStatus) {
  render(
    <MemoryRouter>
      <StatusCard status={status} available={1} total={1} />
    </MemoryRouter>,
  )
}

const server: ServerStatus = { running: true, host: "127.0.0.1", port: 5678, baseUrl: "http://127.0.0.1:5678" }

describe("StatusCard", () => {
  it("shows a loading state instead of claiming the proxy is stopped before the first status arrives", () => {
    renderCard(undefined)
    expect(screen.getByText("加载中…")).toBeInTheDocument()
    expect(screen.queryByText("代理未运行")).not.toBeInTheDocument()
  })

  it("keeps a running proxy as running when the last restart failed", () => {
    // 重启失败时旧服务继续运行，lastError 记录原因。
    renderCard({ ...server, lastError: "端口 5679 已被占用" })
    expect(screen.getByText("代理运行中")).toBeInTheDocument()
    expect(screen.getByText("端口 5679 已被占用")).toHaveClass("text-text-warning")
    expect(screen.queryByText("代理未运行")).not.toBeInTheDocument()
  })

  it("reports a stopped proxy with its error", () => {
    renderCard({ ...server, running: false, lastError: "监听失败" })
    expect(screen.getByText("代理未运行")).toBeInTheDocument()
    expect(screen.getByText("监听失败")).toHaveClass("text-text-danger")
  })

  it("lets a stopped proxy be started from the card", async () => {
    const onStart = vi.fn()
    render(
      <MemoryRouter>
        <StatusCard status={{ ...server, running: false }} available={1} total={1} onStart={onStart} />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole("button", { name: "启动代理" }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it("does not offer to start a proxy that is already running", () => {
    render(
      <MemoryRouter>
        <StatusCard status={server} available={1} total={1} onStart={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole("button", { name: "启动代理" })).not.toBeInTheDocument()
  })
})
