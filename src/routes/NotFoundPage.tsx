import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 py-16 text-center">
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">404</p>
      <h1 className="text-lg font-semibold">This page does not exist</h1>
      <p className="text-sm text-muted-foreground">
        The workflow starts with selecting an Android image.
      </p>
      <Button asChild variant="secondary">
        <Link to="/">Back to the start</Link>
      </Button>
    </div>
  );
}
