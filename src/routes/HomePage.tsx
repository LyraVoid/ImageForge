import { GitBranch, HardDrive, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router";
import { ErrorPanel } from "@/components/app/error-panel";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { MAX_SUPPORTED_IMAGE_BYTES } from "@/core";
import { useT } from "@/i18n/use-translation";
import { formatBytes } from "@/lib/format";
import { useForgeStore } from "@/stores/forge-store";

const HIGHLIGHTS = [
  { icon: HardDrive, label: "home.highlight.local", detail: "home.highlight.local.detail" },
  { icon: ShieldCheck, label: "home.highlight.private", detail: "home.highlight.private.detail" },
  { icon: GitBranch, label: "home.highlight.open", detail: "home.highlight.open.detail" },
] as const;

export function HomePage() {
  const t = useT();
  const navigate = useNavigate();
  const analyzeFile = useForgeStore((state) => state.analyzeFile);
  const stage = useForgeStore((state) => state.stage);
  const error = useForgeStore((state) => state.error);

  const handleFile = async (file: File) => {
    const analysis = await analyzeFile(file);
    if (analysis) navigate("/analyze");
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-6 sm:py-12">
      <div className="space-y-2 text-center">
        <h1 className="text-balance-tight text-xl font-semibold tracking-tight">{t("home.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("home.subtitle")}</p>
      </div>

      <ErrorPanel error={error} />

      <FileDropzone
        onFileSelected={handleFile}
        busy={stage === "analyzing"}
        maxBytes={MAX_SUPPORTED_IMAGE_BYTES}
      />

      <ul className="grid gap-3 sm:grid-cols-3">
        {HIGHLIGHTS.map((item) => (
          <li key={item.label} className="flex items-start gap-2 rounded-md border border-border bg-surface px-3 py-2">
            <item.icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">{t(item.label)}</p>
              <p className="text-[11px] leading-4 text-muted-foreground">{t(item.detail)}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-center text-[11px] leading-5 text-muted-foreground">
        {t("home.limit", { size: formatBytes(MAX_SUPPORTED_IMAGE_BYTES) })}
      </p>
    </div>
  );
}
