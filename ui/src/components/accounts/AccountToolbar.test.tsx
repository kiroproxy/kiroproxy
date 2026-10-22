import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { AccountStatusFilter } from "@/lib/account-status"
import { AccountToolbar, type AccountSort } from "./AccountToolbar"

const counts: Record<AccountStatusFilter, number> = {
  all: 3,
  available: 2,
  lowQuota: 1,
  unstable: 0,
  exhausted: 0,
  needsLogin: 0,
  disabled: 0,
}

function Harness() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<AccountStatusFilter>("all")
  const [sort, setSort] = useState<AccountSort>("priority")
  return (
    <AccountToolbar
      search={search}
      onSearchChange={setSearch}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      counts={counts}
      sort={sort}
      onSortChange={setSort}
      selectedCount={0}
      onVerify={vi.fn()}
      onRestore={vi.fn()}
      onDelete={vi.fn()}
    />
  )
}

it("focuses search with cmd+k and changes the status filter", async () => {
  const user = userEvent.setup()
  render(<Harness />)

  await user.keyboard("{Meta>}k{/Meta}")
  expect(screen.getByRole("textbox", { name: "搜索" })).toHaveFocus()

  const lowQuota = screen.getByRole("button", { name: /将尽/ })
  await user.click(lowQuota)
  expect(lowQuota).toHaveAttribute("aria-pressed", "true")
})

it("hides empty status filters", () => {
  render(<Harness />)
  expect(screen.queryByRole("button", { name: /需登录/ })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: /全部/ })).toBeInTheDocument()
})

it("changes sort order from the dropdown", async () => {
  const user = userEvent.setup()
  render(<Harness />)

  await user.click(screen.getByRole("button", { name: /排序/ }))
  await user.click(await screen.findByRole("menuitemradio", { name: "按账号" }))

  expect(screen.getByRole("button", { name: "排序：按账号" })).toBeInTheDocument()
})

it("disables batch actions until something is selected", () => {
  render(<Harness />)
  expect(screen.getByRole("button", { name: "批量操作" })).toBeDisabled()
})
