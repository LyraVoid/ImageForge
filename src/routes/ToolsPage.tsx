import {
  ArrowUpRight,
  Boxes,
  Clapperboard,
  FileDiff,
  GitBranch,
  HardDrive,
  Image as ImageIcon,
  PackageOpen,
  ScanSearch,
  ShieldCheck,
  Workflow,
  Wrench,
} from "lucide-react";
import { useNavigate } from "react-router";
import { ImagePicker } from "@/components/app/image-picker";
import { ErrorPanel } from "@/components/app/error-panel";
import { Badge } from "@/components/ui/badge";
import { PRIMARY_TOOL, otherTools } from "@/app/tools";
import type { ToolDefinition } from "@/app/tools";
import { useT } from "@/i18n/use-translation";
import { useForgeStore } from "@/stores/forge-store";
import { cn } from "@/lib/utils";

const HIGHLIGHTS = [
  { icon: HardDrive, titleKey: "home.highlight.local", detailKey: "home.highlight.local.detail" },
  { icon: ShieldCheck, titleKey: "home.highlight.private", detailKey: "home.highlight.private.detail" },
  { icon: GitBranch, titleKey: "home.highlight.open", detailKey: "home.highlight.open.detail" },
] as const;

const FLOW_STEPS = [
  { titleKey: "home.flow.image", detailKey: "home.flow.image.detail" },
  { titleKey: "home.flow.choose", detailKey: "home.flow.choose.detail" },
  { titleKey: "home.flow.patch", detailKey: "home.flow.patch.detail" },
  { titleKey: "home.flow.download", detailKey: "home.flow.download.detail" },
] as const;

const TOOL_ICONS: Record<string, typeof Wrench> = {
  patch: Wrench,
  extract: PackageOpen,
  unpack: Boxes,
  logo: ImageIcon,
  animation: Clapperboard,
  diff: FileDiff,
  inspect: ScanSearch,
};

function ToolRow({ tool }: { tool: ToolDefinition }) {
  const t = useT();
  const navigate = useNavigate();
  const Icon = TOOL_ICONS[tool.id] ?? Wrench;
  const available = tool.status === "available";

  return (
    <li className="min-w-0">
      <button
        type="button"
        disabled={!available}
        onClick={() => navigate(tool.path)}
        className={cn(
          "group flex h-full w-full items-start gap-3 bg-surface px-4 py-4 text-left transition-colors",
          available ? "hover:bg-surface-muted" : "cursor-not-allowed opacity-65",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted text-muted-foreground transition-colors group-hover:border-border-strong group-hover:text-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{t(tool.titleKey)}</span>
            <Badge variant={available ? "success" : "neutral"}>
              {available ? t("tools.badge.available") : t("tools.badge.planned")}
            </Badge>
          </span>
          <span className="block text-xs leading-5 text-muted-foreground">{t(tool.descriptionKey)}</span>
        </span>
        {available ? (
          <ArrowUpRight
            className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
            aria-hidden
          />
        ) : null}
      </button>
    </li>
  );
}

/**
 * The landing page is a workspace, not a dashboard: the patcher owns the main frame, while the
 * supporting tools stay compact and the page states plainly what happens to the user's bytes.
 */
export function ToolsPage() {
  const t = useT();
  const error = useForgeStore((state) => state.error);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 py-3 sm:py-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-2">
          <h1 className="text-balance-tight text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("tools.title")}
          </h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">{t("tools.subtitle")}</p>
        </div>
        <div className="flex w-fit items-center gap-2 rounded-md border border-primary-border bg-primary-muted px-3 py-2 text-xs font-medium text-primary">
          <ShieldCheck className="size-3.5" aria-hidden />
          {t("home.localBadge")}
        </div>
      </header>

      <ErrorPanel error={error} />

      <section className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(17rem,0.9fr)]">
        <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
          <div className="flex items-start gap-3 border-b border-border px-5 py-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-primary-border bg-primary-muted text-primary">
              <Wrench className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight">{t(PRIMARY_TOOL.titleKey)}</h2>
                <Badge variant="primary">{t("home.primary.badge")}</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t(PRIMARY_TOOL.descriptionKey)}
              </p>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <ImagePicker />
          </div>
        </div>

        <aside className="rounded-lg border border-border bg-surface shadow-subtle">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Workflow className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="text-sm font-semibold tracking-tight">{t("home.flow.title")}</h2>
          </div>
          <div className="space-y-5 px-5 py-4">
            <ol className="space-y-4">
              {FLOW_STEPS.map((step, index) => (
                <li key={step.titleKey} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-sm border border-border bg-surface-muted font-mono text-[11px] text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 space-y-0.5">
                    <span className="block text-xs font-medium text-foreground">{t(step.titleKey)}</span>
                    <span className="block text-[11px] leading-4 text-muted-foreground">{t(step.detailKey)}</span>
                  </span>
                </li>
              ))}
            </ol>

            <div className="space-y-3 border-t border-border pt-4">
              {HIGHLIGHTS.map((item) => (
                <div key={item.titleKey} className="flex items-start gap-2.5">
                  <item.icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{t(item.titleKey)}</p>
                    <p className="text-[11px] leading-4 text-muted-foreground">{t(item.detailKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">{t("tools.more")}</h2>
            <p className="text-xs text-muted-foreground">{t("home.more.description")}</p>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">boot.img · init_boot.img · vendor_boot.img</p>
        </div>
        <ul className="grid overflow-hidden rounded-lg border border-border bg-border shadow-subtle sm:grid-cols-2 sm:gap-px">
          {otherTools().map((tool) => (
            <ToolRow key={tool.id} tool={tool} />
          ))}
        </ul>
      </section>
    </div>
  );
}
