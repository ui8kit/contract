// Source of the page spec profile page-spec/v1 and the patch profile page-patch/v1 (JSON Schema draft 2020-12).
// `bun run gen` writes schemas/page-spec.schema.json, schemas/page-patch.schema.json and their public/ copies.
// Constants come from src/page-spec-v1.ts. The page shape mirrors buildytech/chat `parsePage` (layout.version 1);
// test/page-spec-v1.test.ts runs its conformance cases (fixtures/page-spec/conformance-cases.json) through ajv.
import {
  PAGE_BLOCK_KINDS_V1, PAGE_COPY_KEYS_V1, PAGE_DATETIME_PATTERN_V1, PAGE_ID_PATTERN_V1, PAGE_ITEM_FIELDS_V1,
  PAGE_ITEM_SLOTS_V1, PAGE_LAYOUT_VERSION_V1, PAGE_LIMITS_V1, PAGE_LOCALE_PATTERN_V1, PAGE_PATCH_LIMITS_V1,
  PAGE_PATCH_PAGE_FIELDS_V1, PAGE_PATCH_PROFILE_V1, PAGE_PATCH_SCHEMA_URL_V1, PAGE_PROGRAM_CHECKS_V1,
  PAGE_SCENARIOS_V1, PAGE_SECTION_KINDS_V1, PAGE_SLOTS_V1, PAGE_SLUG_PATTERN_V1, PAGE_SPEC_PROFILE_V1,
  PAGE_SPEC_SCHEMA_URL_V1, PAGE_SPEC_VERSION_V1, PAGE_STATUSES_V1, PAGE_UNIVERSAL_SLOTS_V1,
  PAGE_CATALOG_BLOCK_PATTERN_V1, PAGE_CATALOG_LIMITS_V1, PAGE_HREF_PATTERN_V1, PAGE_ICON_MAX_LENGTH_V1, PAGE_ICON_PATTERN_V1,
  PAGE_VARIANT_PATTERN_V1,
} from "../src/page-spec-v1.ts";

const L = PAGE_LIMITS_V1;
// Any character the separator test of parsePage collapses (U+0000..U+0020) may sit between scheme letters.
const gap = "[\\u0000-\\u0020]*";
const ci = (word: string) => [...word].map((c) => (/[a-z]/.test(c) ? `[${c}${c.toUpperCase()}]` : c)).join(gap);
const dangerous = ["javascript:", "data:", "vbscript:", "file:"];

/** Plain text of parsePage: no control chars except tab / LF / CR, no `<>{}`, no dangerous or non-http(s) URL scheme. */
const safeText = {
  type: "string",
  description:
    "Plain text. Rejected (parsePage codes): control characters other than tab, LF and CR, and any of < > { } (unsafe_text); a value that starts with javascript:, data:, vbscript: or file: even with whitespace or control characters between the letters (unsafe_url); a value that starts with <scheme>:// other than http(s) (unsafe_url). mailto: is allowed. Prose with a colon (`Hours: 11:00`) is not a URL.",
  pattern: "^[^<>{}\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]*$",
  not: {
    anyOf: [
      ...dangerous.map((s) => ({ pattern: `^${gap}${ci(s)}` })),
      { pattern: "^\\s*(?![hH][tT][tT][pP][sS]?://)[A-Za-z][A-Za-z0-9+.\\-]*://" },
    ],
  },
};
// Texts in page-patch refer to the safeText of page-spec (one definition).
const textAt = (ref: string) => (max: number, description?: string) => ({ allOf: [{ $ref: ref }], maxLength: max, ...(description ? { description } : {}) });
const requiredAt = (ref: string) => (max: number, description?: string) => ({ ...textAt(ref)(max, description), minLength: 1, pattern: "\\S" });
const text = textAt("#/$defs/safeText");
const required = requiredAt("#/$defs/safeText");
const id = { type: "string", pattern: PAGE_ID_PATTERN_V1, maxLength: L.maxIdLength, description: "Lowercase ASCII id, unique in the whole page (page id included; checked by the program: duplicate_id). Safe in generated code (data-block-id)." };

