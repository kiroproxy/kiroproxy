import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { strings } from "@/lib/strings"

/**
 * 添加账号对话框的外壳。具体表单由 Task 2.6 实现（KAM 导入 / 手动添加）。
 */
export interface AddAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddAccountDialog({ open, onOpenChange }: AddAccountDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{strings.accounts.addTitle}</DialogTitle>
          <DialogDescription>{strings.accounts.emptyHint}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
