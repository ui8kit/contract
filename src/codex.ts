// LEGACY: Codex v0.3.0 shapes, kept so Library/readers/defineAdapter and the v0.3 validator keep working.
// The current contract is Codex v0.4 (src/v04.ts); only v0.4 JSON Schemas are published.
// TypeScript shapes of the Codex JSON wire contract (github.com/fastygo/codex, v0.3.0):
// content.Entry, schema.Manifest, taxonomy.Definition/Term/Assignment, revision.Revision.
// Field names are the wire names (snake_case) on purpose. Timestamps are RFC 3339 strings.

/** Codex release the published schemas follow (v0.4 core, see src/v04.ts). */
export const CODEX_VERSION = "0.4.0";
/** Codex line label. Schema URLs are unversioned until v0.5. */
export const SCHEMA_LINE = "v0.4";
/** Codex release of the legacy types in this file. */
export const CODEX_V03_VERSION = "0.3.0";
export const CODEX_MODULE = "github.com/fastygo/codex";
export const CODEX_REPOSITORY = "https://github.com/fastygo/codex";
/** Base URL of the public schema site. Deployed from main on Vercel. */
export const SCHEMA_BASE_URL = "https://schema.buildy.tw";
/** Stable URL of a published v0.4 schema (unversioned until v0.5). */
export const schemaUrl = (name: "entry" | "term" | "taxonomy" | "comment" | "menu" | "dictionary" | "manifest" | "revision") =>
  `${SCHEMA_BASE_URL}/${name}.schema.json`;

export type Status = "draft" | "scheduled" | "published" | "archived" | "trashed";
export type Visibility = "public" | "private";
export type LocalizedText = Record<string, string>;
export type TermRef = { taxonomy: string; term_id: string };
export type MetadataValue = { value: unknown; private?: boolean };
export type LocaleDocument = { data: Record<string, unknown>; status: Status; updated_at?: string };

export type Entry = {
  id: string;
  kind: string;
  status: Status;
  visibility: Visibility;
  slug: LocalizedText;
  title: LocalizedText;
  content?: LocalizedText;
  excerpt?: LocalizedText;
  author_id?: string;
  parent_id?: string;
  featured_media_id?: string;
  template?: string;
  metadata?: Record<string, MetadataValue>;
  locales?: Record<string, LocaleDocument>;
  terms?: TermRef[];
  version: number;
  created_at: string;
  updated_at: string;
  published_at?: string;
  deleted_at?: string;
};

export type FieldType = "text" | "string" | "textarea" | "richtext" | "markdown" | "number" | "boolean" | "select" | "datetime" | "json" | "object" | "relation" | "collection" | "computed" | "encrypted";
export type Scope = "global" | "workspace" | "tenant" | "user";
export type Cardinality = "one-to-one" | "one-to-many" | "many-to-many";
export type DeleteBehavior = "restrict" | "cascade" | "nullify";
export type Option = { value: string; label: string };
export type ValidationRule = { name: string; message?: string; args?: Record<string, string>; severity?: string };
export type Field = {
  id: string; label: string; type: FieldType | (string & {});
  namespace?: string; owner_module?: string; description?: string; required?: boolean; localized?: boolean; default_value?: string;
  options?: Option[]; rules?: ValidationRule[]; items?: Field; fields?: Field[];
  searchable?: boolean; indexed?: boolean; unique?: boolean; sensitive?: boolean; encrypted?: boolean; ui_hint?: string; storage_hint?: string;
};
export type RelationPolicy = { cross_workspace_mode?: string; allowed_targets?: string[]; capability?: string; read_only?: boolean };
export type Relation = {
  id: string; label?: string; source: string; target: string; cardinality: Cardinality | (string & {});
  inverse_name?: string; cross_workspace_policy?: string; policy?: RelationPolicy;
  delete_behavior?: DeleteBehavior | (string & {});
};
export type RecordType = {
  id: string; label: string; description?: string; schema_version?: string; owner_module?: string; scope: Scope | (string & {});
  fields?: Field[]; relations?: Relation[]; capabilities?: string[]; visibility?: string;
};
export type Resource = { record: RecordType; taxonomies?: string[] };
export type Manifest = { name: string; version: string; resources: Resource[] };

export type TaxonomyMode = "flat" | "hierarchical";
export type TaxonomyDefinition = {
  id: string; label: LocalizedText; mode: TaxonomyMode; assigned_to_kinds: string[]; public?: boolean; version: number;
};
export type Term = {
  id: string; taxonomy_id: string; name: LocalizedText; slug: LocalizedText; description?: LocalizedText; parent_id?: string; version: number;
};
export type TaxonomyAssignment = { resource_kind: string; resource_id: string; taxonomy_id: string; term_id: string };
/** Shape of the conformance fixture `topic.taxonomy.json` (conformance.TaxonomyBundle). */
export type TaxonomyBundle = { definition: TaxonomyDefinition; terms: Term[] };

export type Revision = {
  id: string; entry_id: string; version: number; snapshot: Entry; author_id: string; reason?: string; created_at: string;
};

export const RULE_INTEGER = "fastygo.codex/integer";
export const RULE_DECIMAL = "fastygo.codex/decimal";
export const RULE_MONEY = "fastygo.codex/money";
export const RULE_DATE = "fastygo.codex/date";
export const RULE_URI = "fastygo.codex/uri";
export const RULE_UUID = "fastygo.codex/uuid";
export const RULE_NULLABLE = "fastygo.codex/nullable";
export const RULE_READ_ONLY = "fastygo.codex/read-only";
export const RULE_JSON_ANY = "fastygo.codex/json-any";