const copyKey = (k: string) =>
  k === "icon"
    ? { type: "string", pattern: PAGE_ICON_PATTERN_V1, maxLength: PAGE_ICON_MAX_LENGTH_V1, description: "Lucide icon name; the host checks it against the Lucide set of its pinned registry snapshot." }
    : k === "href"
      ? { allOf: [{ $ref: "#/$defs/safeText" }, { pattern: PAGE_HREF_PATTERN_V1 }], maxLength: L.maxCopyLength, description: "Link of the block action: #fragment, /path, http(s) URL or mailto." }
      : text(L.maxCopyLength);
const copyProps = Object.fromEntries(PAGE_COPY_KEYS_V1.map((k) => [k, copyKey(k)]));
const catalogBlock = { type: "string", pattern: PAGE_CATALOG_BLOCK_PATTERN_V1, maxLength: PAGE_CATALOG_LIMITS_V1.maxCatalogBlockLength, description: "Stock catalog block asset the block was built from (block.<name>, the spec of the catalog block index). Optional (1.1.0). The host rejects a block its pinned catalog does not have." };
const variant = { type: "string", pattern: PAGE_VARIANT_PATTERN_V1, maxLength: PAGE_CATALOG_LIMITS_V1.maxVariantLength, description: "Catalog variant of catalogBlock (block.<name>/<variant> is the catalog asset id); the host renders the registry organism with the variant's props. Optional (1.1.0). The host rejects a variant its pinned catalog does not have." };
const copy = { type: "object", additionalProperties: false, properties: copyProps, description: "Copy of a block by closed key. Which keys a kind renders: x-page-slots." };

// Depth is part of the shape: block1 (top level) .. block4 (deepest; children must be empty). parsePage: too_deep.
const blockAt = (depth: number) => ({
  type: "object",
  additionalProperties: false,
  required: ["id", "kind", "title", "summary"],
  properties: {
    id: { $ref: "#/$defs/id" },
    kind: { $ref: "#/$defs/kind" },
    title: required(L.maxTitleLength),
    summary: required(L.maxSummaryLength),
    catalogBlock: { $ref: "#/$defs/catalogBlock" },
    variant: { $ref: "#/$defs/variant" },
    copy: { $ref: "#/$defs/copy" },
    children: depth < L.maxDepth
      ? { type: "array", items: { $ref: `#/$defs/block${depth + 1}` }, maxItems: L.maxBlocks }
      : { type: "array", maxItems: 0, description: `Depth ${L.maxDepth} is the deepest level (too_deep).` },
  },
});

const page = {
  type: "object",
  additionalProperties: false,
  required: ["id", "slug", "status", "title", "layout", "seo", "locale", "createdAt", "updatedAt"],
  properties: {
    id: { $ref: "#/$defs/id" },
    slug: { type: "string", pattern: PAGE_SLUG_PATTERN_V1, minLength: 1, maxLength: L.maxSlugLength, description: "Ordinary page slug, no query or UTM variants." },
    status: { enum: [...PAGE_STATUSES_V1], description: "Lifecycle. A new draft has status draft." },
    title: required(L.maxTitleLength),
    layout: {
      type: "object",
      additionalProperties: false,
      required: ["version", "blocks"],
      properties: {
        version: { const: PAGE_LAYOUT_VERSION_V1 },
        blocks: { type: "array", items: { $ref: "#/$defs/block1" }, maxItems: L.maxBlocks, description: "Blocks in render order. Code (page.svelte + one file per block) is generated from this tree." },
      },
    },
    seo: { type: "object", additionalProperties: false, properties: { title: text(L.maxSeoLength), description: text(L.maxSeoLength) } },
    locale: { type: "string", pattern: PAGE_LOCALE_PATTERN_V1, maxLength: L.maxLocaleLength, description: "BCP 47 language of all copy." },
    createdAt: { type: "string", pattern: PAGE_DATETIME_PATTERN_V1, maxLength: L.maxDatetimeLength },
    updatedAt: { type: "string", pattern: PAGE_DATETIME_PATTERN_V1, maxLength: L.maxDatetimeLength },
  },
};

