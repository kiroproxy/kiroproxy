import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { accountName } from "@/lib/account-status"
import { useSetPriority, useUpdateAccount } from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { CredentialStatusItem, UpdateCredentialRequest } from "@/lib/types"

interface FormState {
  nickname: string
  email: string
  priority: string
  authMethod: string
  authRegion: string
  apiRegion: string
  profileArn: string
  proxyUrl: string
  thinkingAdaptive: boolean
  refreshToken: string
}

function initialState(item: CredentialStatusItem): FormState {
  return {
    nickname: item.nickname ?? "",
    email: item.email ?? "",
    priority: String(item.priority),
    authMethod: item.authMethod ?? "social",
    authRegion: item.authRegion ?? "",
    apiRegion: item.apiRegion ?? "",
    profileArn: "",
    proxyUrl: item.proxyUrl ?? "",
    thinkingAdaptive: item.thinkingAdaptive,
    refreshToken: "",
  }
}

/**
 * 只提交改动过的字段。后端约定：字段缺省表示不修改，空字符串表示清除，
 * 所以清空输入框会把该字段删掉，而不是被忽略。
 */
function buildPatch(item: CredentialStatusItem, form: FormState): UpdateCredentialRequest {
  const initial = initialState(item)
  const patch: UpdateCredentialRequest = {}
  const text = (key: "nickname" | "email" | "authRegion" | "apiRegion" | "proxyUrl") => {
    const value = form[key].trim()
    if (value !== initial[key]) patch[key] = value
  }
  text("nickname")
  text("email")
  text("authRegion")
  text("apiRegion")
  text("proxyUrl")
  if (form.authMethod !== initial.authMethod) patch.authMethod = form.authMethod
  // Profile ARN 不回显明文：填写即替换，留空不修改。
  if (form.profileArn.trim()) patch.profileArn = form.profileArn.trim()
  if (form.thinkingAdaptive !== initial.thinkingAdaptive) patch.thinkingAdaptive = form.thinkingAdaptive
  if (form.refreshToken.trim()) patch.refreshToken = form.refreshToken.trim()
  return patch
}

interface EditAccountDialogProps {
  item: CredentialStatusItem
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 每次打开都重新挂载表单，从账号当前值初始化。 */
export function EditAccountDialog(props: EditAccountDialogProps) {
  return props.open ? <EditAccountForm {...props} /> : null
}

function EditAccountForm({ item, open, onOpenChange }: EditAccountDialogProps) {
  const update = useUpdateAccount()
  const setPriority = useSetPriority()
  const [form, setForm] = useState<FormState>(() => initialState(item))

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    const req = buildPatch(item, form)
    // 优先级不在 update_account 的字段里，单独走 set_account_priority。
    const priority = Number.parseInt(form.priority, 10)
    const priorityChanged = Number.isInteger(priority) && priority >= 0 && priority !== item.priority
    try {
      if (Object.keys(req).length > 0) await update.mutateAsync({ id: item.id, req })
      if (priorityChanged) await setPriority.mutateAsync({ id: item.id, priority })
      if (Object.keys(req).length > 0 || priorityChanged) toast.success(strings.accounts.saved)
      onOpenChange(false)
    } catch {
      // 错误已由全局 MutationCache 提示，保持对话框打开以便修改。
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{strings.accounts.edit}</DialogTitle>
          <DialogDescription>
            {accountName(item)} · {strings.accounts.clearFieldHint}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <FormField label={strings.accounts.nickname}>
            <Input value={form.nickname} onChange={(e) => set("nickname", e.target.value)} />
          </FormField>
          <FormField label={strings.accounts.email}>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </FormField>
          <FormField label={strings.accounts.priorityLabel}>
            <Input
              type="number"
              min={0}
              step={1}
              value={form.priority}
              onChange={(e) => set("priority", e.target.value)}
            />
          </FormField>
          <FormField label={strings.accounts.authMethod}>
            <Select value={form.authMethod} onValueChange={(value) => set("authMethod", String(value))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="social">social</SelectItem>
                <SelectItem value="idc">idc</SelectItem>
                <SelectItem value="external_idp">external_idp</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={strings.accounts.authRegion}>
            <Input
              value={form.authRegion}
              placeholder="us-east-1"
              onChange={(e) => set("authRegion", e.target.value)}
            />
          </FormField>
          <FormField label={strings.accounts.apiRegion}>
            <Input
              value={form.apiRegion}
              placeholder="us-east-1"
              onChange={(e) => set("apiRegion", e.target.value)}
            />
          </FormField>
          <FormField label={strings.accounts.profileArn}>
            <Input
              value={form.profileArn}
              placeholder={item.hasProfileArn ? strings.common.configured : "arn:aws:codewhisperer:..."}
              onChange={(e) => set("profileArn", e.target.value)}
            />
          </FormField>
          <FormField label={strings.accounts.proxy}>
            <Input
              value={form.proxyUrl}
              placeholder={strings.accounts.proxyPlaceholder}
              onChange={(e) => set("proxyUrl", e.target.value)}
            />
          </FormField>
          <FormField label={strings.accounts.refreshTokenOptional} className="md:col-span-2">
            <Input
              type="password"
              autoComplete="off"
              value={form.refreshToken}
              placeholder={strings.accounts.refreshTokenPlaceholder}
              onChange={(e) => set("refreshToken", e.target.value)}
            />
          </FormField>
          <label className="flex items-center justify-between rounded-[10px] bg-subtle px-3 py-2 md:col-span-2">
            <span className="text-[12.5px] font-semibold">{strings.accounts.thinkingAdaptive}</span>
            <Switch
              checked={form.thinkingAdaptive}
              onCheckedChange={(checked) => set("thinkingAdaptive", checked)}
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {strings.common.cancel}
          </Button>
          <Button onClick={() => void handleSave()} disabled={update.isPending || setPriority.isPending}>
            {strings.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
