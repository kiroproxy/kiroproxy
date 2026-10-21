import { beforeEach, describe, expect, it, vi } from "vitest"
import { call, ipc } from "./ipc"

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))

describe("ipc", () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it("returns the invoke result", async () => {
    const status = { running: true, host: "127.0.0.1", port: 5678, baseUrl: "http://127.0.0.1:5678" }
    invokeMock.mockResolvedValue(status)
    await expect(ipc.getServerStatus()).resolves.toEqual(status)
    expect(invokeMock).toHaveBeenCalledWith("get_server_status", undefined)
  })

  it("passes camelCase arguments", async () => {
    invokeMock.mockResolvedValue(undefined)
    await ipc.setAccountPriority(7, 3)
    expect(invokeMock).toHaveBeenCalledWith("set_account_priority", { id: 7, priority: 3 })
  })

  it("keeps structured errors", async () => {
    const error = { code: "not_found", message: "account not found" }
    invokeMock.mockRejectedValue(error)
    await expect(call("delete_account", { id: 1 })).rejects.toEqual(error)
  })

  it("wraps unknown errors as ipc_error", async () => {
    invokeMock.mockRejectedValue("boom")
    await expect(call("get_app_info")).rejects.toEqual({ code: "ipc_error", message: "boom" })
  })
})
