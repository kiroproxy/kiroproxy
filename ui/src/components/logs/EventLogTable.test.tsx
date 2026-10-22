import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EventLogTable } from "./EventLogTable"

const body = '{"message":"Too many requests","reason":"RATE_LIMITED","retryAfter":30}'

vi.mock("@/lib/queries", () => {
  const page = (records: unknown[]) => ({
    data: { records, total: records.length, page: 1, pageSize: 50, totalPages: 1 },
    isLoading: false,
    isError: false,
  })
  return {
    useAccounts: () => ({ data: { total: 1, available: 1, currentId: 1, credentials: [] } }),
    useThrottleLogs: () =>
      page([
        {
          credentialId: 1,
          createdAt: "2026-10-22T10:00:00Z",
          statusCode: 429,
          responseBody: body,
          endpoint: "/generateAssistantResponse",
          requestType: "chat",
        },
      ]),
    useFailureLogs: () => page([]),
  }
})

it("expands the full response body and copies it", async () => {
  const user = userEvent.setup()
  render(<EventLogTable kind="throttle" credentialId={1} />)

  const toggle = screen.getByRole("button", { name: body })
  expect(toggle).toHaveAttribute("aria-expanded", "false")
  await user.click(toggle)
  expect(toggle).toHaveAttribute("aria-expanded", "true")

  const detail = screen.getByText(body, { selector: "pre" }).closest("tr") as HTMLElement
  await user.click(within(detail).getByRole("button", { name: "复制" }))
  expect(await navigator.clipboard.readText()).toBe(body)
})
