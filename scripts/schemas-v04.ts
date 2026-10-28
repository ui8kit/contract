// Source of the Codex v0.4 JSON Schemas (draft 2020-12). `bun run gen` writes schemas/*.schema.json and public/*.schema.json.
// Enums and required lists come from src/v04.ts; test/agreement.test.ts keeps keys in sync with src/validate-v04.ts (KEYS_V04) and the TS types.
import { CODEX_V04_VERSION, COMMENT_STATUSES_V04, ENTRY_STATUSES_V04, REQUIRED_V04, TAXONOMY_MODES_V04, VISIBILITIES_V04, WEEKDAYS_V04, schemaUrlV04, type SchemaNameV04 } from "../src/v04.ts";
import { E164_PATTERN, EMAIL_PATTERN, HANDLE_PATTERN, TIME_PATTERN, CLOSE_PATTERN, DATE_PATTERN } from "../src/validate-v04.ts";
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
  required: [...REQUIRED_V04.entry],
  properties: {
    ...common,
    kind: ident,
    status: { enum: [...ENTRY_STATUSES_V04] },
    visibility: { enum: [...VISIBILITIES_V04] },
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
  required: [...REQUIRED_V04.term],
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
      type: "object", additionalProperties: false, required: [...REQUIRED_V04.definition],
      properties: { id: ident, locale, label: nonEmpty, mode: { enum: [...TAXONOMY_MODES_V04] }, assigned_to_kinds: { type: "array", minItems: 1, uniqueItems: true, items: ident }, public: bool, version },
    },
  },
};

export const comment = {
  ...meta("comment", "Codex v0.4 Comment (statuses as in WordPress core)"),
  type: "object", additionalProperties: false,
  required: [...REQUIRED_V04.comment],
  properties: { ...common, entry_id: nonEmpty, parent_id: str, author_id: str, author_name: str, content: str, status: { enum: [...COMMENT_STATUSES_V04] } },
};

export const menu = {
  ...meta("menu", "Codex v0.4 Menu (labels are plain strings; translations live in dictionaries)"),
  type: "object", additionalProperties: false, required: [...REQUIRED_V04.menu],
  properties: {
    id: nonEmpty, location: nonEmpty, locale,
    items: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: [...REQUIRED_V04.menuItem],
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
  type: "object", additionalProperties: false, required: [...REQUIRED_V04.dictionary],
  properties: { locale, source_locale: locale, messages: { type: "object", additionalProperties: str } },
};

// settings: contact block, opening hours, map (all optional; nested values are never empty)
const contactLink = {
  type: "object", additionalProperties: false, required: [...REQUIRED_V04.contactLink],
  properties: { network: ident, handle: { type: "string", pattern: HANDLE_PATTERN.source, description: "Network id without spaces: Telegram username without @, WhatsApp number in E.164, profile name" } },
};
const contact = {
  description: "Contact data. address is localized (one per settings record / locale); the other fields are the same in every locale.",
  type: "object", additionalProperties: false,
  properties: {
    phone: { type: "string", pattern: E164_PATTERN.source, description: "E.164, e.g. +12025550143" },
    email: { type: "string", pattern: EMAIL_PATTERN.source, "x-ui-hint": "email", description: "A string with UI hint email (not a separate type)" },
    address: { ...nonEmpty, description: "Postal address in the record's locale" },
    links: { type: "array", minItems: 1, items: contactLink, description: "Messengers and social profiles; source order kept, never sorted" },
  },
};
const hhmm = (p: RegExp, d: string) => ({ type: "string", pattern: p.source, description: d });
const hoursRule = {
  type: "object", additionalProperties: false, required: [...REQUIRED_V04.hoursRule],
  properties: {
    days: { type: "array", minItems: 1, uniqueItems: true, items: { enum: [...WEEKDAYS_V04] } },
    open: hhmm(TIME_PATTERN, "HH:MM, 00:00 to 23:59"),
    close: hhmm(CLOSE_PATTERN, "HH:MM, 00:00 to 24:00; earlier than open = past midnight; never equal to open"),
  },
};
const hoursException = {
  type: "object", additionalProperties: false, required: [...REQUIRED_V04.hoursException],
  properties: {
    date: { type: "string", pattern: DATE_PATTERN.source, description: "YYYY-MM-DD in settings.timezone" },
    closed: { const: true },
    open: hhmm(TIME_PATTERN, "HH:MM"),
    close: hhmm(CLOSE_PATTERN, "HH:MM, up to 24:00"),
  },
  // {date, closed: true} or {date, open, close}: one more key than date, open and close together, closed excludes them
  minProperties: 2,
  dependentRequired: { open: ["close"], close: ["open"] },
  dependentSchemas: { closed: { properties: { open: false, close: false } } },
};
const map = {
  description: "Map pin: provider and/or WGS 84 coordinates (lat and lng together)",
  type: "object", additionalProperties: false, minProperties: 1,
  properties: { provider: ident, lat: { type: "number", minimum: -90, maximum: 90 }, lng: { type: "number", minimum: -180, maximum: 180 } },
  dependentRequired: { lat: ["lng"], lng: ["lat"] },
};

export const settings = {
  ...meta("settings", "Codex v0.4 site settings (one record per site and locale)"),
  type: "object", additionalProperties: false,
  required: [...REQUIRED_V04.settings],
  properties: {
    ...common,
    title: nonEmpty, description: str, language: locale,
    timezone: { type: "string", description: "IANA time zone, e.g. Europe/Moscow" },
    logo_media_id: str, icon_media_id: str,
    front_page_id: { type: "string", description: "Entry shown on the front page; absent = latest posts" },
    posts_page_id: str,
    posts_per_page: { type: "integer", minimum: 1 },
    comments_open: { type: "boolean", description: "Default for new entries" },
    currency: { type: "string", pattern: "^[A-Z]{3}$", description: "ISO 4217; default currency of money fields (integer minor units)" },
    contact,
    hours: { type: "array", items: hoursRule, description: "Weekly opening hours in timezone; days not named are closed; source order kept" },
    hours_exceptions: { type: "array", items: hoursException, description: "Dates replacing the weekly hours: {date, closed: true} or {date, open, close}; one per date" },
    map,
  },
};

/** The manifest shape is unchanged in v0.4; only the id moves to the v0.4 line. */
export const manifest = { ...manifestV03, ...meta("manifest", "Codex v0.4 Manifest (unchanged from v0.3)") };

export const revision = {
  ...meta("revision", "Codex v0.4 Revision (bound to (entry_id, locale))"),
  type: "object", additionalProperties: false,
  required: [...REQUIRED_V04.revision],
  properties: { id: nonEmpty, entry_id: nonEmpty, locale, version, snapshot: { $ref: schemaUrlV04("entry") }, author_id: nonEmpty, reason: str, created_at: time },
};

export const ALL_V04 = { entry, term, taxonomy, comment, menu, dictionary, settings, manifest, revision } as const;
