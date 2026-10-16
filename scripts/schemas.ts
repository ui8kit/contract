// LEGACY v0.3 JSON Schema pieces. Not published any more; scripts/schemas-v04.ts reuses the manifest shape from here.
// Kept in sync with src/codex.ts by test/schemas.test.ts (keys, required fields, fixtures through ajv and the TS validator).
import { CODEX_V03_VERSION as CODEX_VERSION, SCHEMA_BASE_URL } from "../src/codex.ts";
const schemaUrl = (name: string) => `${SCHEMA_BASE_URL}/legacy-v0.3/${name}.schema.json`;

const S = "https://json-schema.org/draft/2020-12/schema";
const str = { type: "string" };
const nonEmpty = { type: "string", minLength: 1, pattern: "\\S" };
const ident = { type: "string", pattern: "^[a-z][a-z0-9_-]{0,62}$" };
const version = { type: "integer", minimum: 1 };
const time = { type: "string", format: "date-time" };
const bool = { type: "boolean" };
const strArr = { type: "array", items: str };
const status = { enum: ["draft", "scheduled", "published", "archived", "trashed"] };
const localized = { $ref: "#/$defs/LocalizedText" };
const localizedDef = {
  description: "Locale -> text. Locale keys must be canonical (lower-case, trimmed); `und` is the neutral locale.",
  type: "object",
  propertyNames: { pattern: "^[a-z0-9]+([_-][a-z0-9]+)*$" },
  additionalProperties: str,
};
const meta = (name: string, title: string) => ({
  $schema: S,
  $id: schemaUrl(name as never),
  title,
  description: `Codex v${CODEX_VERSION} wire contract (github.com/fastygo/codex). Structural check only; semantic rules (cross-references, field placement, timestamps order) are in the @ui8kit/contract validator.`,
  "x-codex-version": CODEX_VERSION,
});

export const entry = {
  ...meta("entry", "Codex Entry (content.Entry)"),
  $ref: "#/$defs/Entry",
  $defs: {
    LocalizedText: localizedDef,
    Entry: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "status", "visibility", "slug", "title", "version", "created_at", "updated_at"],
      properties: {
        id: nonEmpty, kind: ident, status, visibility: { enum: ["public", "private"] },
        slug: localized, title: localized, content: localized, excerpt: localized,
        author_id: str, parent_id: str, featured_media_id: str, template: str,
        metadata: {
          type: "object",
          additionalProperties: { type: "object", additionalProperties: false, required: ["value"], properties: { value: {}, private: bool } },
        },
        locales: {
          type: "object",
          propertyNames: localizedDef.propertyNames,
          additionalProperties: {
            type: "object", additionalProperties: false, required: ["data", "status"],
            properties: { data: { type: "object" }, status, updated_at: time },
          },
        },
        terms: {
          type: "array",
          items: { type: "object", additionalProperties: false, required: ["taxonomy", "term_id"], properties: { taxonomy: ident, term_id: nonEmpty } },
        },
        version, created_at: time, updated_at: time, published_at: time, deleted_at: time,
      },
    },
  },
};

const field = {
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "type"],
  properties: {
    id: nonEmpty, label: nonEmpty,
    type: { description: "Known: text string textarea richtext markdown number boolean select datetime json object relation collection computed encrypted. Unknown non-empty types stay valid.", ...nonEmpty },
    namespace: str, owner_module: str, description: str, required: bool, localized: bool, default_value: str,
    options: { type: "array", items: { type: "object", additionalProperties: false, required: ["value", "label"], properties: { value: str, label: str } } },
    rules: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["name"], properties: { name: nonEmpty, message: str, args: { type: "object", additionalProperties: str }, severity: str } },
    },
    items: { $ref: "#/$defs/Field" },
    fields: { type: "array", items: { $ref: "#/$defs/Field" } },
    searchable: bool, indexed: bool, unique: bool, sensitive: bool, encrypted: bool, ui_hint: str, storage_hint: str,
  },
};
const relation = {
  type: "object",
  additionalProperties: false,
  required: ["id", "source", "target", "cardinality"],
  properties: {
    id: nonEmpty, label: str, source: ident, target: ident,
    cardinality: { description: "Known: one-to-one one-to-many many-to-many.", ...nonEmpty },
    inverse_name: str, cross_workspace_policy: str,
    policy: { type: "object", additionalProperties: false, properties: { cross_workspace_mode: str, allowed_targets: strArr, capability: str, read_only: bool } },
    delete_behavior: { description: "Known: restrict cascade nullify.", type: "string" },
  },
};
const record = {
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "scope"],
  properties: {
    id: ident, label: nonEmpty, description: str, schema_version: str, owner_module: str,
    scope: { description: "Known: global workspace tenant user.", ...nonEmpty },
    fields: { type: "array", items: { $ref: "#/$defs/Field" } },
    relations: { type: "array", items: { $ref: "#/$defs/Relation" } },
    capabilities: strArr, visibility: str,
  },
};
export const manifest = {
  ...meta("manifest", "Codex Manifest (schema.Manifest)"),
  $ref: "#/$defs/Manifest",
  $defs: {
    Manifest: {
      type: "object", additionalProperties: false, required: ["name", "version", "resources"],
      properties: { name: nonEmpty, version: nonEmpty, resources: { type: "array", items: { $ref: "#/$defs/Resource" } } },
    },
    Resource: {
      type: "object", additionalProperties: false, required: ["record"],
      properties: { record: { $ref: "#/$defs/RecordType" }, taxonomies: { type: "array", uniqueItems: true, items: ident } },
    },
    RecordType: record, Field: field, Relation: relation,
  },
};

export const taxonomy = {
  ...meta("taxonomy", "Codex taxonomy bundle (taxonomy.Definition + []taxonomy.Term)"),
  $ref: "#/$defs/TaxonomyBundle",
  $defs: {
    LocalizedText: localizedDef,
    TaxonomyBundle: {
      type: "object", additionalProperties: false, required: ["definition", "terms"],
      properties: { definition: { $ref: "#/$defs/Definition" }, terms: { type: "array", items: { $ref: "#/$defs/Term" } } },
    },
    Definition: {
      type: "object", additionalProperties: false, required: ["id", "label", "mode", "assigned_to_kinds", "version"],
      properties: {
        id: ident, label: localized, mode: { enum: ["flat", "hierarchical"] },
        assigned_to_kinds: { type: "array", minItems: 1, uniqueItems: true, items: ident }, public: bool, version,
      },
    },
    Term: {
      type: "object", additionalProperties: false, required: ["id", "taxonomy_id", "name", "slug", "version"],
      properties: { id: nonEmpty, taxonomy_id: ident, name: localized, slug: localized, description: localized, parent_id: str, version },
    },
    Assignment: {
      type: "object", additionalProperties: false, required: ["resource_kind", "resource_id", "taxonomy_id", "term_id"],
      properties: { resource_kind: ident, resource_id: nonEmpty, taxonomy_id: ident, term_id: nonEmpty },
    },
  },
};

export const revision = {
  ...meta("revision", "Codex Revision (revision.Revision)"),
  type: "object", additionalProperties: false,
  required: ["id", "entry_id", "version", "snapshot", "author_id", "created_at"],
  properties: {
    id: nonEmpty, entry_id: nonEmpty, version, snapshot: { $ref: schemaUrl("entry") },
    author_id: nonEmpty, reason: str, created_at: time,
  },
};

export const ALL = { entry, manifest, taxonomy, revision } as const;
