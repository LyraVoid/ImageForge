import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadDiagnostics } from "@/lib/diagnostics";
import { forgeDiagnostics, forgeFactsFromStore } from "@/lib/forge-facts";
import { useT } from "@/i18n/use-translation";
import { useLocaleStore } from "@/stores/locale-store";

/**
 * Exports the facts of this run as JSON: the only thing a user can hand over when something goes
 * wrong. It never contains an image byte or a secret (see `src/lib/forge-facts.ts`).
 */
export function DiagnosticsButton({ className }: { className?: string }) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);

  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => downloadDiagnostics(forgeDiagnostics(locale, forgeFactsFromStore()))}
    >
      <FileDown />
      {t("diagnostics.export")}
    </Button>
  );
}
