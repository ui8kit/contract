// Page spec profile page-spec/v1: the JSON page document a BuildY agent proposes and a host saves, renders and
// regenerates code from (Svelte today; any of the 9 UI8Kit targets later). It is NOT a Codex v0.4 entry: a page spec
// is a layout of Stock catalog blocks with their copy, and the generated code is always derived from it.
// Shape source: buildytech/chat `packages/page-contract` (Page DTO, layout.version 1, `parsePage`) and the browser
// page store (`buildy:v1:pages`, formerly `buildytech-creator-pages-v1`: applied / candidate page + provenance). Saved pages validate unchanged.
// Edits: page-patch/v1 operations (replace a block, set copy or rows, reorder, add, remove) instead of a full new spec.
// Schemas: scripts/schemas-page-spec-v1.ts -> schemas/page-spec.schema.json and schemas/page-patch.schema.json.
// Versioning: page-spec/v1 matches layout.version 1; minor versions only add optional things. Objects are closed.
import { SCHEMA_BASE_URL } from "./codex.js";

export const PAGE_SPEC_PROFILE_V1 = "page-spec/v1";
export const PAGE_SPEC_VERSION_V1 = "1.4.0";
export const PAGE_SPEC_SCHEMA_URL_V1 = `${SCHEMA_BASE_URL}/page-spec.schema.json`;
export const PAGE_PATCH_PROFILE_V1 = "page-patch/v1";
export const PAGE_PATCH_SCHEMA_URL_V1 = `${SCHEMA_BASE_URL}/page-patch.schema.json`;

/** layout.version of a page spec v1. Any other version is rejected. */
export const PAGE_LAYOUT_VERSION_V1 = 1 as const;

/** Closed block kinds (renderer kinds that Stock catalog blocks map onto). */
export const PAGE_BLOCK_KINDS_V1 = [
  "nav", "nav-link", "hero", "features", "feature", "menu", "dish", "hours", "cta", "footer",
  "pagehead", "overview", "metrics", "metric", "chart", "activity", "activity-item", "sidenav", "bottomnav",
] as const;
export type PageBlockKindV1 = (typeof PAGE_BLOCK_KINDS_V1)[number];

/** Kinds that only exist as rows of a list block (never top level in a patch `add` / `replace`). */
export const PAGE_CHILD_KINDS_V1 = ["nav-link", "feature", "dish", "metric", "activity-item"] as const;
export type PageChildKindV1 = (typeof PAGE_CHILD_KINDS_V1)[number];
export const PAGE_SECTION_KINDS_V1 = PAGE_BLOCK_KINDS_V1.filter(
  (k) => !(PAGE_CHILD_KINDS_V1 as readonly string[]).includes(k),
) as Exclude<PageBlockKindV1, PageChildKindV1>[];
export type PageSectionKindV1 = Exclude<PageBlockKindV1, PageChildKindV1>;

/**
 * Closed copy keys. Values are plain text, never markup. 1.1.0 adds `icon` (a Lucide icon name; the host checks it
 * against the Lucide set of its pinned registry snapshot) and `href` (the link of `action`: #fragment, /path,
 * http(s) or mailto).
 */
export const PAGE_COPY_KEYS_V1 = ["eyebrow", "headline", "lede", "action", "note", "brand", "contact", "legal", "days", "address", "value", "badge", "icon", "href"] as const;
/** copy.icon: a Lucide icon name. */
export const PAGE_ICON_PATTERN_V1 = "^[a-z0-9]+(?:-[a-z0-9]+)*$";
export const PAGE_ICON_MAX_LENGTH_V1 = 64;
/** copy.href: a fragment, a site path, an http(s) URL or mailto. */
export const PAGE_HREF_PATTERN_V1 = "^(?:#|/|https?://|mailto:)";

/**
 * Catalog source of a block (1.1.0, optional): `catalogBlock` is the Stock catalog block asset (`block.<name>`, the
 * `spec` of the catalog block index) the block was built from, `variant` one of that block's catalog variants
 * (`block.<name>/<variant>` is the catalog asset id). The host rejects a block or variant its pinned catalog does not
 * have and renders the registry organism of that block with the variant's props; pages without them render as before.
 */
export const PAGE_CATALOG_BLOCK_PATTERN_V1 = "^block\\.[a-z0-9]+(?:-[a-z0-9]+)*$";
export const PAGE_VARIANT_PATTERN_V1 = "^[A-Za-z][A-Za-z0-9-]*$";
export const PAGE_CATALOG_LIMITS_V1 = { maxCatalogBlockLength: 80, maxVariantLength: 40 } as const;
export type PageCopyKeyV1 = (typeof PAGE_COPY_KEYS_V1)[number];

