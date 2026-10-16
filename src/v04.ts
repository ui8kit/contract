// Codex v0.4 core (draft, see docs/core-draft.md): one neutral shape for every platform.
// Differences from v0.3: texts are plain strings in one `locale`; the record key is (id, locale);
// translations of long texts are separate records with the same id; short UI strings live in dictionaries.
// New entry fields: order, pinned, format, discussion, origin. New entry status: pending.
// Platform fields (WordPress password, guid, ...) are NOT part of the core; adapters keep them on their side.
import { SCHEMA_BASE_URL } from "./codex.js";

export const CODEX_V04_VERSION = "0.4.0";
/** v0.4 is published at stable, unversioned URLs (no consumers yet); versioned URLs start at v0.5. */
export const SCHEMA_LINE_V04 = "v0.4";
export type SchemaNameV04 = "entry" | "term" | "taxonomy" | "comment" | "menu" | "dictionary" | "manifest" | "revision";
export const schemaUrlV04 = (name: SchemaNameV04) => `${SCHEMA_BASE_URL}/${name}.schema.json`;

export const ENTRY_STATUSES_V04 = ["draft", "pending", "scheduled", "published", "archived", "trashed"] as const;
export const COMMENT_STATUSES_V04 = ["approved", "hold", "spam", "trash"] as const;
export type EntryStatusV04 = (typeof ENTRY_STATUSES_V04)[number];
export type CommentStatusV04 = (typeof COMMENT_STATUSES_V04)[number];
export type VisibilityV04 = "public" | "private";

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
  id: string; locale: string; label: string; mode: "flat" | "hierarchical"; assigned_to_kinds: string[]; public?: boolean; version: number;
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
