import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { GitBranchIcon, GlobeIcon, Loader2Icon, LogInIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage, ipc } from "@/lib/ipc"
import { queryKeys, useCreateAccount, useImportKam, useImportKiroIde } from "@/lib/queries"
import { strings } from "@/lib/strings"
import { fmtDateTime } from "@/lib/format"
import type { AddCredentialRequest, KamPreview, KiroIdePreview, OauthStatus } from "@/lib/types"

export type AddAccountTab = "oauth" | "kam" | "manual" | "kiroide"

/** 浏览器登录页签：Kiro 官方 CLI 同款的 device code flow（打开浏览器授权 → 自动建号） */
function BrowserLoginForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<OauthStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const handledSuccess = useRef(false)

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    void ipc
      .getOauthStatus()
      .then((initial) => {
        if (!disposed && initial) setStatus(initial)
      })
      .catch(() => {
        // 没有进行中的登录时保持空状态
      })
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<OauthStatus>("oauth://status", (event) => setStatus(event.payload)),
      )
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      .catch(() => undefined)
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    if (status?.phase !== "success" || handledSuccess.current) return
    handledSuccess.current = true
    void queryClient.invalidateQueries({ queryKey: queryKeys.accounts })
    toast.success(status.message ?? strings.accounts.oauth.success)
    doneRef.current()
  }, [queryClient, status?.phase, status?.message])

  const start = async (provider: "google" | "github") => {
    setBusy(true)
    try {
      setStatus(await ipc.startBrowserLogin(provider))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    try {
      setStatus(await ipc.cancelBrowserLogin())
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const reopen = async () => {
    try {
      await ipc.reopenLoginPage()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const pending = status?.phase === "waiting" || status?.phase === "verifying"
  const failed = status?.phase === "failed"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <p className="text-[12px] leading-5 text-muted-foreground">
          {strings.accounts.oauth.hint}
        </p>
      </div>

      {pending ? (
        <div className="flex flex-col gap-3 rounded-[12px] border border-border bg-subtle/40 p-4">
          <div className="flex items-center gap-2 text-[12.5px] font-medium">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            {status?.phase === "verifying" ? strings.accounts.oauth.verifying : strings.accounts.oauth.waiting}
          </div>
          {status?.userCode ? (
            <code className="w-fit rounded-[8px] bg-card px-2 py-1 font-mono text-[12px]">
              {strings.accounts.oauth.userCode(status.userCode)}
            </code>
          ) : null}
          {status?.verificationUrl ? (
            <p className="truncate font-mono text-[11px] text-muted-foreground" title={status.verificationUrl}>
              {status.verificationUrl}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void reopen()}>
              {strings.accounts.oauth.reopen}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void cancel()}>
              {strings.accounts.oauth.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {failed ? (
            <p className="rounded-[10px] bg-danger-soft p-3 text-[12px] leading-5 text-text-danger">
              {status?.message ?? strings.accounts.oauth.retry}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => void start("google")}
              disabled={busy}
            >
              <GlobeIcon />
              {strings.accounts.oauth.google}
            </Button>
            <Button variant="secondary" onClick={() => void start("github")} disabled={busy}>
              <GitBranchIcon />
              {strings.accounts.oauth.github}
            </Button>
            {failed ? (
              <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                <LogInIcon className="size-3.5" aria-hidden="true" />
                {strings.accounts.oauth.retry}
              </span>
            ) : null}
          </div>
        </div>
      )}
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
      toast.error(strings.accounts.refreshTokenRequired)
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
      priority: Math.max(0, Number.parseInt(priority, 10) || 0),
    }
    create.mutate(req, {
      onSuccess: () => {
        toast.success(strings.accounts.added)
        onDone()
      },
    })
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2">
        <FormField label={strings.accounts.manual.refreshToken}>
          <Textarea
            value={refreshToken}
            rows={2}
            autoComplete="off"
            placeholder={strings.accounts.refreshTokenPaste}
            onChange={(e) => setRefreshToken(e.target.value)}
          />
        </FormField>
      </div>
      <FormField label={strings.accounts.manual.authMethod}>
        <Select value={authMethod} onValueChange={(value) => setAuthMethod(String(value))}>
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
      <FormField label={strings.accounts.manual.provider}>
        <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Google / GitHub" />
      </FormField>
      <FormField label={strings.accounts.manual.clientId}>
        <Input value={clientId} onChange={(e) => setClientId(e.target.value)} />
      </FormField>
      <FormField label={strings.accounts.manual.clientSecret}>
        <Input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
        />
      </FormField>
      <FormField label={strings.accounts.manual.authRegion}>
        <Input value={authRegion} onChange={(e) => setAuthRegion(e.target.value)} placeholder="us-east-1" />
      </FormField>
      <FormField label={strings.accounts.manual.apiRegion}>
        <Input value={apiRegion} onChange={(e) => setApiRegion(e.target.value)} placeholder="us-east-1" />
      </FormField>
      <FormField label={strings.accounts.manual.profileArn}>
        <Input value={profileArn} onChange={(e) => setProfileArn(e.target.value)} />
      </FormField>
      <FormField label={strings.accounts.manual.proxyUrl}>
        <Input value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)} placeholder="http://127.0.0.1:7890" />
      </FormField>
      <FormField label={strings.accounts.manual.priority}>
        <Input type="number" min={0} value={priority} onChange={(e) => setPriority(e.target.value)} />
      </FormField>
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
      toast.error(errorMessage(error))
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
            strings.accounts.importSummary(result.imported, result.duplicate, result.failed, result.invalid),
          )
          onDone()
        },
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
          aria-label={strings.accounts.kamTab}
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
            {strings.accounts.chooseFile}
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
                <TableHead>{strings.accounts.previewEmail}</TableHead>
                <TableHead>{strings.accounts.previewNickname}</TableHead>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="truncate font-medium" title={value}>
        {value}
      </span>
    </div>
  )
}

