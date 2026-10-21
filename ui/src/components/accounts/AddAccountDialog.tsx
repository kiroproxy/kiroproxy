import { useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ipc } from "@/lib/ipc"
import { useCreateAccount, useImportKam } from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { AddCredentialRequest, KamPreview } from "@/lib/types"

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[12px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function ManualForm({ onDone }: { onDone: () => void }) {
  const create = useCreateAccount()
  const [refreshToken, setRefreshToken] = useState("")
  const [authMethod, setAuthMethod] = useState("social")
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [provider, setProvider] = useState("")
  const [profileArn, setProfileArn] = useState("")
  const [authRegion, setAuthRegion] = useState("")
  const [apiRegion, setApiRegion] = useState("")
  const [proxyUrl, setProxyUrl] = useState("")
  const [priority, setPriority] = useState("0")

  const submit = () => {
    if (!refreshToken.trim()) {
      toast.error("Refresh Token 不能为空")
      return
    }
    const req: AddCredentialRequest = {
      refreshToken: refreshToken.trim(),
      authMethod,
      clientId: clientId || undefined,
      clientSecret: clientSecret || undefined,
      provider: provider || undefined,
      profileArn: profileArn || undefined,
      authRegion: authRegion || undefined,
      apiRegion: apiRegion || undefined,
      proxyUrl: proxyUrl || undefined,
      priority: Number(priority) || 0,
    }
    create.mutate(req, {
      onSuccess: () => {
        toast.success("账号已添加")
        onDone()
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2">
        <Field label={strings.accounts.manual.refreshToken}>
          <Textarea
            value={refreshToken}
            rows={2}
            placeholder="粘贴 refreshToken"
            onChange={(e) => setRefreshToken(e.target.value)}
          />
        </Field>
      </div>
      <Field label={strings.accounts.manual.authMethod}>
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
      <Field label={strings.accounts.manual.provider}>
        <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Google / GitHub" />
      </Field>
      <Field label={strings.accounts.manual.clientId}>
        <Input value={clientId} onChange={(e) => setClientId(e.target.value)} />
      </Field>
      <Field label={strings.accounts.manual.clientSecret}>
        <Input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
        />
      </Field>
      <Field label={strings.accounts.manual.authRegion}>
        <Input value={authRegion} onChange={(e) => setAuthRegion(e.target.value)} placeholder="us-east-1" />
      </Field>
      <Field label={strings.accounts.manual.apiRegion}>
        <Input value={apiRegion} onChange={(e) => setApiRegion(e.target.value)} placeholder="us-east-1" />
      </Field>
      <Field label={strings.accounts.manual.profileArn}>
        <Input value={profileArn} onChange={(e) => setProfileArn(e.target.value)} />
      </Field>
      <Field label={strings.accounts.manual.proxyUrl}>
        <Input value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)} placeholder="http://127.0.0.1:7890" />
      </Field>
      <Field label={strings.accounts.manual.priority}>
        <Input type="number" min={0} value={priority} onChange={(e) => setPriority(e.target.value)} />
      </Field>
      <div className="flex justify-end md:col-span-2">
        <Button onClick={submit} disabled={create.isPending}>
          {strings.accounts.manual.submit}
        </Button>
      </div>
    </div>
  )
}

function KamForm({ onDone }: { onDone: () => void }) {
  const importKam = useImportKam()
  const fileRef = useRef<HTMLInputElement>(null)
  const [json, setJson] = useState("")
  const [preview, setPreview] = useState<KamPreview | null>(null)
  const [verify, setVerify] = useState(true)
  const [busy, setBusy] = useState(false)

  const readFile = async (file: File) => {
    const text = await file.text()
    setJson(text)
    setPreview(null)
  }

  const handlePreview = async () => {
    if (!json.trim()) return
    setBusy(true)
    try {
      setPreview(await ipc.previewKamImport(json))
    } catch (error) {
      toast.error((error as { message?: string }).message ?? strings.errors.actionFailed)
    } finally {
      setBusy(false)
    }
  }

  const handleImport = () => {
    if (!json.trim()) return
    importKam.mutate(
      { json, verify },
      {
        onSuccess: (result) => {
          toast.success(
            `导入 ${result.imported} 条，重复 ${result.duplicate}，失败 ${result.failed}，无效 ${result.invalid}`,
          )
          onDone()
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-[12px] border border-dashed border-border-strong bg-subtle/50 p-3"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          const file = event.dataTransfer.files[0]
          if (file) void readFile(file)
        }}
      >
        <Textarea
          value={json}
          rows={7}
          placeholder={strings.accounts.kam.hint}
          onChange={(event) => {
            setJson(event.target.value)
            setPreview(null)
          }}
          className="font-mono text-[11.5px]"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void readFile(file)
            }}
          />
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            选择文件
          </Button>
          <Button variant="secondary" size="sm" onClick={handlePreview} disabled={busy || !json.trim()}>
            {strings.accounts.kam.preview}
          </Button>
          <label className="ml-auto flex items-center gap-2 text-[12px] text-muted-foreground">
            <Checkbox checked={verify} onCheckedChange={(value) => setVerify(Boolean(value))} />
            {strings.accounts.kam.verifyAfterImport}
          </label>
        </div>
      </div>

      {preview ? (
        <div className="overflow-hidden rounded-[12px] border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>昵称</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Auth</TableHead>
                <TableHead>Token</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.accounts.map((account, index) => (
                <TableRow key={`${account.maskedToken}-${index}`}>
                  <TableCell>{account.email ?? "—"}</TableCell>
                  <TableCell>{account.nickname ?? "—"}</TableCell>
                  <TableCell>{account.provider ?? "—"}</TableCell>
                  <TableCell>{account.authMethod ?? "social"}</TableCell>
                  <TableCell className="font-mono text-[11px]">{account.maskedToken}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap gap-3 px-3 py-2 text-[11.5px] text-muted-foreground">
            <span>{strings.accounts.kam.total(preview.accounts.length)}</span>
            {preview.duplicatesInFile > 0 ? (
              <span className="text-text-warning">{strings.accounts.kam.duplicates(preview.duplicatesInFile)}</span>
            ) : null}
            {preview.invalid > 0 ? (
              <span className="text-text-danger">{strings.accounts.kam.invalid(preview.invalid)}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={handleImport} disabled={importKam.isPending || !json.trim()}>
          {strings.accounts.kam.import}
        </Button>
      </div>
    </div>
  )
}

export function AddAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const done = () => onOpenChange(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{strings.accounts.addTitle}</DialogTitle>
          <DialogDescription>{strings.accounts.emptyHint}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="kam" className="gap-3">
          <TabsList>
            <TabsTrigger value="kam">{strings.accounts.kamTab}</TabsTrigger>
            <TabsTrigger value="manual">{strings.accounts.manualTab}</TabsTrigger>
          </TabsList>
          <TabsContent value="kam">
            <KamForm onDone={done} />
          </TabsContent>
          <TabsContent value="manual">
            <ManualForm onDone={done} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
