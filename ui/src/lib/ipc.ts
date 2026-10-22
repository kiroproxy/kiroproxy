import { invoke } from "@tauri-apps/api/core"
import { strings } from "./strings"
import type {
  AccountsResponse,
  AddCredentialRequest,
  AddCredentialResponse,
  ApiKeyView,
  AppInfo,
  ApplyResult,
  BalanceResponse,
  CreateApiKeyRequest,
  CredentialDaySummary,
  DailySummary,
  FailureLogPage,
  ImportOutcome,
  IpcErrorShape,
  KamPreview,
  KiroIdePreview,
  LogEntry,
  LogKind,
  ModelView,
  OauthStatus,
  RpmSnapshot,
  RuntimeConfigPatch,
  ServerStatus,
  SettingsView,
  TestConnectionRequest,
  TestConnectionResult,
  ThrottleLogPage,
  UpdateApiKeyRequest,
  UpdateCredentialRequest,
  UsageBreakdown,
  UsageFilter,
  UsageRecordsPage,
  UpdateStatus,
  UsageSummary,
  VerifyOutcome,
} from "./types"

/** Rust 命令返回的结构化错误；继承 Error 以便 TanStack Query 与 toast 直接使用 message。 */
export class IpcError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "IpcError"
    this.code = code
  }
}

export function errorMessage(error: unknown, fallback: string = strings.errors.actionFailed): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error) return error
  return fallback
}

export function hasTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (e) {
    if (typeof e === "object" && e && "code" in e && "message" in e) {
      const shape = e as IpcErrorShape
      throw new IpcError(String(shape.code), String(shape.message))
    }
    throw new IpcError("ipc_error", String(e))
  }
}

