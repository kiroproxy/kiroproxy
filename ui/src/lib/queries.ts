import {
  keepPreviousData,
  MutationCache,
  QueryClient,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { toast } from "sonner"
import { errorMessage, ipc } from "./ipc"
import type {
  AddCredentialRequest,
  BalanceResponse,
  CreateApiKeyRequest,
  RuntimeConfigPatch,
  UpdateApiKeyRequest,
  UpdateCredentialRequest,
  UsageFilter,
} from "./types"

/**
 * 轮询间隔：状态栏、概览指标共用同一组查询。TanStack Query 只在 document 隐藏
 *（窗口最小化或被完全遮挡）时暂停轮询；窗口可见但失焦时继续刷新，方便边用边看。
 */
const POLL_MS = 5000
/** 与后端余额缓存（300 秒）对齐。 */
const BALANCE_STALE_MS = 5 * 60 * 1000
/** 模型列表直连上游，变化很少。 */
const MODELS_STALE_MS = 30 * 60 * 1000
export const LOG_PAGE_SIZE = 50

export const queryKeys = {
  appInfo: ["appInfo"] as const,
  server: ["server"] as const,
  accounts: ["accounts"] as const,
  rpm: ["rpm"] as const,
  apiKeys: ["apiKeys"] as const,
  apiKeyUsage: ["apiKeyUsage"] as const,
  usage: (filter: UsageFilter) => ["usage", filter] as const,
  usageBreakdown: (from: string, to: string) => ["usageBreakdown", from, to] as const,
  dailyUsage: ["dailyUsage"] as const,
  throttleLogs: (id: number | undefined, page: number) => ["throttleLogs", id, page] as const,
  failureLogs: (id: number | undefined, page: number) => ["failureLogs", id, page] as const,
  settings: ["settings"] as const,
  models: ["models"] as const,
  accountModels: (id: number) => ["accountModels", id] as const,
  balance: (id: number) => ["balance", id] as const,
  credentialUsage: (id: number, page: number) => ["credentialUsage", id, page] as const,
  credentialToday: (id: number) => ["credentialToday", id] as const,
}

/** mutation 默认在失败时弹出错误；个别调用传 meta.silent 自行处理。 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.silent) return
        toast.error(errorMessage(error))
      },
    }),
  })
}

export const useAppInfo = () =>
  useQuery({ queryKey: queryKeys.appInfo, queryFn: ipc.getAppInfo, staleTime: Infinity })
export const useServerStatus = () =>
  useQuery({ queryKey: queryKeys.server, queryFn: ipc.getServerStatus, refetchInterval: POLL_MS })
export const useAccounts = () =>
  useQuery({ queryKey: queryKeys.accounts, queryFn: ipc.listAccounts, refetchInterval: POLL_MS })
export const useRpm = () =>
  useQuery({ queryKey: queryKeys.rpm, queryFn: ipc.getRpm, refetchInterval: POLL_MS })
export const useApiKeys = () => useQuery({ queryKey: queryKeys.apiKeys, queryFn: ipc.listApiKeys })
export const useAllApiKeyUsage = () =>
  useQuery({ queryKey: queryKeys.apiKeyUsage, queryFn: ipc.getAllApiKeyUsage })
export const useDailyUsage = () =>
  useQuery({ queryKey: queryKeys.dailyUsage, queryFn: ipc.getDailyUsage, refetchInterval: 30_000 })
export const useSettings = () => useQuery({ queryKey: queryKeys.settings, queryFn: ipc.getSettings })
export const useModels = () =>
  useQuery({ queryKey: queryKeys.models, queryFn: ipc.listModels, staleTime: MODELS_STALE_MS })
export const useAccountModels = (id: number, enabled = true) =>
  useQuery({
    queryKey: queryKeys.accountModels(id),
    queryFn: () => ipc.getAccountModels(id),
    enabled,
    staleTime: MODELS_STALE_MS,
  })
export const useAccountBalance = (id: number, enabled = true) =>
  useQuery({
    queryKey: queryKeys.balance(id),
    queryFn: () => ipc.getAccountBalance(id),
    staleTime: BALANCE_STALE_MS,
    enabled,
  })
/** 多个账号的余额；与单行查询共用缓存，不会重复请求。 */
export const useAccountBalances = (ids: number[]) =>
  useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.balance(id),
      queryFn: () => ipc.getAccountBalance(id),
      staleTime: BALANCE_STALE_MS,
    })),
    combine: (results) => {
      const map = new Map<number, BalanceResponse>()
      results.forEach((result, index) => {
        if (result.data) map.set(ids[index], result.data)
      })
      return map
    },
  })
export const useUsageRecords = (filter: UsageFilter) =>
  useQuery({
    queryKey: queryKeys.usage(filter),
    queryFn: () => ipc.getUsageRecords(filter),
    placeholderData: keepPreviousData,
  })
