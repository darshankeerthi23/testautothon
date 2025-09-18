// Centralized helpers to normalize fields across organizer data variations

export type AnyRec = Record<string, any>;

export const CATEGORY_KEYS = [
  "category", "failure_category", "label", "class", "type", "root_cause", "rca"
];

export const MESSAGE_KEYS = [
  "message", "error", "error_message", "failure_message", "reason", "details", "description", "summary"
];

export const STACK_KEYS = ["stack", "stacktrace", "trace"];

export const SUITE_KEYS = ["suite", "suite_name", "suiteId", "feature", "module"];
export const COMPONENT_KEYS = ["component", "module", "area", "service", "package", "screen"];

export function pickFirst(rec: AnyRec, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = rec?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

export function buildText(rec: AnyRec): string {
  const msg = pickFirst(rec, MESSAGE_KEYS) || "";
  const stk = pickFirst(rec, STACK_KEYS) || "";
  const mod = pickFirst(rec, COMPONENT_KEYS) || "";
  const suite = pickFirst(rec, SUITE_KEYS) || "";
  const code = String(rec?.status || rec?.http_status || rec?.code || rec?.httpCode || "");
  return [msg, stk, mod, suite, code].filter(Boolean).join("\n");
}

export function getCategory(rec: AnyRec): string | undefined {
  return pickFirst(rec, CATEGORY_KEYS);
}

export function getComponent(rec: AnyRec): string | undefined {
  return pickFirst(rec, COMPONENT_KEYS);
}
