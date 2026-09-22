import { Check, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALES } from "@/i18n/locales";
import { useT } from "@/i18n/use-translation";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/locale-store";
import type { Locale } from "@/i18n/locales";

export function LanguageMenu() {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("shell.aria.language")}>
          <Globe />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup value={locale} onValueChange={(value) => setLocale(value as Locale)}>
          {LOCALES.map((entry) => (
            <DropdownMenuRadioItem key={entry.id} value={entry.id} lang={entry.htmlLang}>
              {entry.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The same choice as a segmented control, for the settings page. */
export function LanguageOptions() {
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  return (
    <div className="inline-flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-surface-muted p-0.5">
      {LOCALES.map((entry) => (
        <button
          key={entry.id}
          type="button"
          lang={entry.htmlLang}
          onClick={() => setLocale(entry.id)}
          aria-pressed={locale === entry.id}
          className={cn(
            "inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
            locale === entry.id
              ? "bg-surface text-foreground shadow-subtle"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {locale === entry.id ? <Check className="size-3" aria-hidden /> : null}
          {entry.label}
        </button>
      ))}
    </div>
  );
}
