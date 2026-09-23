import { FileUp, LoaderCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
  formats?: string;
  compact?: boolean;
  icon?: LucideIcon;
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
  formats,
  compact = false,
  icon,
  className,
}: FileDropzoneProps) {
  const t = useT();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const accept_ = disabled || busy;
  const shownTitle = title ?? t("dropzone.title");
  const shownHint = hint ?? t("dropzone.hint");
  const Icon = icon ?? FileUp;

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
          "flex w-full rounded-lg border border-dashed transition-colors duration-150",
          compact
            ? "items-center gap-3 px-4 py-4 text-left"
            : "flex-col items-center justify-center gap-2 px-6 py-12 text-center",
          "border-border-strong bg-surface hover:border-primary-border hover:bg-primary-muted/40",
          dragging && "border-primary bg-primary-muted",
          accept_ && "cursor-not-allowed opacity-60",
          !accept_ && "cursor-pointer",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted",
            compact ? "size-8" : "size-9",
          )}
        >
          {busy ? (
            <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
          ) : (
            <Icon className="size-4 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className={cn("min-w-0 space-y-1", compact && "flex-1")}>
          <p className="text-sm font-medium text-foreground">{busy ? t("dropzone.busy") : shownTitle}</p>
          <p className="text-xs text-muted-foreground">{shownHint}</p>
          {formats ? (
            <p className="break-words font-mono text-[11px] leading-4 text-muted-foreground">{formats}</p>
          ) : null}
        </div>
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
