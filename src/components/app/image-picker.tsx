import { useNavigate } from "react-router";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { MAX_SUPPORTED_IMAGE_BYTES } from "@/core";
import { PATCH_ROUTES } from "@/app/tools";
import { useT } from "@/i18n/use-translation";
import { formatBytes } from "@/lib/format";
import { useForgeStore } from "@/stores/forge-store";

/**
 * The one place an image enters the patcher: it hands the file to the store (which keeps the bytes
 * in the worker) and moves to the analysis step. The tools page and the patcher's first step both
 * use it, so the entry behaves the same wherever a user starts.
 */
export function ImagePicker({ showLimit = true }: { showLimit?: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const analyzeFile = useForgeStore((state) => state.analyzeFile);
  const stage = useForgeStore((state) => state.stage);

  const handleFile = async (file: File) => {
    const analysis = await analyzeFile(file);
    if (analysis) navigate(PATCH_ROUTES.analyze);
  };

  return (
    <div className="space-y-3">
      <FileDropzone onFileSelected={handleFile} busy={stage === "analyzing"} maxBytes={MAX_SUPPORTED_IMAGE_BYTES} />
      {showLimit ? (
        <p className="text-center text-[11px] leading-5 text-muted-foreground">
          {t("picker.limit", { size: formatBytes(MAX_SUPPORTED_IMAGE_BYTES) })}
        </p>
      ) : null}
    </div>
  );
}
