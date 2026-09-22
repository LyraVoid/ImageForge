import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/i18n/use-translation";
import type { PatchPlan, PatchVerificationResult } from "@/core";
import { formatBytes } from "@/lib/format";

export interface ReadinessChecklistProps {
  plan: PatchPlan;
  metadata: Record<string, string>;
  verification: PatchVerificationResult;
  sizeBytes: number;
}

/**
 * The checklist the user has to go through before the image reaches a device. It only repeats what
 * this run recorded: the tool never flashes anything, so the honest thing to do is to make the
 * consequences of flashing visible (dropped signature, which manager is needed, what changed).
 */
export function ReadinessChecklist({ plan, metadata, verification, sizeBytes }: ReadinessChecklistProps) {
  const t = useT();
  const manager = metadata.requiredManager ?? plan.configuration.requiredManager;
  const ramdiskProvider = plan.providerId === "kernelsu" || plan.providerId === "magisk";
  const padded = metadata.preserveImageSize === "true";
  const checks = verification.checks.length;
  const failed = verification.checks.filter((entry) => entry.status !== "pass").length;

  const rows: Array<{ icon: typeof Info; label: string; body: string; tone: "info" | "warn" }> = [];

  rows.push({
    icon: Info,
    label: t("readiness.target"),
    body: t("readiness.target.value", { target: plan.target }),
    tone: "info",
  });

  if (plan.providerId === "mock") {
    rows.push({ icon: CircleAlert, label: t("readiness.manager"), body: t("readiness.mock"), tone: "warn" });
  } else if (manager === undefined || manager.startsWith("unknown")) {
    rows.push({
      icon: CircleAlert,
      label: t("readiness.manager"),
      body: t("readiness.manager.unknown"),
      tone: "warn",
    });
  } else {
    rows.push({
      icon: CircleAlert,
      label: t("readiness.manager"),
      body: t("readiness.manager.value", { manager: manager }),
      tone: "warn",
    });
  }

  rows.push({
    icon: CircleAlert,
    label: t("readiness.avb"),
    body: metadata[KEEP_SIGNATURE] === "true" ? t("readiness.avb.kept") : t("readiness.avb.dropped"),
    tone: "warn",
  });

  rows.push({
    icon: Info,
    label: t("readiness.scope"),
    body: ramdiskProvider ? t("readiness.scope.ramdisk") : t("readiness.scope.kernel"),
    tone: "info",
  });

  if (plan.providerId === "apatch") {
    rows.push({
      icon: Info,
      label: t("readiness.superkey"),
      body:
        metadata.superkeyMode === "custom"
          ? t("readiness.superkey.custom")
          : t("readiness.superkey.none"),
      tone: "info",
    });
  }

  const modules = ramdiskProvider ? (metadata.moduleEntry ? "1" : "0") : (metadata.kpmCount ?? "0");
  if (modules !== "0") {
    rows.push({
      icon: Info,
      label: t("readiness.modules"),
      body: t("readiness.modules.value", { count: modules }),
      tone: "info",
    });
  }

  rows.push({
    icon: Info,
    label: t("readiness.size"),
    body: padded
      ? t("readiness.size.padded", { size: formatBytes(sizeBytes) })
      : t("readiness.size.compact", { size: formatBytes(sizeBytes) }),
    tone: "info",
  });

  rows.push({
    icon: failed === 0 ? CircleCheck : CircleAlert,
    label: t("readiness.verified"),
    body:
      failed === 0
        ? t("readiness.verified.pass", { count: checks, planId: plan.id })
        : t("readiness.verified.fail", { count: failed }),
    tone: failed === 0 ? "info" : "warn",
  });

  rows.push({
    icon: Info,
    label: t("readiness.restore"),
    body: ramdiskProvider ? t("readiness.restore.ramdisk") : t("readiness.restore.kernel"),
    tone: "info",
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("readiness.title")}</CardTitle>
        <CardDescription>{t("readiness.intro")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.label + row.body} className="flex items-start gap-2">
            <row.icon
              className={row.tone === "warn" ? "mt-0.5 size-3.5 shrink-0 text-warning" : "mt-0.5 size-3.5 shrink-0 text-muted-foreground"}
              aria-hidden
            />
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-medium text-foreground">{row.label}</p>
              <p className="text-[11px] leading-4 text-muted-foreground">{row.body}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** The setting name the metadata records for the AVB bytes; not imported from core to keep this presentational. */
const KEEP_SIGNATURE = "keepSignature";
