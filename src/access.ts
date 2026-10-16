// Reading helpers for Codex entries: localized text, shared metadata, localized field documents, term references.
import type { Entry, LocalizedText } from "./codex.js";

export const CONTENT_LOCALE = "en";

/** text for `locale`, then for the default content locale, then for any locale */
export function pick(text: LocalizedText | undefined, locale = CONTENT_LOCALE): string {
  if (!text) return "";
  return text[locale] ?? text[CONTENT_LOCALE] ?? Object.values(text)[0] ?? "";
}
/** a non-localized field (stored in metadata) */
export function meta<T>(e: Entry, field: string): T | undefined { return e.metadata?.[field]?.value as T | undefined; }
/** a localized field: the entry chrome (title, slug, content, excerpt) or the locale document data */
export function localized(e: Entry, field: string, locale = CONTENT_LOCALE): string {
  const chrome = (e as unknown as Record<string, LocalizedText | undefined>)[field];
  if (chrome && ["slug", "title", "content", "excerpt"].includes(field)) return pick(chrome, locale);
  const doc = e.locales?.[locale] ?? e.locales?.[CONTENT_LOCALE] ?? Object.values(e.locales ?? {})[0];
  const v = doc?.data[field];
  return typeof v === "string" ? v : "";
}
export const termIds = (e: Entry, taxonomy: string) => (e.terms ?? []).filter((t) => t.taxonomy === taxonomy).map((t) => t.term_id);
