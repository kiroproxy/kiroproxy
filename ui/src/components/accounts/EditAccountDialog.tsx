import { useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useUpdateAccount } from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { CredentialStatusItem, UpdateCredentialRequest } from "@/lib/types"

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[12px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

export function EditAccountDialog({
  item,
  open,
  onOpenChange,
}: {
  item: CredentialStatusItem
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const update = useUpdateAccount()
  const [nickname, setNickname] = useState("")
  const [email, setEmail] = useState("")
  const [priority, setPriority] = useState("0")
  const [authMethod, setAuthMethod] = useState("social")
  const [authRegion, setAuthRegion] = useState("")
  const [apiRegion, setApiRegion] = useState("")
  const [profileArn, setProfileArn] = useState("")
  const [proxyUrl, setProxyUrl] = useState("")
  const [thinkingAdaptive, setThinkingAdaptive] = useState(true)
  const [refreshToken, setRefreshToken] = useState("")

  useEffect(() => {
    if (!open) return
    setNickname(item.nickname ?? "")
    setEmail(item.email ?? "")
    setPriority(String(item.priority))
    setAuthMethod(item.authMethod ?? "social")
    setAuthRegion(item.authRegion ?? "")
    setApiRegion(item.apiRegion ?? "")
    setProfileArn("")
    setProxyUrl(item.proxyUrl ?? "")
    setThinkingAdaptive(item.thinkingAdaptive)
    setRefreshToken("")
  }, [item, open])

  const handleSave = () => {
    const req: UpdateCredentialRequest = {
      nickname: nickname || undefined,
      email: email || undefined,
      priority: Number(priority) || 0,
      authMethod,
      authRegion: authRegion || undefined,
      apiRegion: apiRegion || undefined,
      profileArn: profileArn || undefined,
      proxyUrl: proxyUrl || undefined,
      thinkingAdaptive,
      ...(refreshToken.trim() ? { refreshToken: refreshToken.trim() } : {}),
    }
    update.mutate(
      { id: item.id, req },
      {
        onSuccess: () => {
          toast.success(strings.settings.saveStatusSaved)
          onOpenChange(false)
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{strings.accounts.edit}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="昵称">
            <Input value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={strings.accounts.priorityLabel}>
            <Input
              type="number"
              min={0}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </Field>
          <Field label={strings.accounts.authMethod}>
            <Select value={authMethod} onValueChange={(value) => setAuthMethod(String(value))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="social">social</SelectItem>
                <SelectItem value="idc">idc</SelectItem>
                <SelectItem value="external_idp">external_idp</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={strings.accounts.authRegion}>
            <Input value={authRegion} onChange={(e) => setAuthRegion(e.target.value)} />
          </Field>
          <Field label={strings.accounts.apiRegion}>
            <Input value={apiRegion} onChange={(e) => setApiRegion(e.target.value)} />
          </Field>
          <Field label={strings.accounts.profileArn}>
            <Input
              value={profileArn}
              placeholder="arn:aws:codewhisperer:..."
              onChange={(e) => setProfileArn(e.target.value)}
            />
          </Field>
          <Field label={strings.accounts.proxy}>
            <Input
              value={proxyUrl}
              placeholder="http://127.0.0.1:7890 / direct"
              onChange={(e) => setProxyUrl(e.target.value)}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Refresh Token（留空表示不修改）">
              <Input
                value={refreshToken}
                placeholder="仅在需要更换凭据时填写"
                onChange={(e) => setRefreshToken(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-[10px] bg-subtle px-3 py-2 md:col-span-2">
            <span className="text-[12.5px] font-semibold">{strings.accounts.thinkingAdaptive}</span>
            <Switch checked={thinkingAdaptive} onCheckedChange={setThinkingAdaptive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {strings.common.cancel}
          </Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {strings.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
