// Validator for the Codex v0.4 core (docs/core-draft.md). Structure + the set rules:
//   (id, locale) unique per record type; entry slug unique within (kind, locale, parent_id);
//   term slug unique within (taxonomy_id, locale, parent_id); entry/comment status enums.
import { COMMENT_STATUSES_V04, ENTRY_STATUSES_V04 } from "./v04.js";

export type IssueV04 = { code: string; path: string; message: string };
export type RecordFile = { file: string; data: unknown };
export type CollectionV04 = { entries?: RecordFile[]; terms?: RecordFile[]; comments?: RecordFile[]; menus?: RecordFile[]; dictionaries?: RecordFile[] };

export const KEYS_V04 = {
  entry: ["id", "locale", "kind", "status", "visibility", "slug", "title", "content", "excerpt", "author_id", "parent_id", "featured_media_id", "template", "terms", "order", "pinned", "format", "discussion", "origin", "metadata", "version", "created_at", "updated_at", "published_at", "deleted_at"],
  term: ["id", "locale", "taxonomy_id", "name", "slug", "description", "parent_id", "origin", "metadata", "version", "created_at", "updated_at"],
  definition: ["id", "locale", "label", "mode", "assigned_to_kinds", "public", "version"],
  comment: ["id", "locale", "entry_id", "parent_id", "author_id", "author_name", "content", "status", "origin", "metadata", "version", "created_at", "updated_at"],
  menu: ["id", "location", "locale", "items"],
  menuItem: ["id", "label", "url", "parent_id", "order", "target"],
  dictionary: ["locale", "source_locale", "messages"],
  origin: ["system", "id"],
  metadata: ["value", "private"],
  termRef: ["taxonomy", "term_id"],
  discussion: ["comments", "pings"],
  target: ["kind", "id"],
};

const IDENT = /^[a-z][a-z0-9_-]{0,62}$/;
const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
type Obj = Record<string, unknown>;
type Add = (code: string, path: string, message: string) => void;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const blank = (v: unknown) => str(v).trim() === "";
const ts = (v: unknown) => (typeof v === "string" && RFC3339.test(v) ? Date.parse(v) : NaN);
const closed = (add: Add, o: Obj, keys: string[], p: string) => { for (const k of Object.keys(o)) if (!keys.includes(k)) add("decode.unknown_field", `${p}.${k}`, `unknown field "${k}"`); };

function common(o: Obj, p: string, add: Add, localeRequired = true) {
  if (blank(o.id)) add("core.id_required", `${p}.id`, "id is required");
  if (o.locale !== undefined || localeRequired) if (!LOCALE.test(str(o.locale))) add("core.locale_invalid", `${p}.locale`, "locale must be a BCP 47 tag like \"ru\" or \"en-US\"");
  if (!Number.isInteger(o.version) || (o.version as number) < 1) add("core.version_required", `${p}.version`, "version must be an integer >= 1");
  if (Number.isNaN(ts(o.created_at)) || Number.isNaN(ts(o.updated_at))) add("core.timestamps_required", `${p}.created_at`, "created_at and updated_at must be RFC 3339");
  else if (ts(o.updated_at) < ts(o.created_at)) add("core.timestamps_order", `${p}.updated_at`, "updated_at precedes created_at");
  if (o.origin !== undefined) {
    if (!Array.isArray(o.origin)) add("core.origin_invalid", `${p}.origin`, "origin must be an array");
    else for (const [i, x] of o.origin.entries()) {
      if (!isObj(x)) { add("core.origin_invalid", `${p}.origin[${i}]`, "origin item must be {system, id}"); continue; }
      closed(add, x, KEYS_V04.origin, `${p}.origin[${i}]`);
      if (blank(x.system) || typeof x.id !== "string" || blank(x.id)) add("core.origin_invalid", `${p}.origin[${i}]`, "origin needs a non-empty system and a string id");
    }
  }
  if (o.metadata !== undefined) {
    if (!isObj(o.metadata)) add("core.metadata_invalid", `${p}.metadata`, "metadata must be an object");
    else for (const [k, mv] of Object.entries(o.metadata)) {
      if (!k.trim()) add("core.metadata_key_required", `${p}.metadata`, "metadata key is required");
      if (!isObj(mv) || !("value" in mv)) add("core.metadata_invalid", `${p}.metadata.${k}`, "metadata value must be {value, private?}");
      else { closed(add, mv, KEYS_V04.metadata, `${p}.metadata.${k}`); if (mv.private !== undefined && typeof mv.private !== "boolean") add("core.metadata_invalid", `${p}.metadata.${k}.private`, "private must be boolean"); }
    }
  }
}

