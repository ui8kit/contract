// Source of the Codex v0.4 JSON Schemas (draft 2020-12). `bun run gen` writes schemas/v0.4/ and public/v0.4/ (+ /latest/).
// Kept in sync with src/validate-v04.ts (KEYS_V04) by test/v04.test.ts.
import { CODEX_V04_VERSION, COMMENT_STATUSES_V04, ENTRY_STATUSES_V04, schemaUrlV04, type SchemaNameV04 } from "../src/v04.ts";
import { manifest as manifestV03 } from "./schemas.ts";

const S = "https://json-schema.org/draft/2020-12/schema";
const str = { type: "string" };
const nonEmpty = { type: "string", minLength: 1, pattern: "\\S" };
const ident = { type: "string", pattern: "^[a-z][a-z0-9_-]{0,62}$" };
const locale = { type: "string", pattern: "^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$", description: "BCP 47 tag, e.g. ru, en-US. The record key is (id, locale)." };
const version = { type: "integer", minimum: 1 };
const time = { type: "string", format: "date-time" };
const bool = { type: "boolean" };
const origin = {
  description: "Where the record came from (migrations). Platform ids are strings here.",
  type: "array",
  items: { type: "object", additionalProperties: false, required: ["system", "id"], properties: { system: nonEmpty, id: nonEmpty } },
};
const metadata = {
  description: "Typed values: numbers stay numbers, booleans stay booleans.",
  type: "object",
  propertyNames: { pattern: "\\S" },
  additionalProperties: { type: "object", additionalProperties: false, required: ["value"], properties: { value: {}, private: bool } },
};
const common = { id: nonEmpty, locale, origin, metadata, version, created_at: time, updated_at: time };
const meta = (name: SchemaNameV04, title: string) => ({
  $schema: S,
  $id: schemaUrlV04(name),
  title,
  description: `Codex v${CODEX_V04_VERSION} core (draft, docs/core-draft.md in github.com/ui8kit/contract). Structural check only; uniqueness of (id, locale) and slugs is checked by the @ui8kit/contract validator.`,
  "x-codex-version": CODEX_V04_VERSION,
});

export const entry = {
  ...meta("entry", "Codex v0.4 Entry"),
  type: "object", additionalProperties: false,
  required: ["id", "locale", "kind", "status", "visibility", "slug", "title", "version", "created_at", "updated_at"],
  properties: {
    ...common,
    kind: ident,
    status: { enum: [...ENTRY_STATUSES_V04] },
    visibility: { enum: ["public", "private"] },
    slug: nonEmpty, title: str, content: str, excerpt: str,
    author_id: str, parent_id: str, featured_media_id: str, template: str,
    terms: { type: "array", items: { type: "object", additionalProperties: false, required: ["taxonomy", "term_id"], properties: { taxonomy: ident, term_id: nonEmpty } } },
    order: { type: "integer" }, pinned: bool, format: str,
    discussion: { type: "object", additionalProperties: false, required: ["comments", "pings"], properties: { comments: bool, pings: bool } },
    published_at: time, deleted_at: time,
  },
};

export const term = {
  ...meta("term", "Codex v0.4 Term (a translation is another term with the same id and another locale)"),
  type: "object", additionalProperties: false,
  required: ["id", "locale", "taxonomy_id", "name", "slug", "version", "created_at", "updated_at"],
  properties: { ...common, taxonomy_id: ident, name: nonEmpty, slug: nonEmpty, description: str, parent_id: str },
};

export const taxonomy = {
  ...meta("taxonomy", "Codex v0.4 taxonomy bundle (definition + terms)"),
  $ref: "#/$defs/TaxonomyBundle",
  $defs: {
    TaxonomyBundle: {
      type: "object", additionalProperties: false, required: ["definition", "terms"],
      properties: { definition: { $ref: "#/$defs/Definition" }, terms: { type: "array", items: { $ref: schemaUrlV04("term") } } },
    },
    Definition: {
      type: "object", additionalProperties: false, required: ["id", "locale", "label", "mode", "assigned_to_kinds", "version"],
      properties: { id: ident, locale, label: nonEmpty, mode: { enum: ["flat", "hierarchical"] }, assigned_to_kinds: { type: "array", minItems: 1, uniqueItems: true, items: ident }, public: bool, version },
    },
  },
};

export const comment = {
  ...meta("comment", "Codex v0.4 Comment (statuses as in WordPress core)"),
  type: "object", additionalProperties: false,
  required: ["id", "entry_id", "content", "status", "version", "created_at", "updated_at"],
  properties: { ...common, entry_id: nonEmpty, parent_id: str, author_id: str, author_name: str, content: str, status: { enum: [...COMMENT_STATUSES_V04] } },
};

export const menu = {
  ...meta("menu", "Codex v0.4 Menu (labels are plain strings; translations live in dictionaries)"),
  type: "object", additionalProperties: false, required: ["id", "location", "locale", "items"],
  properties: {
    id: nonEmpty, location: nonEmpty, locale,
    items: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["id", "label", "url"],
        properties: {
          id: nonEmpty, label: nonEmpty, url: nonEmpty, parent_id: str, order: { type: "integer" },
          target: { type: "object", additionalProperties: false, required: ["kind", "id"], properties: { kind: ident, id: nonEmpty } },
        },
      },
    },
  },
};

export const dictionary = {
  ...meta("dictionary", "Codex v0.4 dictionary (short strings only: menu labels, UI)"),
  type: "object", additionalProperties: false, required: ["locale", "messages"],
  properties: { locale, source_locale: locale, messages: { type: "object", additionalProperties: str } },
};

/** The manifest shape is unchanged in v0.4; only the id moves to the v0.4 line. */
export const manifest = { ...manifestV03, ...meta("manifest", "Codex v0.4 Manifest (unchanged from v0.3)") };

export const revision = {
  ...meta("revision", "Codex v0.4 Revision (bound to (entry_id, locale))"),
  type: "object", additionalProperties: false,
  required: ["id", "entry_id", "locale", "version", "snapshot", "author_id", "created_at"],
  properties: { id: nonEmpty, entry_id: nonEmpty, locale, version, snapshot: { $ref: schemaUrlV04("entry") }, author_id: nonEmpty, reason: str, created_at: time },
};

export const ALL_V04 = { entry, term, taxonomy, comment, menu, dictionary, manifest, revision } as const;
