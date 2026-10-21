import { invoke } from "@tauri-apps/api/core"
import type {
  AccountsResponse,
  AddCredentialRequest,
  AddCredentialResponse,
  AdminModelItem,
  ApiKeyView,
  AppInfo,
  ApplyResult,
  BalanceResponse,
  CreateApiKeyRequest,
  CredentialDaySummary,
  DailySummary,
  FailureLogPage,
  ImportOutcome,
  KamPreview,
  KiroIdePreview,
  LogEntry,
  LogKind,
  RpmSnapshot,
  RuntimeConfigPatch,
  ServerStatus,
  SettingsView,
  ThrottleLogPage,
  UpdateApiKeyRequest,
  UpdateCredentialRequest,
  UsageFilter,
  UsageRecordsPage,
  UsageSummary,
  VerifyOutcome,
} from "./types"

export interface IpcError {
  code: string
  message: string
}

export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (e) {
    if (typeof e === "object" && e && "code" in e) throw e as IpcError
    throw { code: "ipc_error", message: String(e) } satisfies IpcError
  }
}

export const ipc = {
  // 应用与服务器
  getAppInfo: () => call<AppInfo>("get_app_info"),
  getStartupError: () => call<IpcError | null>("get_startup_error"),
  getServerStatus: () => call<ServerStatus>("get_server_status"),
  startProxyServer: () => call<ServerStatus>("start_proxy_server"),
  stopProxyServer: () => call<ServerStatus>("stop_proxy_server"),
  restartProxyServer: () => call<ServerStatus>("restart_proxy_server"),
  retryStartup: () => call<ServerStatus>("retry_startup"),
  openDataDir: () => call<void>("open_data_dir"),
  openFile: (kind: "config" | "credentials" | "log") => call<void>("open_file", { kind }),
  readTextFile: (path: string) => call<string>("read_text_file", { path }),
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
  getAccountBalance: (id: number) => call<BalanceResponse>("get_account_balance", { id }),
  previewKamImport: (json: string) => call<KamPreview>("preview_kam_import", { json }),
  importKamAccounts: (json: string, verify: boolean) =>
    call<ImportOutcome>("import_kam_accounts", { json, verify }),
  verifyAccounts: (ids: number[]) => call<VerifyOutcome>("verify_accounts", { ids }),
  cancelVerifyAccounts: () => call<void>("cancel_verify_accounts"),
  scanKiroIde: () => call<KiroIdePreview | null>("scan_kiro_ide"),
  importKiroIde: () => call<ImportOutcome>("import_kiro_ide"),

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
  getCredentialUsageRecords: (credentialId: number, page: number, pageSize: number) =>
    call<UsageRecordsPage>("get_credential_usage_records", { credentialId, page, pageSize }),
  getCredentialTodaySummary: (credentialId: number) =>
    call<CredentialDaySummary>("get_credential_today_summary", { credentialId }),
  getRpm: () => call<RpmSnapshot>("get_rpm"),

  // 日志
  getLogSnapshot: () => call<LogEntry[]>("get_log_snapshot"),
  getThrottleLogs: (credentialId?: number) =>
    call<ThrottleLogPage>("get_throttle_logs", { credentialId }),
  getFailureLogs: (credentialId?: number) =>
    call<FailureLogPage>("get_failure_logs", { credentialId }),
  exportLogs: (kind: LogKind, destPath: string) =>
    call<string>("export_logs", { kind, destPath }),

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
  setRuntimeConfig: (patch: RuntimeConfigPatch) =>
    call<ApplyResult>("set_runtime_config", { patch }),

  // 模型
  listModels: () => call<AdminModelItem[]>("list_models"),
  getAccountModels: (id: number) => call<AdminModelItem[]>("get_account_models", { id }),
}
