// Source of the page spec profile page-spec/v2 and the patch profile page-patch/v2 (JSON Schema draft 2020-12).
// `bun run gen` writes schemas/page-spec-v2.schema.json, schemas/page-patch-v2.schema.json and their public/ copies.
// Constants come from src/page-spec-v2.ts. The schemas stay inside the keyword subset of buildytech/chat
// `page-contract/src/json-schema.ts` (no `format`, no `patternProperties`), so the browser validates them without Ajv.
import {
  PAGE_DATETIME_PATTERN_V2, PAGE_DOCUMENT_VERSION_V2, PAGE_HOST_CHECKS_V2, PAGE_ID_PATTERN_V2, PAGE_ITEM_PATTERN_V2, PAGE_LIMITS_V2,
  PAGE_LOCALE_PATTERN_V2, PAGE_PATCH_LIMITS_V2, PAGE_PATCH_OPS_V2, PAGE_PATCH_PATH_PATTERN_V2, PAGE_PATCH_PROFILE_V2,
  PAGE_PATCH_SCHEMA_URL_V2, PAGE_PROGRAM_CHECKS_V2, PAGE_PROP_KEY_PATTERN_V2, PAGE_SLUG_PATTERN_V2, PAGE_SPEC_PROFILE_V2,
  PAGE_SPEC_SCHEMA_URL_V2, PAGE_SPEC_VERSION_V2, PAGE_STATUSES_V2, PAGE_VARIANT_PATTERN_V2,
} from "../src/page-spec-v2.ts";
import { PAGE_SPEC_SCHEMA_URL_V1 } from "../src/page-spec-v1.ts";
import { pageSpec as pageSpecV1 } from "./schemas-page-spec-v1.ts";

const L = PAGE_LIMITS_V2;
// Plain text is the safeText of page-spec/v1 (one definition: control characters, markup, dangerous URL schemes).
const safe = `${PAGE_SPEC_SCHEMA_URL_V1}#/$defs/safeText`;
const text = (max: number, description?: string) => ({ allOf: [{ $ref: safe }], maxLength: max, ...(description ? { description } : {}) });
const required = (max: number, description?: string) => ({ ...text(max, description), minLength: 1, pattern: "\\S" });

const id = { type: "string", pattern: PAGE_ID_PATTERN_V2, maxLength: L.maxIdLength, description: "Lowercase ASCII id of a block, unique in the whole page (page id included; program check duplicate_id). Safe in generated code (data-block-id)." };
const item = { type: "string", pattern: PAGE_ITEM_PATTERN_V2, maxLength: L.maxItemLength, description: "Registry item name as used by `npx ui8kit add <item>` (hero-split, feature-grid, site-footer). The host rejects an item its registry does not have (unknown_item) or cannot render (no_renderer)." };
const variant = { type: "string", pattern: PAGE_VARIANT_PATTERN_V2, maxLength: L.maxVariantLength, description: "A published variant of the item (registry.buildy.tw/variants/v0.json): a named preset of the layout axes of its props (extra, media, columns, tone). Optional: the item's default variant. The host rejects a variant the item does not have (unknown_variant)." };

// A prop string is the safeText of v1 except `{` `}`: registry presets carry templates such as `?paged={0}`, and props are data (the export writes JSON), not markup.
const propText = {
  ...(pageSpecV1 as unknown as { $defs: { safeText: Record<string, unknown> } }).$defs.safeText,
  description: "Plain text of a prop. As safeText of page-spec/v1 (control characters, `<` `>`, dangerous URL schemes are rejected) except that `{` and `}` are allowed: registry presets carry templates such as `?paged={0}`.",
  pattern: "^[^<>\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]*$",
  maxLength: L.maxTextLength,
};
const propValue = {
  description: "A prop value: plain JSON; strings are plain text (propText). The item's props schema (registry.buildy.tw/props/v0.json) decides what is valid for each prop (x-host-checks props_invalid).",
  anyOf: [
    { $ref: "#/$defs/propText" },
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
    { type: "array", maxItems: L.maxListItems, items: { $ref: "#/$defs/propValue" } },
    { type: "object", maxProperties: L.maxPropKeys, propertyNames: { pattern: PAGE_PROP_KEY_PATTERN_V2 }, additionalProperties: { $ref: "#/$defs/propValue" } },
  ],
};
const props = {
  type: "object",
  maxProperties: L.maxPropKeys,
  propertyNames: { pattern: PAGE_PROP_KEY_PATTERN_V2 },
  additionalProperties: { $ref: "#/$defs/propValue" },
  description: "Exactly the props of the registry item's component (what `<Item {...props} />` receives, and what the exported code writes). Nothing else lives in a block: no copy slots, no rows, no children. A host that inserts a block without props fills the sample props of the variant (the preset of its layout axes plus the minimum the props schema requires); layout axes are props like any other.",
};
const block = {
  type: "object",
  additionalProperties: false,
  required: ["id", "item"],
  properties: { id: { $ref: "#/$defs/id" }, item: { $ref: "#/$defs/item" }, variant: { $ref: "#/$defs/variant" }, props: { $ref: "#/$defs/props" } },
  description: "One section of the page: a registry item, the variant it was picked as and its props.",
};
const seo = { type: "object", additionalProperties: false, properties: { title: text(L.maxSeoLength), description: text(L.maxSeoLength) } };
const page = {
  type: "object",
  additionalProperties: false,
  required: ["version", "slug", "title", "locale", "blocks"],
  properties: {
    version: { const: PAGE_DOCUMENT_VERSION_V2, description: "Document version: 2." },
    id: { $ref: "#/$defs/id" },
    slug: { type: "string", pattern: PAGE_SLUG_PATTERN_V2, minLength: 1, maxLength: L.maxSlugLength, description: "Ordinary page slug, no query or UTM variants." },
    status: { enum: [...PAGE_STATUSES_V2], description: "Lifecycle (optional; a host defaults a new page to draft)." },
    title: required(L.maxTitleLength),
    locale: { type: "string", pattern: PAGE_LOCALE_PATTERN_V2, maxLength: L.maxLocaleLength, description: "BCP 47 language of the page copy; follows the language the author writes in." },
    seo: { $ref: "#/$defs/seo" },
    createdAt: { type: "string", pattern: PAGE_DATETIME_PATTERN_V2, maxLength: L.maxDatetimeLength },
    updatedAt: { type: "string", pattern: PAGE_DATETIME_PATTERN_V2, maxLength: L.maxDatetimeLength },
    blocks: { type: "array", items: { $ref: "#/$defs/block" }, maxItems: L.maxBlocks, description: "Sections in render order. The exported project (page file + the block files `npx ui8kit add` writes) is generated from this list." },
  },
};

