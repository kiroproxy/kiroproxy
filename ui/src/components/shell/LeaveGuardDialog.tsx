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
import { strings } from "@/lib/strings"
import { cancelLeave, confirmLeave, usePendingLeave } from "@/lib/unsaved-changes"

/** 有未保存的修改时拦下离开动作，让用户选择继续编辑还是放弃修改。 */
export function LeaveGuardDialog() {
  const pending = usePendingLeave()
  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) cancelLeave()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{strings.settings.unsavedTitle}</AlertDialogTitle>
          <AlertDialogDescription>{strings.settings.unsavedConfirm}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{strings.settings.keepEditing}</AlertDialogCancel>
          <AlertDialogAction variant="danger" onClick={confirmLeave}>
            {strings.settings.discardChanges}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