const provenance = {
  type: "object",
  additionalProperties: false,
  description: "Where a saved spec came from. screenId is the Stock catalog screen the blocks were assembled from (null = not recorded).",
  properties: {
    screenId: { type: ["string", "null"], maxLength: 200 },
    scenarioId: { enum: [...PAGE_SCENARIOS_V1, null] },
    missing: { type: "array", items: { type: "string", maxLength: 200 }, description: "Catalog block labels of the screen that the host cannot render." },
    assembler: { type: "string", maxLength: 80 },
  },
};
const pageOrNull = { anyOf: [{ $ref: "#/$defs/page" }, { type: "null" }] };
const provOrNull = { anyOf: [{ $ref: "#/$defs/provenance" }, { type: "null" }] };
const record = {
  type: "object",
  additionalProperties: false,
  description: "One chat's pages in the browser store: the applied page, the pending candidate and the last proposal, each with its provenance.",
  properties: {
    applied: pageOrNull, candidate: pageOrNull, lastProposed: pageOrNull,
    appliedProvenance: provOrNull, candidateProvenance: provOrNull, lastProposedProvenance: provOrNull,
    selectedBlockId: { type: ["string", "null"], maxLength: L.maxIdLength },
    revision: { type: ["integer", "null"], minimum: 0 },
  },
};
const store = {
  type: "object",
  additionalProperties: false,
  required: ["version", "pages"],
  description: "The browser page store blob (localStorage key buildy:v1:pages; before session buildy:v1 the key buildytech-creator-pages-v1, migrated once): pages by chat id.",
  properties: { version: { const: 1 }, pages: { type: "object", additionalProperties: { $ref: "#/$defs/record" } } },
};

const slots = Object.fromEntries(
  Object.entries(PAGE_SLOTS_V1).map(([k, v]) => [k, { copy: [...v.copy, ...PAGE_UNIVERSAL_SLOTS_V1], ...("items" in v ? { items: { ...v.items, fields: [...PAGE_ITEM_SLOTS_V1[v.items.kind]] } } : {}) }]),
);

export const pageSpec = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": PAGE_SPEC_SCHEMA_URL_V1,
  "title": "Page spec page-spec/v1 — a page as Stock catalog blocks with their copy",
  "x-page-spec-profile": PAGE_SPEC_PROFILE_V1,
  "x-page-spec-version": PAGE_SPEC_VERSION_V1,
  "description": "The primary artifact of a BuildY page: an agent proposes it (propose_layout), the host validates it against the Stock catalog, saves it, and regenerates code from it for a UI8Kit target (Svelte today). History, edits (page-patch/v1) and rollback work on this JSON; code is never the source. Root: the page (identical to buildytech/chat Page DTO, layout.version 1: every saved page validates unchanged). $defs: provenance, record and store describe the browser page store. Not a Codex v0.4 entry. After the schema, consumers run x-program-checks (duplicate ids, block count, payload size). x-page-slots lists the copy keys each kind renders and the rows of list kinds; a saved page may hold other copy keys, a patch may only write slots.",
  "x-program-checks": [...PAGE_PROGRAM_CHECKS_V1],
  "x-limits": { ...L },
  "x-page-slots": slots,
  "$ref": "#/$defs/page",
  "$defs": {
    safeText,
    id,
    kind: { enum: [...PAGE_BLOCK_KINDS_V1], description: "Renderer kind a Stock catalog block maps onto." },
    copy,
    catalogBlock,
    variant,
    block1: blockAt(1), block2: blockAt(2), block3: blockAt(3), block4: blockAt(4),
    page,
    provenance,
    record,
    store,
  },
};