export function checkEntryV04(o: unknown, p: string, add: Add) {
  if (!isObj(o)) return add("decode.invalid", p, "entry must be an object");
  closed(add, o, KEYS_V04.entry, p);
  common(o, p, add);
  if (!IDENT.test(str(o.kind))) add("core.entry.kind_invalid", `${p}.kind`, "kind is invalid");
  if (!(ENTRY_STATUSES_V04 as readonly string[]).includes(str(o.status))) add("core.entry.status_invalid", `${p}.status`, `status must be one of ${ENTRY_STATUSES_V04.join(", ")}`);
  if (o.visibility !== "public" && o.visibility !== "private") add("core.entry.visibility_invalid", `${p}.visibility`, "visibility must be public or private");
  if (blank(o.slug)) add("core.entry.slug_required", `${p}.slug`, "slug is required (string)");
  if (typeof o.title !== "string") add("core.entry.title_required", `${p}.title`, "title is required (string, may be empty)");
  for (const k of ["content", "excerpt", "author_id", "parent_id", "featured_media_id", "template", "format"]) if (o[k] !== undefined && typeof o[k] !== "string") add("core.entry.type", `${p}.${k}`, `${k} must be a string`);
  if (o.parent_id && o.parent_id === o.id) add("core.entry.parent_self", `${p}.parent_id`, "entry cannot be its own parent");
  if (o.order !== undefined && !Number.isInteger(o.order)) add("core.entry.type", `${p}.order`, "order must be an integer");
  if (o.pinned !== undefined && typeof o.pinned !== "boolean") add("core.entry.type", `${p}.pinned`, "pinned must be boolean");
  if (o.discussion !== undefined) {
    if (!isObj(o.discussion) || typeof o.discussion.comments !== "boolean" || typeof o.discussion.pings !== "boolean") add("core.entry.type", `${p}.discussion`, "discussion must be {comments: boolean, pings: boolean}");
    else closed(add, o.discussion, KEYS_V04.discussion, `${p}.discussion`);
  }
  if (o.status === "scheduled" && !o.published_at) add("core.entry.published_at_required", `${p}.published_at`, "scheduled entry requires published_at");
  if (o.status === "trashed" && !o.deleted_at) add("core.entry.deleted_at_required", `${p}.deleted_at`, "trashed entry requires deleted_at");
  for (const k of ["published_at", "deleted_at"]) if (o[k] !== undefined && Number.isNaN(ts(o[k]))) add("core.entry.time_invalid", `${p}.${k}`, `${k} must be RFC 3339`);
  if (o.terms !== undefined) {
    if (!Array.isArray(o.terms)) add("core.entry.terms_invalid", `${p}.terms`, "terms must be an array");
    else {
      const seen = new Set<string>();
      for (const t of o.terms) {
        if (!isObj(t) || !IDENT.test(str(t.taxonomy)) || blank(t.term_id)) { add("core.term_ref.incomplete", `${p}.terms`, "term reference must be {taxonomy, term_id}"); continue; }
        closed(add, t, KEYS_V04.termRef, `${p}.terms`);
        const key = `${t.taxonomy}/${t.term_id}`;
        if (seen.has(key)) add("core.term_ref.duplicated", `${p}.terms`, `term reference ${key} is duplicated`);
        seen.add(key);
      }
    }
  }
}

