import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useT } from "@/i18n/use-translation";
import { cn } from "@/lib/utils";

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;

export interface DrawerContentProps extends React.ComponentProps<typeof DialogPrimitive.Content> {
  side?: "right" | "left" | "bottom";
}

export function DrawerContent({ className, children, side = "right", ...props }: DrawerContentProps) {
  const t = useT();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col gap-0 border-border bg-surface shadow-overlay",
          side === "right" && "inset-y-0 right-0 w-full max-w-sm border-l",
          side === "left" && "inset-y-0 left-0 w-full max-w-sm border-r",
          side === "bottom" && "inset-x-0 bottom-0 max-h-[80vh] rounded-t-lg border-t",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-3 top-3 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          aria-label={t("shell.aria.close")}
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DrawerTitle = DialogPrimitive.Title;
export const DrawerDescription = DialogPrimitive.Description;
