// Page spec profile page-spec/v2: a page is ONE document, the same one a host exports and a BuildY agent reads and
// writes like code: `{ title, slug, locale, seo, blocks: [ { id, item, variant, props } ] }`.
// `item` is the registry item name of `npx ui8kit add <item>`, `variant` one of its published variants (the layout
// axes preset) and `props` exactly the props of that component (registry.buildy.tw/props/v0.json, checked by the host).
// There is no kind, no copy slot, no children and no screen family in the document: a page is blocks with props.
// Replaces the page model of page-spec/v1 for new work (v1 stays published side by side; a host migrates v1 pages with
// `copy slots + props overrides + children merged into the props the block already renders`, a lossless projection).
// Edits: page-patch/v2 = RFC 6902 JSON Patch on this document (or a full document), validated by schema + registry.
// Schemas: scripts/schemas-page-spec-v2.ts -> schemas/page-spec-v2.schema.json and schemas/page-patch-v2.schema.json.
import { SCHEMA_BASE_URL } from "./codex.js";
import { PAGE_DATETIME_PATTERN_V1, PAGE_ID_PATTERN_V1, PAGE_LOCALE_PATTERN_V1, PAGE_SLUG_PATTERN_V1, PAGE_STATUSES_V1, PAGE_VARIANT_PATTERN_V1 } from "./page-spec-v1.js";

export const PAGE_SPEC_PROFILE_V2 = "page-spec/v2";
export const PAGE_SPEC_VERSION_V2 = "2.0.0";
export const PAGE_SPEC_SCHEMA_URL_V2 = `${SCHEMA_BASE_URL}/page-spec-v2.schema.json`;
export const PAGE_PATCH_PROFILE_V2 = "page-patch/v2";
export const PAGE_PATCH_SCHEMA_URL_V2 = `${SCHEMA_BASE_URL}/page-patch-v2.schema.json`;

/** `version` of a page spec v2 document. */
export const PAGE_DOCUMENT_VERSION_V2 = 2 as const;

/** Registry item name (`npx ui8kit add <item>`): lowercase words joined by hyphens. */
export const PAGE_ITEM_PATTERN_V2 = "^[a-z0-9]+(?:-[a-z0-9]+)*$";
export const PAGE_PROP_KEY_PATTERN_V2 = "^[A-Za-z][A-Za-z0-9_]{0,47}$";

export const PAGE_LIMITS_V2 = {
  maxBlocks: 64, maxIdLength: 63, maxSlugLength: 48, maxTitleLength: 160, maxItemLength: 80, maxVariantLength: 40,
  maxTextLength: 2000, maxSeoLength: 200, maxLocaleLength: 16, maxJsonChars: 200_000, maxDatetimeLength: 40,
  maxPropKeys: 64, maxListItems: 24, maxDepth: 8,
} as const;

/** Patch limits: operations per patch and the shape of a path. */
export const PAGE_PATCH_LIMITS_V2 = { maxOps: 64, maxPathLength: 200 } as const;
/** Operations of RFC 6902 a page patch may use. */
export const PAGE_PATCH_OPS_V2 = ["add", "remove", "replace", "move", "copy", "test"] as const;
export type PagePatchOpNameV2 = (typeof PAGE_PATCH_OPS_V2)[number];
/**
 * A patch path is a JSON Pointer into the page document: `/title`, `/slug`, `/locale`, `/seo`, `/seo/title`,
 * `/seo/description`, `/blocks`, `/blocks/<index>`, `/blocks/-` (add: append), `/blocks/<index>/<id|item|variant|props>`
 * and any pointer below `/blocks/<index>/props`. The host checks that the path exists for the operation (RFC 6902).
 */
export const PAGE_PATCH_PATH_PATTERN_V2 = "^/(?:title|slug|locale|seo(?:/(?:title|description))?|blocks(?:/(?:[0-9]{1,2}|-)(?:/(?:id|item|variant|props(?:/[^/]{1,48}){0,12}))?)?)$";

/**
 * Checks a JSON Schema cannot express; every consumer runs them after the schema: duplicate block ids (the page id
 * included), more than maxBlocks blocks, payload over maxJsonChars, props nested deeper than maxDepth.
 */
export const PAGE_PROGRAM_CHECKS_V2 = ["duplicate_id", "too_many_blocks", "too_large", "too_deep"] as const;
/**
 * Checks that need the host's registry (not the page alone): the item exists (unknown_item), the variant is one of its
 * published variants (unknown_variant), the registry renders the item (no_renderer), the props pass the item's props
 * schema (props_invalid: path, expected, got), a header-like item is first and a footer-like item last when the page has
 * one (header_not_first, footer_not_last; the role comes from the registry metadata of the item, never from the page).
 */
export const PAGE_HOST_CHECKS_V2 = ["unknown_item", "unknown_variant", "no_renderer", "props_invalid", "header_not_first", "footer_not_last"] as const;

export type PagePropValueV2 = string | number | boolean | null | PagePropValueV2[] | { [key: string]: PagePropValueV2 };
export interface PageBlockV2 { id: string; item: string; variant?: string; props?: Record<string, PagePropValueV2> }
export interface PageSpecV2 {
  version: typeof PAGE_DOCUMENT_VERSION_V2;
  id?: string; slug: string; status?: (typeof PAGE_STATUSES_V1)[number]; title: string; locale: string;
  seo?: { title?: string; description?: string };
  createdAt?: string; updatedAt?: string;
  blocks: PageBlockV2[];
}
export type PagePatchOpV2 =
  | { op: "add" | "replace" | "test"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "move" | "copy"; from: string; path: string };

export { PAGE_DATETIME_PATTERN_V1 as PAGE_DATETIME_PATTERN_V2, PAGE_ID_PATTERN_V1 as PAGE_ID_PATTERN_V2, PAGE_LOCALE_PATTERN_V1 as PAGE_LOCALE_PATTERN_V2, PAGE_SLUG_PATTERN_V1 as PAGE_SLUG_PATTERN_V2, PAGE_STATUSES_V1 as PAGE_STATUSES_V2, PAGE_VARIANT_PATTERN_V1 as PAGE_VARIANT_PATTERN_V2 };
