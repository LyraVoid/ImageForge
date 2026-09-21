export { formatBytes } from "@/core/binary";

export function formatDateTime(value: string | undefined): string {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function truncateHash(hash: string, head = 12, tail = 8): string {
  if (hash.length <= head + tail + 1) return hash;
  return hash.slice(0, head) + "..." + hash.slice(-tail);
}

export function formatPercent(value: number): string {
  return Math.max(0, Math.min(100, Math.round(value))) + "%";
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? singular + "s");
}

export function formatOffset(offset: number): string {
  return "0x" + offset.toString(16).padStart(8, "0");
}
