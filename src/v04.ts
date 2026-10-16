// Codex v0.4 core (draft, see docs/core-draft.md): one neutral shape for every platform.
// Differences from v0.3: texts are plain strings in one `locale`; the record key is (id, locale);
// translations of long texts are separate records with the same id; short UI strings live in dictionaries.
// New entry fields: order, pinned, format, discussion, origin. New entry status: pending.
// Platform fields (WordPress password, guid, ...) are NOT part of the core; adapters keep them on their side.
import { SCHEMA_BASE_URL } from "./codex.js";

export const CODEX_V04_VERSION = "0.4.0";
/** v0.4 is published at stable, unversioned URLs (no consumers yet); versioned URLs start at v0.5. */
export const SCHEMA_LINE_V04 = "v0.4";
export type SchemaNameV04 = "entry" | "term" | "taxonomy" | "comment" | "menu" | "dictionary" | "settings" | "manifest" | "revision";
export const schemaUrlV04 = (name: SchemaNameV04) => `${SCHEMA_BASE_URL}/${name}.schema.json`;

export const ENTRY_STATUSES_V04 = ["draft", "pending", "scheduled", "published", "archived", "trashed"] as const;
export const COMMENT_STATUSES_V04 = ["approved", "hold", "spam", "trash"] as const;
export type EntryStatusV04 = (typeof ENTRY_STATUSES_V04)[number];
export type CommentStatusV04 = (typeof COMMENT_STATUSES_V04)[number];
export const VISIBILITIES_V04 = ["public", "private"] as const;
export type VisibilityV04 = (typeof VISIBILITIES_V04)[number];
export const TAXONOMY_MODES_V04 = ["flat", "hierarchical"] as const;

/**
 * Required fields of each record type. Single source for the JSON Schemas (scripts/schemas-v04.ts) and the TS types:
 * test/agreement.test.ts proves the schemas, the types and the validator agree.
 */
export const REQUIRED_V04 = {
  entry: ["id", "locale", "kind", "status", "visibility", "slug", "title", "version", "created_at", "updated_at"],
  term: ["id", "locale", "taxonomy_id", "name", "slug", "version", "created_at", "updated_at"],
  definition: ["id", "locale", "label", "mode", "assigned_to_kinds", "version"],
  comment: ["id", "entry_id", "content", "status", "version", "created_at", "updated_at"],
  menu: ["id", "location", "locale", "items"],
  menuItem: ["id", "label", "url"],
  dictionary: ["locale", "messages"],
  settings: ["id", "locale", "title", "language", "version", "created_at", "updated_at"],
  revision: ["id", "entry_id", "locale", "version", "snapshot", "author_id", "created_at"],
} as const;

/** Where a record came from (migrations). `id` is always a string, even for numeric platform ids. */
export type Origin = { system: string; id: string };
/** Typed value: numbers stay numbers, booleans stay booleans. Adapters coerce platform strings. */
export type MetaValueV04 = { value: unknown; private?: boolean };
export type TermRefV04 = { taxonomy: string; term_id: string };
export type Discussion = { comments: boolean; pings: boolean };

type Common = {
  id: string;
  /** BCP 47 tag, e.g. "ru", "en-US". The record key is (id, locale). */
  locale: string;
  origin?: Origin[];
  metadata?: Record<string, MetaValueV04>;
  version: number;
  created_at: string;
  updated_at: string;
};

/** Entry of any kind: post, page, media, user, settings, review, lead, deal, ... Kind-specific fields go to metadata. */
export type EntryV04 = Common & {
  kind: string;
  status: EntryStatusV04;
  visibility: VisibilityV04;
  slug: string;
  title: string;
  content?: string;
  excerpt?: string;
  author_id?: string;
  parent_id?: string;
  featured_media_id?: string;
  template?: string;
  terms?: TermRefV04[];
  order?: number;
  pinned?: boolean;
  format?: string;
  discussion?: Discussion;
  published_at?: string;
  deleted_at?: string;
};

export type TaxonomyDefinitionV04 = {
  id: string; locale: string; label: string; mode: (typeof TAXONOMY_MODES_V04)[number]; assigned_to_kinds: string[]; public?: boolean; version: number;
};
/** A term; its translation is another TermV04 with the same id and another locale. */
export type TermV04 = Common & {
  taxonomy_id: string; name: string; slug: string; description?: string; parent_id?: string;
};
export type TaxonomyBundleV04 = { definition: TaxonomyDefinitionV04; terms: TermV04[] };

export type CommentV04 = Omit<Common, "locale"> & {
  locale?: string;
  entry_id: string; parent_id?: string; author_id?: string; author_name?: string; content: string; status: CommentStatusV04;
};

export type MenuItemV04 = { id: string; label: string; url: string; parent_id?: string; order?: number; target?: { kind: string; id: string } };
export type MenuV04 = { id: string; location: string; locale: string; items: MenuItemV04[] };

/** Short strings only (menu labels, UI). Keys: `menu:<menu>:<item>:label`, `ui:<key>`. */
export type DictionaryV04 = { locale: string; source_locale?: string; messages: Record<string, string> };

export type RevisionV04 = { id: string; entry_id: string; locale: string; version: number; snapshot: EntryV04; author_id: string; reason?: string; created_at: string };

/**
 * Site settings (one record per site and locale, usually id "site"). Money fields of entries are integer minor units;
 * `currency` here is the default when an entry has no own `currency` metadata.
 */
export type SettingsV04 = {
  id: string;
  locale: string;
  title: string;
  description?: string;
  /** BCP 47 language of the site UI, e.g. "en-US". */
  language: string;
  /** IANA time zone, e.g. "Europe/Moscow". */
  timezone?: string;
  logo_media_id?: string;
  icon_media_id?: string;
  /** Entry shown on the front page; absent = latest posts. */
  front_page_id?: string;
  /** Entry that lists posts when the front page is static. */
  posts_page_id?: string;
  posts_per_page?: number;
  /** Default for new entries: comments open. */
  comments_open?: boolean;
  /** ISO 4217 code, e.g. "USD". */
  currency?: string;
  origin?: Origin[];
  metadata?: Record<string, MetaValueV04>;
  version: number;
  created_at: string;
  updated_at: string;
};
