import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { AccountStatusFilter } from "@/lib/account-status"
import { AccountToolbar, type AccountSort } from "./AccountToolbar"

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
      sort={sort}
      onSortChange={setSort}
      selectedCount={0}
      onVerify={vi.fn()}
      onRestore={vi.fn()}
      onDelete={vi.fn()}
      onAdd={vi.fn()}
    />
  )
}

it("focuses search with cmd+k and changes the status filter", async () => {
  const user = userEvent.setup()
  render(<Harness />)

  await user.keyboard("{Meta>}k{/Meta}")
  expect(screen.getByRole("textbox", { name: "搜索" })).toHaveFocus()

  await user.click(screen.getByRole("tab", { name: "将尽" }))
  expect(screen.getByRole("tab", { name: "将尽" })).toHaveAttribute("aria-selected", "true")
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