const ptext = textAt(`${PAGE_SPEC_SCHEMA_URL_V1}#/$defs/safeText`);
const prequired = requiredAt(`${PAGE_SPEC_SCHEMA_URL_V1}#/$defs/safeText`);
const itemProps = Object.fromEntries(
  Object.entries(PAGE_ITEM_FIELDS_V1).map(([k, v]) => [k, k === "label" ? prequired(v.max, `Row ${v.to}.`) : ptext(v.max, `Row ${v.to}.`)]),
);
const item = { type: "object", additionalProperties: false, required: ["label"], properties: itemProps };
const items = { type: "array", items: { $ref: "#/$defs/item" }, maxItems: PAGE_PATCH_LIMITS_V1.maxItems, description: "Rows of a list block, replacing its rows. Row kind, limit and fields per kind: page-spec x-page-slots." };
const sectionKind = { enum: [...PAGE_SECTION_KINDS_V1], description: "A top-level kind. The host builds the block from the page's Stock screen family; a kind the family does not have is rejected." };
const blockRef = { $ref: `${PAGE_SPEC_SCHEMA_URL_V1}#/$defs/id` };
const variantRef = { $ref: `${PAGE_SPEC_SCHEMA_URL_V1}#/$defs/variant` };
const catalogBlockRef = { $ref: `${PAGE_SPEC_SCHEMA_URL_V1}#/$defs/catalogBlock` };
const opCopy = { $ref: `${PAGE_SPEC_SCHEMA_URL_V1}#/$defs/copy` };
const op = (name: string, props: Record<string, unknown>, req: string[], description: string) => ({
  type: "object", additionalProperties: false, required: ["op", ...req], description,
  properties: { op: { const: name }, ...props },
});

export const pagePatch = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": PAGE_PATCH_SCHEMA_URL_V1,
  "title": "Page patch page-patch/v1 — edit operations on a page spec",
  "x-page-patch-profile": PAGE_PATCH_PROFILE_V1,
  "x-page-spec-version": PAGE_SPEC_VERSION_V1,
  "description": "An edit of a page-spec/v1 page as an ordered list of operations, applied in order to a copy of the base page; the whole patch is rejected if any operation fails. Unchanged blocks keep their content. Slot validation: set / add / replace may only write copy keys and row fields the target kind renders (page-spec x-page-slots); rows beyond the kind's limit are rejected. The result must be a valid page-spec/v1 page. baseRevision, when sent, must equal the page revision the patch was made for.",
  "type": "object",
  "additionalProperties": false,
  "required": ["ops"],
  "properties": {
    baseRevision: { type: "integer", minimum: 0 },
    ops: { type: "array", minItems: 1, maxItems: PAGE_PATCH_LIMITS_V1.maxOps, items: { $ref: "#/$defs/op" } },
  },
  "$defs": {
    item,
    op: {
      oneOf: [
        op("set", { blockId: blockRef, field: { enum: ["title", "summary", ...PAGE_COPY_KEYS_V1] }, value: { anyOf: [ptext(L.maxCopyLength), { type: "null" }] } }, ["blockId", "field", "value"],
          "Set one slot of a block. null removes a copy key; title and summary cannot be removed."),
        op("set_items", { blockId: blockRef, items }, ["blockId", "items"], "Replace the rows of a list block."),
        op("add", { kind: sectionKind, at: { type: "integer", minimum: 0 }, title: prequired(L.maxTitleLength), variant: variantRef, copy: opCopy, items }, ["kind"],
          "Add a Stock block at a top-level index (default: its natural place). Optional copy and rows overlay the catalog defaults; variant picks a catalog variant of the block (the host sets catalogBlock)."),
        op("replace", { blockId: blockRef, kind: sectionKind, catalogBlock: catalogBlockRef, title: prequired(L.maxTitleLength), variant: variantRef, copy: opCopy, items }, ["blockId", "kind"],
          "Replace a top-level block by another Stock block in the same place. catalogBlock (1.2.0, optional): another Stock catalog block of the same kind (block.hero -> block.storehero); the host keeps the block id, kind and title, carries the text the new block renders and says which fields it dropped; variant is one of that block's variants (default: its catalog default)."),
        op("remove", { blockId: blockRef }, ["blockId"], "Remove a block and its rows."),
        op("move", { blockId: blockRef, to: { type: "integer", minimum: 0 } }, ["blockId", "to"], "Move a block to an index among its siblings."),
        op("set_page", { field: { enum: [...PAGE_PATCH_PAGE_FIELDS_V1] }, value: prequired(L.maxTitleLength) }, ["field", "value"], "Set the page title or an SEO field."),
        op("set_variant", { blockId: blockRef, variant: { anyOf: [variantRef, { type: "null" }] } }, ["blockId", "variant"],
          "Switch a block to another catalog variant of its catalog block (1.1.0); null returns to the catalog default. Unknown variants are rejected."),
      ],
    },
  },
};