export const PAGE_STATUSES_V1 = ["draft", "pending", "scheduled", "published", "archived", "trashed"] as const;
export type PageStatusV1 = (typeof PAGE_STATUSES_V1)[number];

/**
 * Screen family of a page (1.4.0, provenance only, advisory): derived by the host from the page's composition after
 * every operation (the role majority among dashboard / landing / food-grill / restaurant; mixed -> generic), or pinned
 * by the author. It never rejects a block: it ranks the feed, suggests a preset and the sections to start from.
 */
export const PAGE_FAMILIES_V1 = ["dashboard", "landing", "food-grill", "restaurant", "generic"] as const;
export type PageFamilyV1 = (typeof PAGE_FAMILIES_V1)[number];

/** Host scenario a page was started from (provenance only). */
export const PAGE_SCENARIOS_V1 = ["dashboard", "landing", "website"] as const;
export type PageScenarioV1 = (typeof PAGE_SCENARIOS_V1)[number];

export const PAGE_LIMITS_V1 = {
  maxBlocks: 64, maxDepth: 4, maxIdLength: 63, maxSlugLength: 48, maxTitleLength: 160, maxSummaryLength: 500,
  maxCopyLength: 2000, maxSeoLength: 200, maxLocaleLength: 16, maxJsonChars: 65_536, maxDatetimeLength: 40,
} as const;

/** Patterns of buildytech/chat `parsePage` (ECMA-262). */
export const PAGE_ID_PATTERN_V1 = "^[a-z][a-z0-9-]{0,62}$";
export const PAGE_SLUG_PATTERN_V1 = "^[a-z0-9]+(?:-[a-z0-9]+)*$";
export const PAGE_LOCALE_PATTERN_V1 = "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$";
export const PAGE_DATETIME_PATTERN_V1 = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";

/**
 * Checks a JSON Schema cannot express; every consumer runs them after the schema (codes of `parsePage`):
 * duplicate ids in the whole page (page id included), more than maxBlocks blocks in the tree, payload over maxJsonChars.
 */
export const PAGE_PROGRAM_CHECKS_V1 = ["duplicate_id", "too_many_blocks", "too_large"] as const;

/**
 * Block props overrides (1.3.0): `props` of a top-level block maps JSON Pointers of the props of the registry item its
 * catalog variant renders (registry.buildy.tw/props/v0.json, e.g. `/actions/secondary`, `/content/features`) to
 * values. The host merges them over the variant preset and the page content and validates the merged props against
 * that item's props schema (`x-host-checks`: props_invalid, a pointer the schema does not have or a value it
 * rejects). Consumers without the registry schema keep the map as it is.
 */
export const PAGE_PROPS_POINTER_PATTERN_V1 = "^(?:/(?:[A-Za-z][A-Za-z0-9_]{0,47}|[0-9]{1,2}))+$";
export const PAGE_PROPS_LIMITS_V1 = { maxEntries: 64, maxPointerLength: 200, maxListItems: 24, maxObjectKeys: 32 } as const;
/** Checks that need the host's registry props schema (not the page alone). */
export const PAGE_HOST_CHECKS_V1 = ["props_invalid"] as const;

/**
 * Slots: the copy keys each kind renders (Preview + generated code) and, for list kinds, the row kind and row limit.
 * `badge` (demo-data marker) is a slot of every kind. title and summary are slots of every kind.
 * A saved page may carry other copy keys (older pages); a patch may only write slots (slot validation).
 */
export const PAGE_UNIVERSAL_SLOTS_V1 = ["badge"] as const;
export const PAGE_SLOTS_V1 = {
  nav: { copy: ["brand"], items: { kind: "nav-link", max: 6 } },
  sidenav: { copy: ["brand"], items: { kind: "nav-link", max: 8 } },
  bottomnav: { copy: [], items: { kind: "nav-link", max: 5 } },
  hero: { copy: ["eyebrow", "headline", "lede", "action"] },
  pagehead: { copy: ["headline", "lede"] },
  overview: { copy: ["lede"], items: { kind: "metric", max: 4 } },
  metrics: { copy: ["lede"], items: { kind: "metric", max: 6 } },
  chart: { copy: ["lede"], items: { kind: "metric", max: 12 } },
  activity: { copy: ["lede"], items: { kind: "activity-item", max: 8 } },
  features: { copy: ["action", "href"], items: { kind: "feature", max: 6 } },
  menu: { copy: [], items: { kind: "dish", max: 8 } },
  hours: { copy: ["days", "address"] },
  cta: { copy: ["lede", "action", "note"] },
  footer: { copy: ["contact", "legal"] },
  "nav-link": { copy: ["eyebrow"] },
  feature: { copy: ["icon"] },
  dish: { copy: [] },
  metric: { copy: ["value", "note"] },
  "activity-item": { copy: ["note"] },
} as const satisfies Record<PageBlockKindV1, { copy: readonly PageCopyKeyV1[]; items?: { kind: PageChildKindV1; max: number } }>;

