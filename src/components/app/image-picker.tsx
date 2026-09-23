import { useNavigate } from "react-router";
import type { LucideIcon } from "lucide-react";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { SourcePanel } from "@/components/app/source-panel";
import { MAX_SUPPORTED_IMAGE_BYTES } from "@/core";
import { PATCH_ROUTES } from "@/app/tools";
import { useT } from "@/i18n/use-translation";
import { formatBytes } from "@/lib/format";
import { useForgeStore } from "@/stores/forge-store";

/**
 * The one place a file enters the site: it hands it to the workspace (which keeps the bytes in the
 * worker and reports what it is), and either continues into the patcher — the file is a boot image —
 * or names the tools that accept what was opened. The tools page and the patcher's first step both
 * use it, so the entry behaves the same wherever a user starts.
 */
export function ImagePicker({
  showLimit = true,
  continueToPatcher = true,
  compact = false,
  title,
  formats,
  accept,
  icon,
  maxBytes = MAX_SUPPORTED_IMAGE_BYTES,
}: {
  showLimit?: boolean;
  continueToPatcher?: boolean;
  compact?: boolean;
  title?: string;
  formats?: string;
  accept?: string;
  icon?: LucideIcon;
  maxBytes?: number;
}) {
  const t = useT();
  const navigate = useNavigate();
  const analyzeFile = useForgeStore((state) => state.analyzeFile);
  const stage = useForgeStore((state) => state.stage);
  const source = useForgeStore((state) => state.source);

  const handleFile = async (file: File) => {
    const analysis = await analyzeFile(file);
    if (analysis && continueToPatcher) navigate(PATCH_ROUTES.analyze);
  };

  return (
    <div className="space-y-3">
      <FileDropzone
        onFileSelected={handleFile}
        busy={stage === "analyzing"}
        maxBytes={maxBytes}
        title={title}
        formats={formats ?? t("dropzone.formats.patch")}
        accept={accept}
        compact={compact}
        icon={icon}
      />
      {source && stage !== "analyzing" ? <SourcePanel source={source} /> : null}
      {showLimit ? (
        <p className="text-center text-[11px] leading-5 text-muted-foreground">
          {t("picker.limit", { size: formatBytes(MAX_SUPPORTED_IMAGE_BYTES) })}
        </p>
      ) : null}
    </div>
  );
}