export function checkTermV04(o: unknown, p: string, add: Add) {
  if (!isObj(o)) return add("decode.invalid", p, "term must be an object");
  closed(add, o, KEYS_V04.term, p);
  common(o, p, add);
  if (!IDENT.test(str(o.taxonomy_id))) add("core.term.taxonomy_invalid", `${p}.taxonomy_id`, "taxonomy_id is invalid");
  if (blank(o.name)) add("core.term.name_required", `${p}.name`, "name is required");
  if (blank(o.slug)) add("core.term.slug_required", `${p}.slug`, "slug is required");
  if (o.description !== undefined && typeof o.description !== "string") add("core.term.type", `${p}.description`, "description must be a string");
  if (o.parent_id && o.parent_id === o.id) add("core.term.parent_self", `${p}.parent_id`, "term cannot be its own parent");
}

export function checkCommentV04(o: unknown, p: string, add: Add) {
  if (!isObj(o)) return add("decode.invalid", p, "comment must be an object");
  closed(add, o, KEYS_V04.comment, p);
  common(o, p, add, false);
  if (blank(o.entry_id)) add("core.comment.entry_required", `${p}.entry_id`, "entry_id is required");
  if (typeof o.content !== "string") add("core.comment.content_required", `${p}.content`, "content is required");
  if (!(COMMENT_STATUSES_V04 as readonly string[]).includes(str(o.status))) add("core.comment.status_invalid", `${p}.status`, `status must be one of ${COMMENT_STATUSES_V04.join(", ")}`);
}

export function checkMenuV04(o: unknown, p: string, add: Add) {
  if (!isObj(o)) return add("decode.invalid", p, "menu must be an object");
  closed(add, o, KEYS_V04.menu, p);
  if (blank(o.id)) add("core.id_required", `${p}.id`, "id is required");
  if (blank(o.location)) add("core.menu.location_required", `${p}.location`, "location is required");
  if (!LOCALE.test(str(o.locale))) add("core.locale_invalid", `${p}.locale`, "locale must be a BCP 47 tag");
  if (!Array.isArray(o.items)) return add("core.menu.items_required", `${p}.items`, "items must be an array");
  const ids = new Set<string>();
  for (const [i, it] of o.items.entries()) {
    const ip = `${p}.items[${i}]`;
    if (!isObj(it)) { add("decode.invalid", ip, "menu item must be an object"); continue; }
    closed(add, it, KEYS_V04.menuItem, ip);
    if (blank(it.id) || blank(it.label) || blank(it.url)) add("core.menu.item_incomplete", ip, "menu item needs id, label and url");
    if (ids.has(str(it.id))) add("core.menu.item_duplicated", ip, `menu item "${str(it.id)}" is duplicated`);
    ids.add(str(it.id));
    if (it.target !== undefined) { if (!isObj(it.target) || blank(it.target.kind) || blank(it.target.id)) add("core.menu.target_invalid", `${ip}.target`, "target must be {kind, id}"); else closed(add, it.target, KEYS_V04.target, `${ip}.target`); }
  }
  for (const it of o.items) if (isObj(it) && it.parent_id && !ids.has(str(it.parent_id))) add("core.menu.parent_missing", p, `menu item parent "${str(it.parent_id)}" does not exist`);
}

export function checkDictionaryV04(o: unknown, p: string, add: Add) {
  if (!isObj(o)) return add("decode.invalid", p, "dictionary must be an object");
  closed(add, o, KEYS_V04.dictionary, p);
  if (!LOCALE.test(str(o.locale))) add("core.locale_invalid", `${p}.locale`, "locale must be a BCP 47 tag");
  if (o.source_locale !== undefined && !LOCALE.test(str(o.source_locale))) add("core.locale_invalid", `${p}.source_locale`, "source_locale must be a BCP 47 tag");
  if (!isObj(o.messages)) return add("core.dictionary.messages_required", `${p}.messages`, "messages must be an object");
  for (const [k, v] of Object.entries(o.messages)) if (typeof v !== "string") add("core.dictionary.value_invalid", `${p}.messages.${k}`, "message must be a string");
}