export const ipc = {
  // 应用与服务器
  getAppInfo: () => call<AppInfo>("get_app_info"),
  getStartupError: () => call<IpcErrorShape | null>("get_startup_error"),
  getServerStatus: () => call<ServerStatus>("get_server_status"),
  startProxyServer: () => call<ServerStatus>("start_proxy_server"),
  stopProxyServer: () => call<ServerStatus>("stop_proxy_server"),
  restartProxyServer: () => call<ServerStatus>("restart_proxy_server"),
  retryStartup: () => call<ServerStatus>("retry_startup"),
  openDataDir: () => call<void>("open_data_dir"),
  openFile: (kind: "config" | "credentials" | "log") => call<void>("open_file", { kind }),
  /** 在系统浏览器打开固定的外部链接（后端只认这几个）。 */
  openLink: (kind: "project" | "kiro2cc" | "kiro_rs") => call<void>("open_link", { kind }),
  clearLogs: () => call<void>("clear_logs"),
  quitApp: () => call<void>("quit_app"),

  // 账号
  listAccounts: () => call<AccountsResponse>("list_accounts"),
  addAccount: (req: AddCredentialRequest) => call<AddCredentialResponse>("add_account", { req }),
  updateAccount: (id: number, req: UpdateCredentialRequest) =>
    call<void>("update_account", { id, req }),
  deleteAccount: (id: number) => call<void>("delete_account", { id }),
  setAccountDisabled: (id: number, disabled: boolean) =>
    call<void>("set_account_disabled", { id, disabled }),
  setAccountPriority: (id: number, priority: number) =>
    call<void>("set_account_priority", { id, priority }),
  resetAccountFailure: (id: number) => call<void>("reset_account_failure", { id }),
  getAccountBalance: (id: number, force = false) =>
    call<BalanceResponse>("get_account_balance", { id, force }),
  previewKamImport: (json: string) => call<KamPreview>("preview_kam_import", { json }),
  importKamAccounts: (json: string, verify: boolean) =>
    call<ImportOutcome>("import_kam_accounts", { json, verify }),
  verifyAccounts: (ids: number[]) => call<VerifyOutcome>("verify_accounts", { ids }),
  cancelVerifyAccounts: () => call<void>("cancel_verify_accounts"),
  scanKiroIde: () => call<KiroIdePreview | null>("scan_kiro_ide"),
  importKiroIde: () => call<ImportOutcome>("import_kiro_ide"),
  getOauthStatus: () => call<OauthStatus>("get_oauth_status"),
  startBrowserLogin: () => call<OauthStatus>("start_browser_login"),
  cancelBrowserLogin: () => call<OauthStatus>("cancel_browser_login"),
  reopenLoginPage: () => call<void>("reopen_login_page"),

  // API Key
  listApiKeys: () => call<ApiKeyView[]>("list_api_keys"),
  getApiKeySecret: (id: number) => call<string>("get_api_key_secret", { id }),
  createApiKey: (req: CreateApiKeyRequest) => call<ApiKeyView>("create_api_key", { req }),
  updateApiKey: (id: number, req: UpdateApiKeyRequest) =>
    call<ApiKeyView>("update_api_key", { id, req }),
  deleteApiKey: (id: number) => call<void>("delete_api_key", { id }),
  getAllApiKeyUsage: () => call<UsageSummary[]>("get_all_api_key_usage"),
  getApiKeyUsage: (id: number) => call<UsageSummary>("get_api_key_usage", { id }),
  getApiKeyUsageRecords: (id: number, page: number, pageSize: number) =>
    call<UsageRecordsPage>("get_api_key_usage_records", { id, page, pageSize }),
  resetApiKeyUsage: (id: number) => call<void>("reset_api_key_usage", { id }),

  // 用量
  getDailyUsage: () => call<DailySummary[]>("get_daily_usage"),
  getDailyUsageRecords: (date: string, page: number, pageSize: number) =>
    call<UsageRecordsPage>("get_daily_usage_records", { date, page, pageSize }),
  getUsageRecords: (filter: UsageFilter) => call<UsageRecordsPage>("get_usage_records", { filter }),
  getUsageBreakdown: (from: string, to: string) =>
    call<UsageBreakdown>("get_usage_breakdown", { from, to }),
  getCredentialUsageRecords: (credentialId: number, page: number, pageSize: number) =>
    call<UsageRecordsPage>("get_credential_usage_records", { credentialId, page, pageSize }),
  getCredentialTodaySummary: (credentialId: number) =>
    call<CredentialDaySummary>("get_credential_today_summary", { credentialId }),
  getRpm: () => call<RpmSnapshot>("get_rpm"),

  // 日志
  getLogSnapshot: () => call<LogEntry[]>("get_log_snapshot"),
  getThrottleLogs: (credentialId: number | undefined, page: number, pageSize: number) =>
    call<ThrottleLogPage>("get_throttle_logs", { credentialId, page, pageSize }),
  getFailureLogs: (credentialId: number | undefined, page: number, pageSize: number) =>
    call<FailureLogPage>("get_failure_logs", { credentialId, page, pageSize }),
  /** 由 Rust 弹出保存对话框；返回保存路径，用户取消时为 null。 */
  exportLogs: (kind: LogKind) => call<string | null>("export_logs", { kind }),

  // 设置
  getSettings: () => call<SettingsView>("get_settings"),
  setLoadBalancingMode: (mode: "priority" | "balanced") =>
    call<ApplyResult>("set_load_balancing_mode", { mode }),
  setMaxRpmPerCredential: (value: number) =>
    call<ApplyResult>("set_max_rpm_per_credential", { value }),
  setSuggestionMode: (enabled: boolean) => call<ApplyResult>("set_suggestion_mode", { enabled }),
  setClientTokenPassthrough: (enabled: boolean) =>
    call<ApplyResult>("set_client_token_passthrough", { enabled }),
  setThinkingAsText: (enabled: boolean) => call<ApplyResult>("set_thinking_as_text", { enabled }),
  setOutputTokensIncludeThinking: (enabled: boolean) =>
    call<ApplyResult>("set_output_tokens_include_thinking", { enabled }),
  setModelsOfficialAliases: (enabled: boolean) =>
    call<ApplyResult>("set_models_official_aliases", { enabled }),
  setPromptCacheAccounting: (enabled: boolean) =>
    call<ApplyResult>("set_prompt_cache_accounting", { enabled }),
  setDebugLogs: (enabled: boolean) => call<ApplyResult>("set_debug_logs", { enabled }),
  setDumpKiroBody: (enabled: boolean) => call<ApplyResult>("set_dump_kiro_body", { enabled }),
  setWriteChunkingMaxLines: (value: number) =>
    call<ApplyResult>("set_write_chunking_max_lines", { value }),
  setMaxEffort: (value: string) => call<ApplyResult>("set_max_effort", { value }),
  setRuntimeConfig: (patch: RuntimeConfigPatch) =>
    call<ApplyResult>("set_runtime_config", { patch }),
  testConnection: (req: TestConnectionRequest) =>
    call<TestConnectionResult>("test_connection", { req }),

  // 软件更新
  getUpdateStatus: () => call<UpdateStatus>("get_update_status"),
  checkForUpdate: () => call<UpdateStatus>("check_for_update"),
  installUpdate: () => call<void>("install_update"),
  openUpdatePage: () => call<void>("open_update_page"),

  // 模型
  listModels: () => call<ModelView[]>("list_models"),
  getAccountModels: (id: number) => call<ModelView[]>("get_account_models", { id }),
}
