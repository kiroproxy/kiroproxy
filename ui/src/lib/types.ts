// 与 Rust IPC 返回值对应的前端类型。
// 只声明 UI 使用的字段；后端多返回的字段会被忽略。

export interface IpcError {
  code: string
  message: string
}

export interface AppInfo {
  version: string
  dataDir: string
  configPath: string
  credentialsPath: string
  platform: string
}

export interface ServerStatus {
  running: boolean
  host: string
  port: number
  baseUrl: string
  startedAt?: string | null
  lastError?: string | null
}

export interface CredentialStatusItem {
  id: number
  priority: number
  disabled: boolean
  failureCount: number
  isCurrent: boolean
  expiresAt?: string | null
  authMethod?: string | null
  hasProfileArn: boolean
  refreshTokenHash?: string | null
  email?: string | null
  nickname?: string | null
  provider?: string | null
  authRegion?: string | null
  apiRegion?: string | null
  successCount: number
  lastUsedAt?: string | null
  hasProxy: boolean
  proxyUrl?: string | null
  thinkingAdaptive: boolean
  healthStatus: string
  throttleCount: number
  disabledReason?: string | null
}

export interface AccountsResponse {
  total: number
  available: number
  currentId: number
  credentials: CredentialStatusItem[]
}

export interface BalanceResponse {
  id: number
  subscriptionTitle?: string | null
  currentUsage: number
  usageLimit: number
  remaining: number
  usagePercentage: number
  nextResetAt?: number | null
}

export interface AddCredentialRequest {
  refreshToken: string
  authMethod: string
  clientId?: string | null
  clientSecret?: string | null
  provider?: string | null
  tokenEndpoint?: string | null
  scopes?: string | null
  profileArn?: string | null
  priority?: number
  disabled?: boolean
  region?: string | null
  authRegion?: string | null
  apiRegion?: string | null
  machineId?: string | null
  email?: string | null
  nickname?: string | null
  proxyUrl?: string | null
  proxyUsername?: string | null
  proxyPassword?: string | null
}

export type UpdateCredentialRequest = Partial<AddCredentialRequest> & {
  thinkingAdaptive?: boolean
}

export interface AddCredentialResponse {
  success: boolean
  message: string
  credentialId: number
  email?: string | null
}

export interface KamPreviewAccount {
  email?: string | null
  nickname?: string | null
  provider?: string | null
  authMethod?: string | null
  authRegion?: string | null
  hasClientId: boolean
  hasClientSecret: boolean
  maskedToken: string
}

export interface KamPreview {
  accounts: KamPreviewAccount[]
  duplicatesInFile: number
  invalid: number
}

export interface ImportOutcome {
  imported: number
  duplicate: number
  invalid: number
  failed: number
}

export interface KiroIdePreview {
  maskedRefreshToken: string
  provider?: string | null
  authMethod?: string | null
  profileArn?: string | null
  expiresAt?: string | null
  path: string
}

export interface VerifyItem {
  id: number
  status: "success" | "failed"
  message?: string | null
}

export interface VerifyOutcome {
  success: number
  failed: number
  results: VerifyItem[]
}

export interface ApiKeyView {
  id: number
  name: string
  maskedKey: string
  enabled: boolean
  createdAt: string
  expiresAt?: string | null
  spendingLimit?: number | null
  limitUnit: "usd" | "credits"
  durationDays?: number | null
  activatedAt?: string | null
  boundCredentialIds?: number[] | null
  usedAmount: number
}

export interface CreateApiKeyRequest {
  name: string
  spendingLimit?: number | null
  limitUnit: "usd" | "credits"
  durationDays?: number | null
  boundCredentialIds?: number[] | null
}

export interface UpdateApiKeyRequest extends Partial<CreateApiKeyRequest> {
  enabled?: boolean
}

export interface ModelUsage {
  model: string
  requests: number
  inputTokens: number
  outputTokens: number
  cost: number
  credits: number
  creditsSaved: number
}

export interface UsageSummary {
  apiKeyId: number
  totalRequests: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  totalCredits: number
  totalCreditsSaved: number
  byModel: ModelUsage[]
}

export interface DailySummary {
  date: string
  totalRequests: number
  totalCost: number
  totalCredits: number
  totalCreditsSaved: number
  totalInputTokens: number
  totalCacheReadTokens: number
}

export interface CredentialDaySummary extends DailySummary {
  credentialId: number
  totalOutputTokens: number
}

export interface UsageRecordItem {
  model: string
  inputTokens: number
  outputTokens: number
  estimatedCost: number
  creditsUsed?: number | null
  cacheReadInputTokens?: number | null
  cacheCreationInputTokens?: number | null
  creditsSaved?: number | null
  createdAt: string
  credentialId?: number | null
  credentialLabel?: string | null
  clientIp?: string | null
  effort?: string | null
  firstTokenMs?: number | null
  durationMs?: number | null
  thinkingTokenCount?: number | null
  isStream?: boolean | null
  userAgent?: string | null
}

export interface UsageRecordsPage {
  records: UsageRecordItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface UsageFilter {
  from: string
  to: string
  apiKeyId?: number
  credentialId?: number
  model?: string
  page: number
  pageSize: number
}

export interface RpmSnapshot {
  global: number
  byCredential: Record<string, number>
  byApiKey: Record<string, number>
}

export interface LogEntry {
  timestamp: string
  level: string
  target: string
  message: string
}

export interface ThrottleLogItem {
  credentialId: number
  requestType: string
  statusCode: number
  responseBody: string
  createdAt: string
  endpoint?: string | null
}

export interface ThrottleLogPage {
  records: ThrottleLogItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface FailureLogItem {
  credentialId: number
  requestType: string
  statusCode: number
  responseBody: string
  createdAt: string
}

export interface FailureLogPage {
  records: FailureLogItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type LogKind = "runtime" | "throttle" | "failure"

export interface SettingsView {
  host: string
  port: number
  region: string
  authRegion?: string | null
  apiRegion?: string | null
  proxyUrl?: string | null
  proxyConfigured: boolean
  proxyAuthConfigured: boolean
  tlsBackend: "rustls" | "native-tls"
  loadBalancingMode: "priority" | "balanced"
  maxRpmPerCredential: number
  writeChunkingMaxLines: number
  forwardSuggestionMode: boolean
  clientTokenPassthrough: boolean
  thinkingAsText: boolean
  debugLogs: boolean
  dumpKiroBody: boolean
  promptCacheAccounting: boolean
  outputTokensIncludeThinking: boolean
  modelsOfficialAliases: boolean
  dataDir: string
  configPath: string
  credentialsPath: string
  version: string
}

export interface ApplyResult {
  applied: string[]
  restartRequired: string[]
  settings: SettingsView
}

export interface RuntimeConfigPatch {
  host?: string
  port?: number
  proxyUrl?: string | null
  proxyUsername?: string | null
  proxyPassword?: string | null
  tlsBackend?: "rustls" | "native-tls"
  region?: string
  authRegion?: string | null
  apiRegion?: string | null
}

export interface AdminModelItem {
  id: string
  displayName?: string
  type: string
  rateMultiplier?: number | null
  releasedAt?: string | null
}
