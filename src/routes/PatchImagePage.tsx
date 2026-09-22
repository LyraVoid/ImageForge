import { ErrorPanel } from "@/components/app/error-panel";
import { ImagePicker } from "@/components/app/image-picker";
import { useT } from "@/i18n/use-translation";
import { useForgeStore } from "@/stores/forge-store";

/** The patcher's first step: everything starts with an image. */
export function PatchImagePage() {
  const t = useT();
  const error = useForgeStore((state) => state.error);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-6 sm:py-10">
      <div className="space-y-2 text-center">
        <h1 className="text-balance-tight text-xl font-semibold tracking-tight">{t("tool.patch.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("tool.patch.description")}</p>
      </div>

      <ErrorPanel error={error} />

      <ImagePicker />
    </div>
  );
}
