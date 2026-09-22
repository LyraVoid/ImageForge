import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-translation";

export function NotFoundPage() {
  const t = useT();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 py-16 text-center">
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">404</p>
      <h1 className="text-lg font-semibold">{t("notfound.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("notfound.body")}</p>
      <Button asChild variant="secondary">
        <Link to="/">{t("notfound.back")}</Link>
      </Button>
    </div>
  );
}
