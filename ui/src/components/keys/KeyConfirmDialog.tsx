import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useDeleteApiKey, useResetApiKeyUsage } from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { ApiKeyView } from "@/lib/types"

export type KeyAction = { kind: "delete" | "reset"; key: ApiKeyView } | null

/** 删除密钥 / 重置用量的二次确认。删除成功后调用 onDeleted（详情页用来返回列表）。 */
export function KeyConfirmDialog({
  action,
  onClose,
  onDeleted,
}: {
  action: KeyAction
  onClose: () => void
  onDeleted?: () => void
}) {
  const deleteKey = useDeleteApiKey()
  const resetUsage = useResetApiKeyUsage()

  const confirm = () => {
    if (!action) return
    const { kind, key } = action
    const mutation = kind === "delete" ? deleteKey : resetUsage
    mutation.mutate(key.id, {
      onSuccess: () => {
        toast.success(kind === "delete" ? strings.keys.deleted : strings.keys.usageReset)
        onClose()
        if (kind === "delete") onDeleted?.()
      },
    })
  }

  return (
    <AlertDialog open={action !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {action?.kind === "delete" ? strings.keys.deleteTitle : strings.keys.resetUsageTitle}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {action?.key.name} ·{" "}
            {action?.kind === "delete" ? strings.keys.deleteConfirm : strings.keys.resetUsageConfirm}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{strings.common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            disabled={deleteKey.isPending || resetUsage.isPending}
            onClick={confirm}
          >
            {action?.kind === "delete" ? strings.common.delete : strings.common.reset}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
