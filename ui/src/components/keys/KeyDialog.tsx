import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAccounts, useCreateApiKey, useUpdateApiKey } from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { ApiKeyView, CreateApiKeyRequest } from "@/lib/types"

/**
 * 新建 / 编辑密钥。表单状态只在挂载时从 editing 初始化；调用方每次打开都应换一个 key，
 * 否则会带出上一次的输入。
 */
export function KeyDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: ApiKeyView | null
}) {
  const accounts = useAccounts()
  const create = useCreateApiKey()
  const update = useUpdateApiKey()
  const [name, setName] = useState(editing?.name ?? "")
  const [limitUnit, setLimitUnit] = useState<"usd" | "credits">(editing?.limitUnit ?? "usd")
  const [spendingLimit, setSpendingLimit] = useState(
    editing?.spendingLimit != null ? String(editing.spendingLimit) : "",
  )
  const [durationDays, setDurationDays] = useState(
    editing?.durationDays != null ? String(editing.durationDays) : "",
  )
  const [enabled, setEnabled] = useState(editing?.enabled ?? true)
  const [bound, setBound] = useState<number[]>(editing?.boundCredentialIds ?? [])
  const [submitted, setSubmitted] = useState(false)

  // 格式错误边输入边提示；「名称必填」等用户点过保存再提示，不在刚打开时就报错。
  const limitValue = spendingLimit.trim() ? Number(spendingLimit) : null
  const durationValue = durationDays.trim() ? Number(durationDays) : null
  const nameError = submitted && !name.trim() ? strings.keys.nameRequired : null
  const limitError =
    limitValue !== null && !(Number.isFinite(limitValue) && limitValue >= 0) ? strings.keys.invalidLimit : null
  const durationError =
    durationValue !== null && !(Number.isInteger(durationValue) && durationValue >= 0)
      ? strings.keys.invalidDuration
      : null

  const save = () => {
    setSubmitted(true)
    if (!name.trim() || limitError || durationError) return
    const base: CreateApiKeyRequest = {
      name: name.trim(),
      limitUnit,
      spendingLimit: limitValue,
      durationDays: durationValue,
      boundCredentialIds: bound.length > 0 ? bound : null,
    }
    if (editing) {
      update.mutate(
        { id: editing.id, req: { ...base, enabled } },
        {
          onSuccess: () => {
            toast.success(strings.settings.saveStatusSaved)
            onOpenChange(false)
          },
        },
      )
    } else {
      create.mutate(base, {
        onSuccess: () => {
          toast.success(strings.keys.created)
          onOpenChange(false)
        },
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{editing ? strings.keys.editTitle : strings.keys.createTitle}</DialogTitle>
          <DialogDescription>{strings.keys.subtitle}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <FormField label={strings.keys.name} error={nameError}>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={strings.keys.limitUnit}>
              <Select
                value={limitUnit}
                onValueChange={(value) => setLimitUnit(String(value) as "usd" | "credits")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usd">USD</SelectItem>
                  <SelectItem value="credits">Credits</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={strings.keys.spendingLimit} error={limitError}>
              <Input
                type="number"
                min={0}
                placeholder={strings.keys.noLimit}
                value={spendingLimit}
                onChange={(event) => setSpendingLimit(event.target.value)}
              />
            </FormField>
          </div>
          <FormField label={strings.keys.durationDays} hint={strings.keys.durationHint} error={durationError}>
            <Input
              type="number"
              min={0}
              step={1}
              placeholder={strings.keys.durationPlaceholder}
              value={durationDays}
              onChange={(event) => setDurationDays(event.target.value)}
            />
          </FormField>

          <fieldset>
            <legend className="mb-1.5 text-[12px] font-medium text-muted-foreground">
              {strings.keys.boundAccounts}
            </legend>
            <div className="max-h-36 overflow-y-auto rounded-[10px] border border-border bg-subtle p-2">
              {(accounts.data?.credentials ?? []).length === 0 ? (
                <span className="text-[12px] text-muted-foreground">{strings.accounts.empty}</span>
              ) : null}
              {(accounts.data?.credentials ?? []).map((account) => (
                <label key={account.id} className="flex items-center gap-2 py-0.5 text-[12px]">
                  <Checkbox
                    checked={bound.includes(account.id)}
                    onCheckedChange={(checked) =>
                      setBound((prev) =>
                        checked
                          ? Array.from(new Set([...prev, account.id]))
                          : prev.filter((id) => id !== account.id),
                      )
                    }
                  />
                  <span className="truncate">
                    #{account.id} {account.nickname || account.email || ""}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {editing ? (
            <label className="flex items-center gap-2 text-[12.5px]">
              <Checkbox checked={enabled} onCheckedChange={(value) => setEnabled(Boolean(value))} />
              {strings.keys.enabled}
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {strings.common.cancel}
          </Button>
          <Button onClick={save} disabled={create.isPending || update.isPending}>
            {strings.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
