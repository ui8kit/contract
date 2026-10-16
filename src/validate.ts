// Validation of a Codex snapshot (manifest + entries), a TypeScript port of the checks in
//   github.com/fastygo/codex (content.Entry.Validate, schema.Manifest.Validate, schema.Resource.ValidateEntry)
//   github.com/fastygo/modules/content-json (strict decode, kind in manifest, duplicate ids, parent / relation / term references)
// Ported from ui8kit/spline-svelte (packages/content). Issue codes follow the Go names where one exists.
// `extra.*` codes are stricter than the Go loader and are marked as such.
import type { Entry, Field, Relation, Resource } from "./codex.js";
import { RULE_INTEGER, RULE_URI } from "./codex.js";

export type Issue = { code: string; path: string; message: string };
export type RawEntry = { file: string; data: unknown };
export type ValidateOptions = {
  /** Also run the `extra.*` checks, stricter than the Go loader (author_id is a `user` entry, terms are `term` entries). Default false. */
  extra?: boolean;
};

const STATUSES = ["draft", "scheduled", "published", "archived", "trashed"];
const VISIBILITIES = ["public", "private"];
const CHROME = ["slug", "title", "content", "excerpt"];
const IDENT = /^[a-z][a-z0-9_-]{0,62}$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Allowed wire keys per object (strict decode). Exported for the schema/type agreement test. */
export const KEYS = {
  manifest: ["name", "version", "resources"],
  resource: ["record", "taxonomies"],
  record: ["id", "label", "description", "schema_version", "owner_module", "scope", "fields", "relations", "capabilities", "visibility"],
  field: ["id", "label", "type", "namespace", "owner_module", "description", "required", "localized", "default_value", "options", "rules", "items", "fields", "searchable", "indexed", "unique", "sensitive", "encrypted", "ui_hint", "storage_hint"],
  option: ["value", "label"],
  rule: ["name", "message", "args", "severity"],
  relation: ["id", "label", "source", "target", "cardinality", "inverse_name", "cross_workspace_policy", "policy", "delete_behavior"],
  policy: ["cross_workspace_mode", "allowed_targets", "capability", "read_only"],
  entry: ["id", "kind", "status", "visibility", "slug", "title", "content", "excerpt", "author_id", "parent_id", "featured_media_id", "template", "metadata", "locales", "terms", "version", "created_at", "updated_at", "published_at", "deleted_at"],
  metadata: ["value", "private"],
  locale: ["data", "status", "updated_at"],
  term: ["taxonomy", "term_id"],
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const blank = (v: unknown) => str(v).trim() === "";
type Add = (code: string, path: string, message: string) => void;

export function validateSnapshot(manifestRaw: unknown, entriesRaw: RawEntry[], options: ValidateOptions = {}): Issue[] {
  const extra = options.extra === true;
  const issues: Issue[] = [];
  const add: Add = (code, path, message) => issues.push({ code, path, message });
  const closed = (o: Obj, allowed: string[], path: string) => { for (const k of Object.keys(o)) if (!allowed.includes(k)) add("decode.unknown_field", `${path}.${k}`, `unknown field "${k}"`); };

  // ---- manifest
  const mpath = "manifest.json";
  if (!isObj(manifestRaw)) { add("schema.manifest.invalid", mpath, "manifest must be an object"); return issues; }
  closed(manifestRaw, KEYS.manifest, mpath);
  if (blank(manifestRaw.name)) add("schema.manifest.name_required", `${mpath}.name`, "manifest name is required");
  if (blank(manifestRaw.version)) add("schema.manifest.version_required", `${mpath}.version`, "manifest version is required");
  if (!Array.isArray(manifestRaw.resources)) add("schema.manifest.resources_required", `${mpath}.resources`, "resources must be an array");
  const resources = Array.isArray(manifestRaw.resources) ? (manifestRaw.resources as unknown[]) : [];
  const byKind = new Map<string, Resource>();
  const relationIds = new Set<string>();

  const checkField = (f: unknown, path: string, nested: boolean) => {
    if (!isObj(f)) return add("schema.field.invalid", path, "field must be an object");
    closed(f, KEYS.field, path);
    if (blank(f.id)) add("schema.field.id_required", path, "field id is required");
    if (blank(f.label)) add("schema.field.label_required", path, `field "${str(f.id)}" label is required`);
    if (blank(f.type)) add("schema.field.type_required", path, `field "${str(f.id)}" type is required`);
    if (f.type === "collection" && !f.items) add("schema.field.items_required", path, "collection requires items");
    if (f.type !== "collection" && f.items) add("schema.field.items_type", path, "items require collection type");
    if (f.type === "object" && !(Array.isArray(f.fields) && f.fields.length)) add("schema.field.fields_required", path, "object requires fields");
    if (f.type !== "object" && f.fields) add("schema.field.fields_type", path, "nested fields require object type");
    if (nested && f.localized) add("schema.field.nested_localized", path, "nested field cannot be localized");
    if (nested && f.type === "relation") add("schema.field.nested_relation", path, "relation field must be top-level");
    for (const o of (f.options as unknown[] | undefined) ?? []) if (isObj(o)) closed(o, KEYS.option, `${path}.options`);
    const seen = new Set<string>();
    for (const r of (f.rules as unknown[] | undefined) ?? []) {
      if (!isObj(r)) continue;
      closed(r, KEYS.rule, `${path}.rules`);
      if (blank(r.name)) add("schema.field.rule_name_required", path, "field rule name is required");
      if (seen.has(str(r.name))) add("schema.field.rule_duplicated", path, "field rule is duplicated");
      seen.add(str(r.name));
      if (r.name === RULE_INTEGER && f.type !== "number") add("schema.field.rule_type", path, "integer rule requires a number field");
      if (r.name === RULE_URI && f.type !== "string") add("schema.field.rule_type", path, "uri rule requires a string field");
    }
    if (f.items) checkField(f.items, `${path}.items`, true);
    for (const n of (f.fields as unknown[] | undefined) ?? []) checkField(n, `${path}.fields`, true);
  };

  for (const [i, r] of resources.entries()) {
    const rp = `${mpath}.resources[${i}]`;
    if (!isObj(r) || !isObj(r.record)) { add("schema.resource.record_required", rp, "resource.record is required"); continue; }
    closed(r, KEYS.resource, rp);
    const rec = r.record;
    closed(rec, KEYS.record, `${rp}.record`);
    const id = str(rec.id);
    if (!IDENT.test(id)) add("schema.resource.id_invalid", `${rp}.record.id`, `resource identifier "${id}" is invalid`);
    if (blank(rec.label)) add("schema.record.label_required", `${rp}.record.label`, "record label is required");
    if (blank(rec.scope)) add("schema.record.scope_required", `${rp}.record.scope`, "record scope is required");
    if (byKind.has(id)) add("schema.manifest.resource_duplicated", rp, `resource "${id}" is duplicated`);
    const fseen = new Set<string>();
    for (const f of (rec.fields as unknown[] | undefined) ?? []) {
      checkField(f, `${rp}.record.fields`, false);
      if (!isObj(f)) continue;
      if (fseen.has(str(f.id))) add("schema.record.field_duplicated", `${rp}.record.fields`, `field "${str(f.id)}" is duplicated`);
      fseen.add(str(f.id));
      if (CHROME.includes(str(f.id)) && !f.localized) add("schema.field.chrome_not_localized", `${rp}.record.fields.${str(f.id)}`, "entry chrome field must be localized");
    }
    const tax = (r.taxonomies as string[] | undefined) ?? [];
    if (new Set(tax).size !== tax.length) add("schema.resource.taxonomy_duplicated", `${rp}.taxonomies`, "resource taxonomy is duplicated");
    for (const t of tax) if (!IDENT.test(t)) add("schema.resource.taxonomy_invalid", `${rp}.taxonomies`, `taxonomy identifier "${t}" is invalid`);
    byKind.set(id, r as unknown as Resource);
  }
  for (const [kind, res] of byKind) {
    for (const rel of (res.record.relations ?? []) as Relation[]) {
      const p = `${mpath}.${kind}.relations.${rel.id}`;
      closed(rel as unknown as Obj, KEYS.relation, p);
      if (rel.policy) closed(rel.policy as Obj, KEYS.policy, `${p}.policy`);
      if (relationIds.has(rel.id)) add("schema.manifest.relation_duplicated", p, "relation identifier is duplicated");
      relationIds.add(rel.id);
      if (rel.source !== kind) add("schema.relation.source_mismatch", p, "relation source does not match owning resource");
      if (!byKind.has(rel.target)) add("schema.relation.target_missing", p, "relation target record is missing");
      if (!rel.cardinality) add("schema.relation.cardinality_required", p, "relation cardinality is required");
      const f = (res.record.fields ?? []).find((x) => x.id === rel.id);
      if (!f) add("schema.relation.field_missing", p, "relation requires a field with the same id");
      else if (f.type !== "relation") add("schema.relation.field_type", p, "relation field has invalid type");
      else if (f.localized) add("schema.relation.localized", p, "relation field cannot be localized");
    }
    for (const f of res.record.fields ?? []) if (f.type === "relation" && !(res.record.relations ?? []).some((r) => r.id === f.id)) add("schema.relation.missing", `${mpath}.${kind}.fields.${f.id}`, "relation field has no relation");
  }

  // ---- entries
  const entries = new Map<string, Entry>();
  const fileOf = new Map<string, string>();
  for (const { file: ep, data } of entriesRaw) {
    if (!isObj(data)) { add("decode.invalid", ep, "entry must be an object"); continue; }
    const before = issues.length;
    checkEntryShape(data, ep, add);
    const e = data as unknown as Entry;
    const id = str(e.id);
    if (issues.length > before) continue;
    if (entries.has(id)) { add("load.duplicate_id", ep, `duplicate entry id "${id}" (also in ${fileOf.get(id)})`); continue; }
    const res = byKind.get(e.kind);
    if (!res) { add("load.kind_not_in_manifest", `${ep}.kind`, `entry kind "${e.kind}" is not declared by the manifest`); continue; }
    entries.set(id, e); fileOf.set(id, ep);
    checkEntry(e, res, ep, add);
  }

  // ---- references (content-json validateReferences)
  const isTerm = (taxonomy: string, id: string) => { const t = entries.get(id); return !!t && t.kind === "term" && t.metadata?.taxonomy?.value === taxonomy; };
  for (const e of entries.values()) {
    const res = byKind.get(e.kind)!; const ep = fileOf.get(e.id)!;
    for (const t of e.terms ?? []) {
      if (!(res.taxonomies ?? []).includes(t.taxonomy)) add("load.taxonomy_not_assigned", `${ep}.terms`, `entry uses taxonomy "${t.taxonomy}", which is not assigned to kind "${e.kind}"`);
      else if (extra && byKind.has("term") && !isTerm(t.taxonomy, t.term_id)) add("extra.term_missing", `${ep}.terms`, `term "${t.term_id}" is not a "term" entry of taxonomy "${t.taxonomy}" (stricter than the Go loader)`);
    }
    for (const rel of res.record.relations ?? []) {
      const v = e.metadata?.[rel.id]?.value;
      if (v == null) continue;
      for (const target of Array.isArray(v) ? (v as string[]) : [v as string]) {
        const t = entries.get(target);
        if (!t) add("load.relation_missing", `${ep}.metadata.${rel.id}`, `relation "${rel.id}" references missing entry "${target}"`);
        else if (t.kind !== rel.target) add("load.relation_kind", `${ep}.metadata.${rel.id}`, `relation "${rel.id}" targets kind "${rel.target}", entry "${target}" has kind "${t.kind}"`);
      }
    }
    if (e.parent_id) {
      const p = entries.get(e.parent_id);
      if (!p) add("load.parent_missing", `${ep}.parent_id`, `entry references missing parent "${e.parent_id}"`);
      else if (p.kind !== e.kind) add("load.parent_kind", `${ep}.parent_id`, `parent "${e.parent_id}" has kind "${p.kind}", expected "${e.kind}"`);
    }
    if (extra && e.author_id && byKind.has("user") && entries.get(e.author_id)?.kind !== "user") add("extra.author_missing", `${ep}.author_id`, `author "${e.author_id}" is not a "user" entry (stricter than the Go loader)`);
  }
  for (const e of entries.values()) {
    const seen = new Set<string>([e.id]);
    for (let p = e.parent_id; p; p = entries.get(p)?.parent_id) {
      if (seen.has(p)) { add("load.parent_cycle", fileOf.get(e.id)!, `parent cycle includes entry "${e.id}"`); break; }
      seen.add(p);
    }
  }
  return issues;
}

const closedWith = (add: Add) => (o: Obj, allowed: string[], path: string) => { for (const k of Object.keys(o)) if (!allowed.includes(k)) add("decode.unknown_field", `${path}.${k}`, `unknown field "${k}"`); };
const ts = (v: unknown) => (typeof v === "string" && RFC3339.test(v) ? Date.parse(v) : NaN);
const hasText = (m: unknown) => isObj(m) && Object.values(m).some((v) => !blank(v));
const canonicalLocale = (loc: string) => !!loc && loc === loc.trim().toLowerCase();

// content.Entry.Validate + strict decode of one entry
function checkEntryShape(data: Obj, ep: string, add: Add) {
  const closed = closedWith(add);
  closed(data, KEYS.entry, ep);
  const e = data as unknown as Entry;
  const id = str(e.id);
  if (blank(id)) add("content.entry.id_required", `${ep}.id`, "content id is required");
  if (!IDENT.test(str(e.kind))) add("content.entry.kind_invalid", `${ep}.kind`, "content kind is invalid");
  if (!STATUSES.includes(str(e.status))) add("content.entry.status_invalid", `${ep}.status`, "content status is invalid");
  if (!VISIBILITIES.includes(str(e.visibility))) add("content.entry.visibility_invalid", `${ep}.visibility`, "content visibility is invalid");
  if (!Number.isInteger(e.version) || e.version < 1) add("content.entry.version_required", `${ep}.version`, "content version is required");
  if (Number.isNaN(ts(e.created_at)) || Number.isNaN(ts(e.updated_at))) add("content.entry.timestamps_required", `${ep}.created_at`, "created_at and updated_at must be RFC 3339");
  else if (ts(e.updated_at) < ts(e.created_at)) add("content.entry.timestamps_order", `${ep}.updated_at`, "updated_at precedes created_at");
  if (e.parent_id && e.parent_id === id) add("content.entry.parent_self", `${ep}.parent_id`, "content cannot be its own parent");
  if (e.status === "scheduled" && !e.published_at) add("content.entry.published_at_required", `${ep}.published_at`, "scheduled content requires published_at");
  if (e.status === "trashed" && !e.deleted_at) add("content.entry.deleted_at_required", `${ep}.deleted_at`, "trashed content requires deleted_at");
  if (e.published_at && Number.isNaN(ts(e.published_at))) add("content.entry.published_at_invalid", `${ep}.published_at`, "published_at must be RFC 3339");
  if (!hasText(e.slug)) add("content.entry.slug_required", `${ep}.slug`, "content slug is required");
  if (!hasText(e.title)) add("content.entry.title_required", `${ep}.title`, "content title is required");
  for (const k of CHROME) {
    const m = (e as unknown as Obj)[k];
    if (m === undefined) continue;
    if (!isObj(m)) { add("content.entry.localized_text_invalid", `${ep}.${k}`, "localized text must be an object"); continue; }
    for (const [loc, v] of Object.entries(m)) {
      if (!loc || loc !== loc.trim().toLowerCase()) add("content.locale.noncanonical", `${ep}.${k}.${loc}`, "localized text locale is not canonical");
      if (typeof v !== "string") add("content.entry.localized_text_invalid", `${ep}.${k}.${loc}`, "localized text must be a string");
    }
  }
  for (const [k, mv] of Object.entries(e.metadata ?? {})) {
    if (!k.trim()) add("content.metadata.key_required", `${ep}.metadata`, "metadata key is required");
    if (!isObj(mv)) add("content.metadata.value_invalid", `${ep}.metadata.${k}`, "metadata value must be {value, private?}");
    else closed(mv, KEYS.metadata, `${ep}.metadata.${k}`);
  }
  for (const [loc, d] of Object.entries(e.locales ?? {})) {
    if (!loc || loc !== loc.trim().toLowerCase()) add("content.locale.noncanonical", `${ep}.locales.${loc}`, "content locale is not canonical");
    if (!isObj(d) || !isObj(d.data)) { add("content.locale.data_required", `${ep}.locales.${loc}`, "locale data is required"); continue; }
    closed(d, KEYS.locale, `${ep}.locales.${loc}`);
    if (!STATUSES.includes(str(d.status))) add("content.locale.status_invalid", `${ep}.locales.${loc}.status`, "content locale status is invalid");
  }
  const seenTerm = new Set<string>();
  for (const t of e.terms ?? []) {
    if (!isObj(t)) { add("content.term_ref.incomplete", `${ep}.terms`, "term reference must be an object"); continue; }
    closed(t, KEYS.term, `${ep}.terms`);
    if (!IDENT.test(str(t.taxonomy)) || blank(t.term_id)) add("content.term_ref.incomplete", `${ep}.terms`, "content term reference is incomplete");
    const key = `${t.taxonomy}/${t.term_id}`;
    if (seenTerm.has(key)) add("content.term_ref.duplicated", `${ep}.terms`, "content term reference is duplicated");
    seenTerm.add(key);
  }
}

function checkLocalizedText(m: unknown, path: string, add: Add) {
  if (m === undefined) return;
  if (!isObj(m)) return add("content.entry.localized_text_invalid", path, "localized text must be an object");
  for (const [loc, v] of Object.entries(m)) {
    if (!canonicalLocale(loc)) add("content.locale.noncanonical", `${path}.${loc}`, "localized text locale is not canonical");
    if (typeof v !== "string") add("content.entry.localized_text_invalid", `${path}.${loc}`, "localized text must be a string");
  }
}

export const TAXONOMY_KEYS = {
  bundle: ["definition", "terms"],
  definition: ["id", "label", "mode", "assigned_to_kinds", "public", "version"],
  term: ["id", "taxonomy_id", "name", "slug", "description", "parent_id", "version"],
};

/** taxonomy.ValidateHierarchy on a `{definition, terms}` bundle (the conformance fixture shape). Reports all issues, Go stops at the first. */
export function validateTaxonomy(raw: unknown, path = "taxonomy"): Issue[] {
  const issues: Issue[] = [];
  const add: Add = (code, p, message) => issues.push({ code, path: p, message });
  const closed = closedWith(add);
  if (!isObj(raw) || !isObj(raw.definition)) { add("decode.invalid", path, "taxonomy bundle must be {definition, terms}"); return issues; }
  closed(raw, TAXONOMY_KEYS.bundle, path);
  const d = raw.definition, dp = `${path}.definition`;
  closed(d, TAXONOMY_KEYS.definition, dp);
  if (!IDENT.test(str(d.id))) add("taxonomy.definition.id_invalid", `${dp}.id`, "taxonomy id is invalid");
  if (!Number.isInteger(d.version) || (d.version as number) < 1) add("taxonomy.definition.version_required", `${dp}.version`, "taxonomy version is required");
  if (d.mode !== "flat" && d.mode !== "hierarchical") add("taxonomy.definition.mode_invalid", `${dp}.mode`, "taxonomy mode is invalid");
  const kinds = Array.isArray(d.assigned_to_kinds) ? d.assigned_to_kinds : [];
  if (!kinds.length) add("taxonomy.definition.kinds_required", `${dp}.assigned_to_kinds`, "taxonomy requires at least one resource kind");
  const seenKind = new Set<unknown>();
  for (const k of kinds) {
    if (!IDENT.test(str(k))) add("taxonomy.definition.kind_invalid", `${dp}.assigned_to_kinds`, "taxonomy resource kind is invalid");
    if (seenKind.has(k)) add("taxonomy.definition.kind_duplicated", `${dp}.assigned_to_kinds`, "taxonomy resource kind is duplicated");
    seenKind.add(k);
  }
  if (!hasText(d.label)) add("taxonomy.definition.label_required", `${dp}.label`, "taxonomy label is required");
  checkLocalizedText(d.label, `${dp}.label`, add);
  const terms = Array.isArray(raw.terms) ? raw.terms : [];
  const byId = new Map<string, Obj>();
  for (const [i, t] of terms.entries()) {
    const tp = `${path}.terms[${i}]`;
    if (!isObj(t)) { add("decode.invalid", tp, "term must be an object"); continue; }
    closed(t, TAXONOMY_KEYS.term, tp);
    const id = str(t.id);
    if (blank(id)) add("taxonomy.term.id_required", `${tp}.id`, "term id is required");
    if (t.taxonomy_id !== d.id) add("taxonomy.term.definition_mismatch", `${tp}.taxonomy_id`, "term taxonomy does not match definition");
    if (!Number.isInteger(t.version) || (t.version as number) < 1) add("taxonomy.term.version_required", `${tp}.version`, "term version is required");
    if (t.parent_id && t.parent_id === t.id) add("taxonomy.term.parent_self", `${tp}.parent_id`, "term cannot be its own parent");
    if (d.mode === "flat" && t.parent_id) add("taxonomy.term.parent_flat", `${tp}.parent_id`, "flat taxonomy cannot contain parent terms");
    if (!hasText(t.name)) add("taxonomy.term.name_required", `${tp}.name`, "term name is required");
    if (!hasText(t.slug)) add("taxonomy.term.slug_required", `${tp}.slug`, "term slug is required");
    for (const k of ["name", "slug", "description"]) checkLocalizedText(t[k], `${tp}.${k}`, add);
    if (byId.has(id)) add("taxonomy.hierarchy.term_duplicated", tp, "term id is duplicated");
    byId.set(id, t);
  }
  for (const t of byId.values()) {
    const seen = new Set<string>([str(t.id)]);
    for (let p = str(t.parent_id); p; p = str(byId.get(p)?.parent_id)) {
      if (seen.has(p)) { add("taxonomy.hierarchy.cycle", `${path}.terms`, "taxonomy hierarchy contains a cycle"); break; }
      seen.add(p);
      if (!byId.has(p)) { add("taxonomy.hierarchy.parent_missing", `${path}.terms`, `taxonomy parent "${p}" does not exist`); break; }
    }
  }
  return issues;
}

export const REVISION_KEYS = ["id", "entry_id", "version", "snapshot", "author_id", "reason", "created_at"];

/** revision.Revision.Validate, including content.Entry.Validate on the snapshot. */
export function validateRevision(raw: unknown, path = "revision"): Issue[] {
  const issues: Issue[] = [];
  const add: Add = (code, p, message) => issues.push({ code, path: p, message });
  if (!isObj(raw)) { add("decode.invalid", path, "revision must be an object"); return issues; }
  closedWith(add)(raw, REVISION_KEYS, path);
  const snap = isObj(raw.snapshot) ? raw.snapshot : undefined;
  if (blank(raw.id)) add("revision.id_required", `${path}.id`, "revision id is required");
  if (blank(raw.entry_id)) add("revision.entry_required", `${path}.entry_id`, "revision entry id is required");
  else if (raw.entry_id !== snap?.id) add("revision.entry_mismatch", `${path}.snapshot.id`, "revision snapshot entry does not match");
  if (!Number.isInteger(raw.version) || (raw.version as number) < 1 || raw.version !== snap?.version) add("revision.version_mismatch", `${path}.version`, "revision version does not match snapshot");
  if (blank(raw.author_id)) add("revision.author_required", `${path}.author_id`, "revision author is required");
  if (Number.isNaN(ts(raw.created_at))) add("revision.created_at_required", `${path}.created_at`, "revision created_at is required");
  if (!snap) add("decode.invalid", `${path}.snapshot`, "snapshot must be an entry object");
  else checkEntryShape(snap, `${path}.snapshot`, add);
  return issues;
}

// schema.Resource.ValidateEntry
function checkEntry(e: Entry, res: Resource, ep: string, add: Add) {
  const fields = res.record.fields ?? [];
  const shared = fields.filter((f) => !f.localized);
  const localized = fields.filter((f) => f.localized);
  const chrome = e as unknown as Record<string, Record<string, string> | undefined>;
  for (const f of localized) if (e.metadata && f.id in e.metadata) add("schema.entry.field_location", `${ep}.metadata.${f.id}`, "localized field must be stored in locale data");
  for (const [loc, d] of Object.entries(e.locales ?? {})) for (const f of shared) if (f.id in d.data) add("schema.entry.field_location", `${ep}.locales.${loc}.${f.id}`, "non-localized field must be stored in metadata");
  const bind = (list: Field[], values: Record<string, unknown>, where: string) => {
    for (const f of list) {
      const v = values[f.id];
      if (v === undefined || v === null || v === "") { if (f.required) add("schema.entry.field_invalid", `${ep}.${where}.${f.id}`, "required"); continue; }
      const bad = typeIssue(f, v);
      if (bad) add("schema.entry.field_invalid", `${ep}.${where}.${f.id}`, bad);
    }
  };
  bind(shared, Object.fromEntries(Object.entries(e.metadata ?? {}).map(([k, m]) => [k, m.value])), "metadata");
  const locs = new Set<string>([...Object.keys(e.locales ?? {}), ...CHROME.flatMap((k) => Object.keys(chrome[k] ?? {}))]);
  for (const loc of [...locs].sort()) {
    const doc: Record<string, unknown> = { ...(e.locales?.[loc]?.data ?? {}) };
    for (const f of localized) {
      if (!CHROME.includes(f.id)) continue;
      const v = chrome[f.id]?.[loc];
      if (v === undefined) continue;
      if (f.id in doc && doc[f.id] !== v) add("schema.entry.localized_conflict", `${ep}.locales.${loc}.${f.id}`, "field differs between entry chrome and locale document");
      doc[f.id] = v;
    }
    bind(localized, doc, `locales.${loc}`);
  }
  for (const rel of res.record.relations ?? []) {
    const v = e.metadata?.[rel.id]?.value;
    if (v == null) continue;
    if (rel.cardinality === "one-to-one") { if (typeof v !== "string" || !v.trim()) add("schema.entry.relation_scalar", `${ep}.metadata.${rel.id}`, "relation requires one id"); }
    else if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !x.trim())) add("schema.entry.relation_array", `${ep}.metadata.${rel.id}`, "relation requires an id array");
  }
}

function typeIssue(f: Field, v: unknown): string | null {
  switch (f.type) {
    case "number": if (typeof v !== "number") return "type"; break;
    case "boolean": if (typeof v !== "boolean") return "type"; break;
    case "select": if (typeof v !== "string") return "type"; if (f.options?.length && !f.options.some((o) => o.value === v)) return "option"; break;
    case "text": case "string": case "textarea": case "richtext": case "markdown": case "datetime": if (typeof v !== "string") return "type"; break;
  }
  for (const r of f.rules ?? []) {
    if (r.name === RULE_INTEGER && !(typeof v === "number" && Number.isInteger(v))) return "value must be an integer";
    if (r.name === RULE_URI) { try { new URL(String(v)); } catch { return "value must be a URI"; } }
  }
  return null;
}

// Codex v0.4 core validator (current contract).
export { ISSUE_CODES_V04, WARNING_CODES_V04, type IssueCodeV04 } from "./codes-v04.js";
export { validateCollectionV04, checkEntryV04, checkTermV04, checkCommentV04, checkMenuV04, checkDictionaryV04, checkSettingsV04, KEYS_V04, type IssueV04, type ValidateV04Options, type RecordFile, type CollectionV04 } from "./validate-v04.js";
