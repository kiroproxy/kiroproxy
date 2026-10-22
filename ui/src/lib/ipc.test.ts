import { beforeEach, describe, expect, it, vi } from "vitest"
import { call, errorMessage, ipc, IpcError } from "./ipc"

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

  it("asks the backend to bypass the balance cache only when forced", async () => {
    invokeMock.mockResolvedValue({})
    await ipc.getAccountBalance(3)
    await ipc.getAccountBalance(3, true)
    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_account_balance", { id: 3, force: false })
    expect(invokeMock).toHaveBeenNthCalledWith(2, "get_account_balance", { id: 3, force: true })
  })

  it("requests paged throttle logs", async () => {
    invokeMock.mockResolvedValue({ records: [], total: 0, page: 2, pageSize: 50, totalPages: 0 })
    await ipc.getThrottleLogs(undefined, 2, 50)
    expect(invokeMock).toHaveBeenCalledWith("get_throttle_logs", {
      credentialId: undefined,
      page: 2,
      pageSize: 50,
    })
  })

  it("keeps structured errors as IpcError instances", async () => {
    invokeMock.mockRejectedValue({ code: "not_found", message: "account not found" })
    const error = await call("delete_account", { id: 1 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IpcError)
    expect(error).toMatchObject({ code: "not_found", message: "account not found" })
    expect(errorMessage(error)).toBe("account not found")
  })

  it("wraps unknown errors as ipc_error", async () => {
    invokeMock.mockRejectedValue("boom")
    await expect(call("get_app_info")).rejects.toMatchObject({ code: "ipc_error", message: "boom" })
  })
})
