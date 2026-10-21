import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ipc } from "./ipc"
import type {
  AddCredentialRequest,
  CreateApiKeyRequest,
  RuntimeConfigPatch,
  UpdateApiKeyRequest,
  UpdateCredentialRequest,
  UsageFilter,
} from "./types"

export const queryKeys = {
  appInfo: ["appInfo"] as const,
  accounts: ["accounts"] as const,
  apiKeys: ["apiKeys"] as const,
  apiKeyUsage: ["apiKeyUsage"] as const,
  usage: (filter: UsageFilter) => ["usage", filter] as const,
  dailyUsage: ["dailyUsage"] as const,
  logs: ["logs"] as const,
  throttleLogs: (id?: number) => ["throttleLogs", id] as const,
  failureLogs: (id?: number) => ["failureLogs", id] as const,
  settings: ["settings"] as const,
  server: ["server"] as const,
  models: ["models"] as const,
  accountModels: (id: number) => ["accountModels", id] as const,
}

export const useAppInfo = () =>
  useQuery({ queryKey: queryKeys.appInfo, queryFn: ipc.getAppInfo, staleTime: Infinity })
export const useServerStatus = () =>
  useQuery({ queryKey: queryKeys.server, queryFn: ipc.getServerStatus, refetchInterval: 5000 })
export const useAccounts = () =>
  useQuery({ queryKey: queryKeys.accounts, queryFn: ipc.listAccounts })
export const useApiKeys = () =>
  useQuery({ queryKey: queryKeys.apiKeys, queryFn: ipc.listApiKeys })
export const useAllApiKeyUsage = () =>
  useQuery({ queryKey: queryKeys.apiKeyUsage, queryFn: ipc.getAllApiKeyUsage })
export const useDailyUsage = () =>
  useQuery({ queryKey: queryKeys.dailyUsage, queryFn: ipc.getDailyUsage })
export const useSettings = () =>
  useQuery({ queryKey: queryKeys.settings, queryFn: ipc.getSettings })
export const useRpm = () =>
  useQuery({ queryKey: ["rpm"], queryFn: ipc.getRpm, refetchInterval: 5000 })
export const useModels = () =>
  useQuery({ queryKey: queryKeys.models, queryFn: ipc.listModels })
export const useAccountModels = (id: number, enabled = true) =>
  useQuery({
    queryKey: queryKeys.accountModels(id),
    queryFn: () => ipc.getAccountModels(id),
    enabled,
  })
export const useAccountBalance = (id: number) =>
  useQuery({ queryKey: ["balance", id], queryFn: () => ipc.getAccountBalance(id) })
export const useUsageRecords = (filter: UsageFilter) =>
  useQuery({ queryKey: queryKeys.usage(filter), queryFn: () => ipc.getUsageRecords(filter) })
export const useCredentialUsageRecords = (id: number, page: number, pageSize = 50) =>
  useQuery({
    queryKey: ["credentialUsage", id, page],
    queryFn: () => ipc.getCredentialUsageRecords(id, page, pageSize),
  })
export const useThrottleLogs = (id?: number) =>
  useQuery({ queryKey: queryKeys.throttleLogs(id), queryFn: () => ipc.getThrottleLogs(id) })
export const useFailureLogs = (id?: number) =>
  useQuery({ queryKey: queryKeys.failureLogs(id), queryFn: () => ipc.getFailureLogs(id) })

export function useAccountMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: AddCredentialRequest) => ipc.addAccount(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  })
}
export function useUpdateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateCredentialRequest }) =>
      ipc.updateAccount(id, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  })
}
export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => ipc.deleteAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  })
}
export function useSetAccountDisabled() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, disabled }: { id: number; disabled: boolean }) =>
      ipc.setAccountDisabled(id, disabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  })
}
export const useSetDisabled = useSetAccountDisabled
export function useSetPriority() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, priority }: { id: number; priority: number }) =>
      ipc.setAccountPriority(id, priority),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  })
}
export function useResetFailure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => ipc.resetAccountFailure(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  })
}
export function useCreateApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: CreateApiKeyRequest) => ipc.createApiKey(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.apiKeys }),
  })
}
export function useUpdateApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateApiKeyRequest }) =>
      ipc.updateApiKey(id, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.apiKeys }),
  })
}
export function useDeleteApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => ipc.deleteApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.apiKeys }),
  })
}
export function useResetApiKeyUsage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => ipc.resetApiKeyUsage(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.apiKeyUsage })
      qc.invalidateQueries({ queryKey: queryKeys.apiKeys })
    },
  })
}
export function useVerifyAccounts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: number[]) => ipc.verifyAccounts(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  })
}
export function useImportKam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ json, verify }: { json: string; verify: boolean }) =>
      ipc.importKamAccounts(json, verify),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  })
}
export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: RuntimeConfigPatch) => ipc.setRuntimeConfig(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings })
      qc.invalidateQueries({ queryKey: queryKeys.server })
    },
  })
}