function KiroIdeForm({ onDone }: { onDone: () => void }) {
  const importIde = useImportKiroIde()
  const [preview, setPreview] = useState<KiroIdePreview | null | undefined>(undefined)
  const [scanning, setScanning] = useState(false)

  const scan = async () => {
    setScanning(true)
    try {
      setPreview(await ipc.scanKiroIde())
    } catch (error) {
      toast.error(errorMessage(error))
      setPreview(null)
    } finally {
      setScanning(false)
    }
  }

  // 打开页签时自动扫描一次本机 Kiro IDE 登录缓存（外部系统同步，异步完成后才写状态）。
  useEffect(() => {
    let cancelled = false
    ipc
      .scanKiroIde()
      .then((result) => {
        if (!cancelled) setPreview(result)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        toast.error(errorMessage(error))
        setPreview(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const busy = scanning || importIde.isPending
  const importAccount = () =>
    importIde.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(
          strings.accounts.importSummary(result.imported, result.duplicate, result.failed, result.invalid),
        )
        onDone()
      },
    })

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] leading-5 text-muted-foreground">
        {strings.accounts.kiroIdeHint}
      </p>

      {preview === undefined ? (
        <div className="rounded-[12px] border border-border bg-subtle/40 p-6 text-center text-[12.5px] text-muted-foreground">
          {strings.common.loading}
        </div>
      ) : null}

      {preview === null ? (
        <div className="flex flex-col items-center gap-2 rounded-[12px] border border-dashed border-border-strong bg-subtle/40 p-6 text-center">
          <span className="text-[12.5px] text-muted-foreground">{strings.accounts.kiroIdeNotFound}</span>
          <Button variant="secondary" size="sm" onClick={() => void scan()} disabled={busy}>
            {strings.accounts.kiroIdeScan}
          </Button>
        </div>
      ) : null}

      {preview ? (
        <div className="flex flex-col gap-3 rounded-[12px] border border-border bg-subtle/40 p-4">
          <div className="flex items-center gap-2">
            <Badge variant="success">{strings.accounts.kiroIdeFound}</Badge>
            <span className="truncate font-mono text-[11px] text-muted-foreground">{preview.path}</span>
          </div>
          <div className="grid gap-2 text-[12px] md:grid-cols-2">
            <Info label="Provider" value={preview.provider ?? "—"} />
            <Info label="Auth" value={preview.authMethod ?? "social"} />
            <Info label="Profile ARN" value={preview.profileArn ?? "—"} />
            <Info label={strings.accounts.expiresAt} value={fmtDateTime(preview.expiresAt)} />
            <Info label="Refresh Token" value={preview.maskedRefreshToken} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => void scan()} disabled={busy}>
              {strings.accounts.kiroIdeRescan}
            </Button>
            <Button size="sm" onClick={importAccount} disabled={busy}>
              {strings.accounts.kiroIdeImport}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function AddAccountDialog({
  open,
  tab = "oauth",
  onOpenChange,
}: {
  open: boolean
  tab?: AddAccountTab
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
        <Tabs key={tab} defaultValue={tab} className="gap-3">
          <TabsList>
            <TabsTrigger value="oauth">{strings.accounts.oauthTab}</TabsTrigger>
            <TabsTrigger value="kam">{strings.accounts.kamTab}</TabsTrigger>
            <TabsTrigger value="manual">{strings.accounts.manualTab}</TabsTrigger>
            <TabsTrigger value="kiroide">{strings.accounts.kiroIdeTab}</TabsTrigger>
          </TabsList>
          <TabsContent value="oauth">
            <BrowserLoginForm onDone={done} />
          </TabsContent>
          <TabsContent value="kam">
            <KamForm onDone={done} />
          </TabsContent>
          <TabsContent value="manual">
            <ManualForm onDone={done} />
          </TabsContent>
          <TabsContent value="kiroide">
            <KiroIdeForm onDone={done} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