/** Validates a collection of v0.4 records: each record's shape, then the uniqueness rules and references. */
export function validateCollectionV04(c: CollectionV04): IssueV04[] {
  const issues: IssueV04[] = [];
  const add: Add = (code, path, message) => issues.push({ code, path, message });
  const run = (list: RecordFile[] | undefined, check: (o: unknown, p: string, add: Add) => void) => {
    const ok: { file: string; o: Obj }[] = [];
    for (const { file, data } of list ?? []) { const n = issues.length; check(data, file, add); if (issues.length === n) ok.push({ file, o: data as Obj }); }
    return ok;
  };
  const unique = (list: { file: string; o: Obj }[], code: string, key: (o: Obj) => string, what: string) => {
    const seen = new Map<string, string>();
    for (const { file, o } of list) { const k = key(o); if (seen.has(k)) add(code, file, `${what} ${k} is duplicated (also in ${seen.get(k)})`); else seen.set(k, file); }
  };
  const entries = run(c.entries, checkEntryV04);
  const terms = run(c.terms, checkTermV04);
  const comments = run(c.comments, checkCommentV04);
  const menus = run(c.menus, checkMenuV04);
  run(c.dictionaries, checkDictionaryV04);

  unique(entries, "core.entry.key_duplicated", (o) => `(${o.id}, ${o.locale})`, "entry key");
  unique(entries, "core.entry.slug_duplicated", (o) => `(${o.kind}, ${o.locale}, ${str(o.parent_id) || "-"}) slug "${o.slug}"`, "entry slug in");
  unique(terms, "core.term.key_duplicated", (o) => `(${o.id}, ${o.locale})`, "term key");
  unique(terms, "core.term.slug_duplicated", (o) => `(${o.taxonomy_id}, ${o.locale}, ${str(o.parent_id) || "-"}) slug "${o.slug}"`, "term slug in");
  unique(comments, "core.comment.key_duplicated", (o) => `(${o.id}, ${str(o.locale) || "-"})`, "comment key");
  unique(menus, "core.menu.key_duplicated", (o) => `(${o.id}, ${o.locale})`, "menu key");

  const entryById = new Map<string, Obj>(entries.map(({ o }) => [str(o.id), o]));
  const termIds = new Set(terms.map(({ o }) => `${o.taxonomy_id}/${o.id}`));
  for (const { file, o } of entries) {
    if (o.parent_id) { const par = entryById.get(str(o.parent_id)); if (!par) add("core.entry.parent_missing", `${file}.parent_id`, `parent "${o.parent_id}" does not exist`); else if (par.kind !== o.kind) add("core.entry.parent_kind", `${file}.parent_id`, `parent "${o.parent_id}" has another kind`); }
    if (terms.length) for (const t of (o.terms as Obj[] | undefined) ?? []) if (!termIds.has(`${t.taxonomy}/${t.term_id}`)) add("core.term_ref.missing", `${file}.terms`, `term ${t.taxonomy}/${t.term_id} does not exist`);
  }
  const termById = new Map<string, Obj>(terms.map(({ o }) => [`${o.taxonomy_id}/${o.id}`, o]));
  for (const { file, o } of terms) if (o.parent_id && !termById.has(`${o.taxonomy_id}/${o.parent_id}`)) add("core.term.parent_missing", `${file}.parent_id`, `parent term "${o.parent_id}" does not exist`);
  if (entries.length) for (const { file, o } of comments) if (!entryById.has(str(o.entry_id))) add("core.comment.entry_missing", `${file}.entry_id`, `entry "${o.entry_id}" does not exist`);
  return issues;
}
