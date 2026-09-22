import { Boxes, GitBranch, HardDrive, Image as ImageIcon, PackageOpen, ScanSearch, ShieldCheck, Wrench } from "lucide-react";
import { useNavigate } from "react-router";
import { ImagePicker } from "@/components/app/image-picker";
import { ErrorPanel } from "@/components/app/error-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const TOOL_ICONS: Record<string, typeof Wrench> = {
  patch: Wrench,
  extract: PackageOpen,
  unpack: Boxes,
  logo: ImageIcon,
  inspect: ScanSearch,
};

function ToolCard({ tool }: { tool: ToolDefinition }) {
  const t = useT();
  const navigate = useNavigate();
  const Icon = TOOL_ICONS[tool.id] ?? Wrench;
  const available = tool.status === "available";

  return (
    <li>
      <button
        type="button"
        disabled={!available}
        onClick={() => navigate(tool.path)}
        className={cn(
          "flex h-full w-full flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-left shadow-subtle transition-colors",
          available ? "hover:border-primary-border hover:bg-primary-muted/30" : "opacity-70",
        )}
      >
        <span className="flex items-center gap-2">
          <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium text-foreground">{t(tool.titleKey)}</span>
          <Badge variant={available ? "success" : "neutral"} className="ml-auto">
            {available ? t("tools.badge.available") : t("tools.badge.planned")}
          </Badge>
        </span>
        <span className="text-[11px] leading-4 text-muted-foreground">{t(tool.descriptionKey)}</span>
      </button>
    </li>
  );
}

/**
 * The landing page: what this site can do, with the patcher in front of it. The dropzone lives here
 * on purpose — the most common task should not need a click before it can start.
 */
export function ToolsPage() {
  const t = useT();
  const error = useForgeStore((state) => state.error);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-4 sm:py-8">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">{t("tools.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("tools.subtitle")}</p>
      </div>

      <ErrorPanel error={error} />

      <Card>
        <CardHeader className="flex-row items-start gap-3">
          <Wrench className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="space-y-1">
            <CardTitle>{t(PRIMARY_TOOL.titleKey)}</CardTitle>
            <CardDescription>{t(PRIMARY_TOOL.descriptionKey)}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ImagePicker />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">{t("tools.more")}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {otherTools().map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </ul>
      </section>

      <ul className="grid gap-3 sm:grid-cols-3">
        {HIGHLIGHTS.map((item) => (
          <li key={item.titleKey} className="flex items-start gap-2 rounded-md border border-border bg-surface px-3 py-2">
            <item.icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">{t(item.titleKey)}</p>
              <p className="text-[11px] leading-4 text-muted-foreground">{t(item.detailKey)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
