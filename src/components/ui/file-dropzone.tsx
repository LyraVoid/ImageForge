import { FileUp, LoaderCircle } from "lucide-react";
import * as React from "react";
import { useT } from "@/i18n/use-translation";
import { cn } from "@/lib/utils";

export interface FileDropzoneProps {
  onFileSelected: (file: File) => void;
  accept?: string;
  maxBytes?: number;
  disabled?: boolean;
  busy?: boolean;
  title?: string;
  hint?: string;
  className?: string;
}

export function FileDropzone({
  onFileSelected,
  accept = ".img",
  maxBytes = 512 * 1024 * 1024,
  disabled = false,
  busy = false,
  title,
  hint,
  className,
}: FileDropzoneProps) {
  const t = useT();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const accept_ = disabled || busy;
  const shownTitle = title ?? t("dropzone.title");
  const shownHint = hint ?? t("dropzone.hint");

  const validate = React.useCallback(
    (file: File): boolean => {
      if (file.size === 0) {
        setProblem(t("dropzone.empty"));
        return false;
      }
      if (file.size > maxBytes) {
        setProblem(t("dropzone.tooLarge"));
        return false;
      }
      setProblem(null);
      return true;
    },
    [maxBytes, t],
  );

  const handleFiles = React.useCallback(
    (files: FileList | null) => {
      const file = files && files.length > 0 ? files[0] : null;
      if (!file) return;
      if (!validate(file)) return;
      onFileSelected(file);
    },
    [onFileSelected, validate],
  );

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (accept_) return;
    handleFiles(event.dataTransfer?.files ?? null);
  };

  return (
    <div className={cn("w-full", className)}>
      <div
        role="button"
        tabIndex={accept_ ? -1 : 0}
        aria-disabled={accept_}
        aria-label={shownTitle}
        onClick={() => {
          if (!accept_) inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (accept_) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!accept_) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center transition-colors duration-150",
          "border-border-strong bg-surface hover:border-primary-border hover:bg-primary-muted/40",
          dragging && "border-primary bg-primary-muted",
          accept_ && "cursor-not-allowed opacity-60",
          !accept_ && "cursor-pointer",
        )}
      >
        <div className="flex size-9 items-center justify-center rounded-md border border-border bg-surface-muted">
          {busy ? (
            <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
          ) : (
            <FileUp className="size-4 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{busy ? t("dropzone.busy") : shownTitle}</p>
          <p className="text-xs text-muted-foreground">{shownHint}</p>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">boot.img / init_boot.img / vendor_boot.img</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      {problem ? (
        <p role="alert" className="mt-2 text-xs text-error">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