const v1 = (def: string) => ({ $ref: `${PAGE_SPEC_SCHEMA_URL_V1}#/$defs/${def}` });
const pageOrNull = { anyOf: [{ $ref: "#/$defs/page" }, { type: "null" }] };
const provOrNull = { anyOf: [v1("provenance"), { type: "null" }] };
const record = {
  type: "object",
  additionalProperties: false,
  description: "One chat's pages in the browser store: the applied page, the pending candidate and the last proposal (page-spec/v2 documents) with their provenance (page-spec/v1 provenance: the Stock screen the page started from and the advisory screen family, never a rule).",
  properties: {
    applied: pageOrNull, candidate: pageOrNull, lastProposed: pageOrNull,
    appliedProvenance: provOrNull, candidateProvenance: provOrNull, lastProposedProvenance: provOrNull,
    selectedBlockId: { type: ["string", "null"], maxLength: L.maxIdLength },
    revision: { type: ["integer", "null"], minimum: 0 },
  },
};

export const pageSpecV2 = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": PAGE_SPEC_SCHEMA_URL_V2,
  "title": "Page spec page-spec/v2 — a page as registry items with their props",
  "x-page-spec-profile": PAGE_SPEC_PROFILE_V2,
  "x-page-spec-version": PAGE_SPEC_VERSION_V2,
  "description": "A BuildY page as ONE document: { version: 2, title, slug, locale, seo, blocks: [{ id, item, variant, props }] }. `item` is the registry item of `npx ui8kit add`, `props` are exactly the props of its component, `variant` names the preset of its layout axes. An agent reads it, reads the props schema of an item and writes a new version or an RFC 6902 patch (page-patch-v2.schema.json); the host validates and answers with compiler-style errors { path, expected, got }. Replaces the kind / copy / children model of page-spec/v1 (still published). After the schema, consumers run x-program-checks, then the registry checks x-host-checks.",
  "x-program-checks": [...PAGE_PROGRAM_CHECKS_V2],
  "x-host-checks": [...PAGE_HOST_CHECKS_V2],
  "x-limits": { ...L },
  "$ref": "#/$defs/page",
  "$defs": { id, item, variant, propText, propValue, props, block, seo, page, record },
};

const pointer = { type: "string", pattern: PAGE_PATCH_PATH_PATTERN_V2, maxLength: PAGE_PATCH_LIMITS_V2.maxPathLength };
const op = (name: string, extra: Record<string, unknown>, req: string[], description: string) => ({
  type: "object", additionalProperties: false, required: ["op", "path", ...req], description,
  properties: { op: { const: name }, path: pointer, ...extra },
});
export const pagePatchV2 = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": PAGE_PATCH_SCHEMA_URL_V2,
  "title": "Page patch page-patch/v2 — RFC 6902 JSON Patch on a page-spec/v2 document",
  "x-page-patch-profile": PAGE_PATCH_PROFILE_V2,
  "x-page-spec-version": PAGE_SPEC_VERSION_V2,
  "description": "An edit of a page-spec/v2 document as an RFC 6902 JSON Patch: an ordered list of operations applied to a copy of the base page; one failing operation rejects the whole patch. Paths are pointers into the document (title, slug, locale, seo, blocks, blocks/<i>/props/...). The result must be a valid page-spec/v2 document; the host answers a failure with a list of { path, expected, got }. Blocks that no operation touches stay exactly as they are.",
  "x-limits": { ...PAGE_PATCH_LIMITS_V2 },
  "type": "array",
  "minItems": 1,
  "maxItems": PAGE_PATCH_LIMITS_V2.maxOps,
  "items": { $ref: "#/$defs/op" },
  "$defs": {
    pointer,
    op: {
      oneOf: [
        ...PAGE_PATCH_OPS_V2.map((name) =>
          name === "remove" ? op(name, {}, [], "Remove the value at path.")
          : name === "move" || name === "copy" ? op(name, { from: pointer }, ["from"], name === "move" ? "Move the value at from to path (reorder blocks)." : "Copy the value at from to path.")
          : op(name, { value: {} }, ["value"], name === "add" ? "Add value at path (blocks/- appends; blocks/<i> inserts before index i)." : name === "replace" ? "Replace the value at path." : "Fail the whole patch unless the value at path equals value."),
        ),
      ],
    },
  },
};