export const useUsageBreakdown = (from: string, to: string) =>
  useQuery({
    queryKey: queryKeys.usageBreakdown(from, to),
    queryFn: () => ipc.getUsageBreakdown(from, to),
    placeholderData: keepPreviousData,
  })
export const useCredentialUsageRecords = (id: number, page: number, pageSize = 50) =>
  useQuery({
    queryKey: queryKeys.credentialUsage(id, page),
    queryFn: () => ipc.getCredentialUsageRecords(id, page, pageSize),
    placeholderData: keepPreviousData,
  })
export const useCredentialTodaySummary = (id: number) =>
  useQuery({
    queryKey: queryKeys.credentialToday(id),
    queryFn: () => ipc.getCredentialTodaySummary(id),
  })
export const useThrottleLogs = (id: number | undefined, page = 1) =>
  useQuery({
    queryKey: queryKeys.throttleLogs(id, page),
    queryFn: () => ipc.getThrottleLogs(id, page, LOG_PAGE_SIZE),
    placeholderData: keepPreviousData,
  })
export const useFailureLogs = (id: number | undefined, page = 1) =>
  useQuery({
    queryKey: queryKeys.failureLogs(id, page),
    queryFn: () => ipc.getFailureLogs(id, page, LOG_PAGE_SIZE),
    placeholderData: keepPreviousData,
  })

function useInvalidate() {
  const qc = useQueryClient()
  return (...keys: (readonly unknown[])[]) =>
    Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })))
}

export function useCreateAccount() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (req: AddCredentialRequest) => ipc.addAccount(req),
    onSuccess: () => invalidate(queryKeys.accounts),
  })
}
export function useUpdateAccount() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateCredentialRequest }) =>
      ipc.updateAccount(id, req),
    onSuccess: (_data, { id }) => invalidate(queryKeys.accounts, queryKeys.balance(id)),
  })
}
export function useDeleteAccount() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => ipc.deleteAccount(id),
    onSuccess: () => invalidate(queryKeys.accounts),
  })
}
export function useSetDisabled() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, disabled }: { id: number; disabled: boolean }) =>
      ipc.setAccountDisabled(id, disabled),
    onSuccess: () => invalidate(queryKeys.accounts),
  })
}
export function useSetPriority() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, priority }: { id: number; priority: number }) =>
      ipc.setAccountPriority(id, priority),
    onSuccess: () => invalidate(queryKeys.accounts),
  })
}
export function useResetFailure() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => ipc.resetAccountFailure(id),
    onSuccess: () => invalidate(queryKeys.accounts),
  })
}

/** 批量操作：并行执行、只刷新一次，并返回成功/失败数量供调用方汇总提示。 */
export function useBatchAccountAction() {
  const invalidate = useInvalidate()
  return useMutation({
    meta: { silent: true },
    mutationFn: async ({ ids, run }: { ids: number[]; run: (id: number) => Promise<unknown> }) => {
      const results = await Promise.allSettled(ids.map((id) => run(id)))
      const failed = results.filter((result) => result.status === "rejected").length
      return { success: results.length - failed, failed }
    },
    onSettled: () => invalidate(queryKeys.accounts),
  })
}

export function useCreateApiKey() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (req: CreateApiKeyRequest) => ipc.createApiKey(req),
    onSuccess: () => invalidate(queryKeys.apiKeys),
  })
}
export function useUpdateApiKey() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateApiKeyRequest }) =>
      ipc.updateApiKey(id, req),
    onSuccess: () => invalidate(queryKeys.apiKeys),
  })
}
export function useDeleteApiKey() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => ipc.deleteApiKey(id),
    onSuccess: () => invalidate(queryKeys.apiKeys, queryKeys.apiKeyUsage),
  })
}
export function useResetApiKeyUsage() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => ipc.resetApiKeyUsage(id),
    onSuccess: () => invalidate(queryKeys.apiKeyUsage, queryKeys.apiKeys),
  })
}
export function useVerifyAccounts() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (ids: number[]) => ipc.verifyAccounts(ids),
    onSuccess: () => invalidate(queryKeys.accounts),
  })
}
export function useImportKam() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ json, verify }: { json: string; verify: boolean }) =>
      ipc.importKamAccounts(json, verify),
    onSuccess: () => invalidate(queryKeys.accounts),
  })
}
export function useImportKiroIde() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () => ipc.importKiroIde(),
    onSuccess: () => invalidate(queryKeys.accounts),
  })
}
export function useUpdateRuntimeConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: RuntimeConfigPatch) => ipc.setRuntimeConfig(patch),
    onSuccess: (result) => qc.setQueryData(queryKeys.settings, result.settings),
  })
}
export function useRestartProxy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => ipc.restartProxyServer(),
    onSuccess: (status) => {
      qc.setQueryData(queryKeys.server, status)
      void qc.invalidateQueries({ queryKey: queryKeys.settings })
    },
    onError: () => void qc.invalidateQueries({ queryKey: queryKeys.server }),
  })
}
