export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map((entry) => canonicalize(entry)).join(",") + "]";
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return (
    "{" +
    keys.map((key) => JSON.stringify(key) + ":" + canonicalize(record[key])).join(",") +
    "}"
  );
}