/** Row fields of a list block (patch `items`) and where each lands on the row block. */
export const PAGE_ITEM_FIELDS_V1 = {
  label: { to: "title", max: 80 },
  detail: { to: "summary", max: 200 },
  value: { to: "copy.value", max: 24 },
  note: { to: "copy.note", max: 120 },
  group: { to: "copy.eyebrow", max: 40 },
  icon: { to: "copy.icon", max: 64 },
} as const;
export type PageItemFieldV1 = keyof typeof PAGE_ITEM_FIELDS_V1;
/** Row fields each row kind renders. */
export const PAGE_ITEM_SLOTS_V1 = {
  "nav-link": ["label", "group"],
  feature: ["label", "detail", "icon"],
  dish: ["label", "detail"],
  metric: ["label", "value", "note"],
  "activity-item": ["label", "detail", "note"],
} as const satisfies Record<PageChildKindV1, readonly PageItemFieldV1[]>;

/** Page-level fields a patch may set. */
export const PAGE_PATCH_PAGE_FIELDS_V1 = ["title", "seo.title", "seo.description"] as const;
export const PAGE_PATCH_OPS_V1 = ["set", "set_items", "add", "replace", "remove", "move", "set_page", "set_variant"] as const;
export type PagePatchOpNameV1 = (typeof PAGE_PATCH_OPS_V1)[number];
export const PAGE_PATCH_LIMITS_V1 = { maxOps: 24, maxItems: 12 } as const;

export type PageBlockCopyV1 = { [K in PageCopyKeyV1]?: string };
/** A props override value (1.3.0): plain JSON; strings are page safe text. */
export type PagePropValueV1 = string | number | boolean | null | PagePropValueV1[] | { [key: string]: PagePropValueV1 };
export interface PageBlockV1 { id: string; kind: PageBlockKindV1; title: string; summary: string; catalogBlock?: string; variant?: string; copy?: PageBlockCopyV1; props?: Record<string, PagePropValueV1>; children?: PageBlockV1[] }
export interface PageSpecV1 {
  id: string; slug: string; status: PageStatusV1; title: string;
  layout: { version: typeof PAGE_LAYOUT_VERSION_V1; blocks: PageBlockV1[] };
  seo: { title?: string; description?: string };
  locale: string; createdAt: string; updatedAt: string;
}
/** Where a spec came from: the Stock screen it was assembled from (null = none recorded). */
export interface PageProvenanceV1 { screenId: string | null; scenarioId: PageScenarioV1 | null; missing: string[]; assembler?: string; family?: PageFamilyV1 | null; familyPinned?: boolean }
/** One chat's pages in the browser store (key `buildy:v1:pages`, migrated from `buildytech-creator-pages-v1`). */
export interface PageRecordV1 {
  applied?: PageSpecV1 | null; candidate?: PageSpecV1 | null;
  appliedProvenance?: PageProvenanceV1 | null; candidateProvenance?: PageProvenanceV1 | null;
  selectedBlockId?: string | null; revision?: number | null;
  lastProposed?: PageSpecV1 | null; lastProposedProvenance?: PageProvenanceV1 | null;
}
export interface PageStoreV1 { version: 1; pages: Record<string, PageRecordV1> }

export type PagePatchItemV1 = { label: string; detail?: string; value?: string; note?: string; group?: string; icon?: string };
export type PagePatchOpV1 =
  | { op: "set"; blockId: string; field: "title" | "summary" | PageCopyKeyV1; value: string | null }
  | { op: "set_items"; blockId: string; items: PagePatchItemV1[] }
  | { op: "add"; kind: PageSectionKindV1; at?: number; title?: string; variant?: string; copy?: PageBlockCopyV1; items?: PagePatchItemV1[] }
  | { op: "replace"; blockId: string; kind: PageSectionKindV1; catalogBlock?: string; title?: string; variant?: string; copy?: PageBlockCopyV1; items?: PagePatchItemV1[] }
  | { op: "remove"; blockId: string }
  | { op: "move"; blockId: string; to: number }
  | { op: "set_page"; field: (typeof PAGE_PATCH_PAGE_FIELDS_V1)[number]; value: string }
  | { op: "set_variant"; blockId: string; variant: string | null };
export interface PagePatchV1 { baseRevision?: number; ops: PagePatchOpV1[] }
