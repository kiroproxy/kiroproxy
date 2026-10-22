import { useEffect, useRef } from "react"
import { ArrowUpDownIcon, ListChecksIcon, SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { accountStatusFilters, type AccountStatusFilter } from "@/lib/account-status"
import { strings } from "@/lib/strings"

export type AccountSort = "account" | "remaining" | "priority"

const filterLabels: Record<AccountStatusFilter, string> = {
  all: strings.accounts.filterAll,
  available: strings.accounts.filterAvailable,
  lowQuota: strings.accounts.filterLow,
  unstable: strings.accounts.filterUnstable,
  suspended: strings.accounts.filterSuspended,
  exhausted: strings.accounts.filterExhausted,
  needsLogin: strings.accounts.filterNeedsLogin,
  needsProfileArn: strings.accounts.filterNeedsProfileArn,
  disabled: strings.accounts.filterDisabled,
}

const sortOptions: { value: AccountSort; label: string }[] = [
  { value: "priority", label: strings.accounts.sortByPriority },
  { value: "remaining", label: strings.accounts.sortByRemaining },
  { value: "account", label: strings.accounts.sortByAccount },
]

const sortLabel = (sort: AccountSort) =>
  sortOptions.find((option) => option.value === sort)?.label ?? strings.accounts.sort

export interface AccountToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  statusFilter: AccountStatusFilter
  onStatusFilterChange: (value: AccountStatusFilter) => void
  /** 每个筛选项的数量；为 0 的项（除全部外）不显示。 */
  counts: Record<AccountStatusFilter, number>
  sort: AccountSort
  onSortChange: (value: AccountSort) => void
  selectedCount: number
  onVerify: () => void
  onRestore: () => void
  onDelete: () => void
}

export function AccountToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  counts,
  sort,
  onSortChange,
  selectedCount,
  onVerify,
  onRestore,
  onDelete,
}: AccountToolbarProps) {
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const visibleFilters = accountStatusFilters.filter(
    (filter) => filter === "all" || filter === statusFilter || counts[filter] > 0,
  )

  return (
    <div className="flex flex-wrap items-center gap-2 pb-3">
      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint"
          aria-hidden="true"
        />
        <Input
          ref={searchRef}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={strings.accounts.searchPlaceholder}
          aria-label={strings.common.search}
          className="w-52 rounded-full pr-10 pl-8"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[10.5px] text-faint">
          ⌘K
        </kbd>
      </div>

      <ToggleGroup
        variant="filter"
        value={[statusFilter]}
        onValueChange={(next) => {
          if (next[0]) onStatusFilterChange(next[0] as AccountStatusFilter)
        }}
        aria-label={strings.accounts.filterLabel}
      >
        {visibleFilters.map((filter) => (
          <ToggleGroupItem key={filter} value={filter}>
            {filterLabels[filter]}
            <span className="num text-[11px] text-muted-foreground">{counts[filter]}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {selectedCount > 0 ? (
          <span className="num text-[12px] text-muted-foreground">
            {strings.accounts.selected(selectedCount)}
          </span>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="secondary"
                size="sm"
                aria-label={`${strings.accounts.sort}：${sortLabel(sort)}`}
              />
            }
          >
            <ArrowUpDownIcon />
            {sortLabel(sort)}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(value) => onSortChange(value as AccountSort)}
            >
              {sortOptions.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="secondary"
                size="sm"
                disabled={selectedCount === 0}
                aria-label={strings.accounts.batchActions}
              />
            }
          >
            <ListChecksIcon />
            {strings.accounts.batchActions}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onVerify}>{strings.accounts.batchVerify}</DropdownMenuItem>
            <DropdownMenuItem onClick={onRestore}>{strings.accounts.batchRestore}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              {strings.accounts.batchDelete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
