import { cn } from "@/lib/utils";

const CELLS = [
  { column: 0, row: 0, accent: false },
  { column: 1, row: 0, accent: false },
  { column: 2, row: 0, accent: true },
  { column: 0, row: 1, accent: false },
  { column: 1, row: 1, accent: true },
  { column: 2, row: 1, accent: false },
  { column: 0, row: 2, accent: true },
  { column: 1, row: 2, accent: false },
  { column: 2, row: 2, accent: false },
] as const;

/**
 * The compact form of the application icon: nine forged pixels, with the same diagonal accents as
 * the installable icon. Kept as SVG so the header stays sharp and theme-independent.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <rect width="64" height="64" rx="12" className="fill-brand-tile" />
      {CELLS.map((cell) => (
        <rect
          key={cell.column + ":" + cell.row}
          x={14 + cell.column * 13}
          y={14 + cell.row * 13}
          width="10"
          height="10"
          rx="2.2"
          className={cell.accent ? "fill-brand-accent" : "fill-brand-cell"}
        />
      ))}
    </svg>
  );
}
