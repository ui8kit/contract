// Source of the block contract profile block-contract/v1 (JSON Schema draft 2020-12). `bun run gen` writes
// schemas/block-contract.schema.json and its public/ copy. Constants come from src/block-contract-v1.ts.
// Inside the keyword subset of buildytech/chat `page-contract/src/json-schema.ts` (no `format`, no `uniqueItems`, no
// `patternProperties`, no `if`).
import {
  BLOCK_ALIGNS_V1, BLOCK_CONTRACT_LIMITS_V1, BLOCK_CONTRACT_PROGRAM_CHECKS_V1, BLOCK_CONTRACT_SCHEMA_URL_V1, BLOCK_CONTRACT_VERSION_V1,
  BLOCK_FIELD_POINTER_PATTERN_V1, BLOCK_ITEM_PATTERN_V1, BLOCK_LEVELS_V1, BLOCK_MODEL_PATTERN_V1, BLOCK_MODES_V1, BLOCK_PADDINGS_V1,
  BLOCK_PLACE_KINDS_V1, BLOCK_VARIANT_PATTERN_V1,
} from "../src/block-contract-v1.ts";

const L = BLOCK_CONTRACT_LIMITS_V1; // maxAxes: a program-side limit (no maxProperties in the subset)
const short = { type: "string", minLength: 1, maxLength: L.maxShortLength };
const closed = (properties: Record<string, unknown>, required: string[] = [], description?: string) => ({
  type: "object", additionalProperties: false, ...(required.length ? { required } : {}), ...(description ? { description } : {}), properties,
});
const ref = (def: string) => ({ $ref: `#/$defs/${def}` });

const variantSettings = closed({
  align: { enum: [...BLOCK_ALIGNS_V1], description: "The alignment the variant starts with (logical: start / end follow dir). A centred composition (a wide picture on top) starts centred." },
  padding: { enum: [...BLOCK_PADDINGS_V1] },
  level: { enum: [...BLOCK_LEVELS_V1] },
}, [], "Optional: the variant's own setting defaults, over settings[*].default. A saved block's props (page-spec/v2) override them. Not a variant of its own: the variants stay layout-only.");

const variant = closed({
  id: { type: "string", pattern: BLOCK_VARIANT_PATTERN_V1, maxLength: 40 },
  label: short,
  axes: { type: "object", additionalProperties: { type: "string", maxLength: 40 }, description: "The value of every layout axis (media side, column count, surface). Never content." },
  settings: ref("variantSettings"),
}, ["id", "label", "axes"], "A layout variant: a named preset of the axes; any valid content renders fully in every variant.");

const setting = closed({
  type: { type: "string", minLength: 1, maxLength: L.maxShortLength, description: "TypeScript type of the value (`1 | 2 | 3`, `\"start\" | \"center\" | \"end\"`, `string`)." },
  default: { type: ["string", "number", "boolean"] },
}, ["type"], "A setting: a presentation choice per placed block, saved inside props, never a variant axis.");

const place = closed({
  place: short,
  kind: { enum: [...BLOCK_PLACE_KINDS_V1] },
  fields: { type: "array", minItems: 1, maxItems: L.maxFields, items: { type: "string", pattern: BLOCK_FIELD_POINTER_PATTERN_V1, maxLength: L.maxShortLength } },
  list: short,
}, ["place", "kind", "fields"], "One region of the block and the fields of the model it draws (JSON Pointers; `*` is an index of `list`).");

export const blockContractSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": BLOCK_CONTRACT_SCHEMA_URL_V1,
  "title": "Block contract block-contract/v1 — one block of the simple line for a builder",
  "x-block-contract-version": BLOCK_CONTRACT_VERSION_V1,
  "description": "What a builder needs to drive one block without reading its code (codegen-x packages/prototypes, registry.buildy.tw/contracts/<item>/<version>.json): the registry item, the content model and its schema, the layout variants (with their own setting defaults), the settings, the modes and the places. A saved block is a page-spec/v2 block { id, item, variant, props }; the settings live in props. After the schema, readers run x-program-checks. Every object is closed.",
  "x-program-checks": [...BLOCK_CONTRACT_PROGRAM_CHECKS_V1],
  "x-limits": { ...L },
  "type": "object",
  "additionalProperties": false,
  "required": ["item", "version", "block", "organism", "line", "model", "modelSchema", "axes", "defaults", "variants", "defaultVariant", "settings", "modes", "defaultMode", "places", "wireframe"],
  "properties": {
    "$schema": { type: "string", maxLength: L.maxShortLength },
    item: { type: "string", pattern: BLOCK_ITEM_PATTERN_V1, maxLength: 64, description: "The registry item (npx ui8kit add <item>)." },
    version: { type: "integer", minimum: 1, description: "The contract version of the item (the path <item>/<version>.json)." },
    block: short,
    organism: short,
    line: short,
    model: { type: "string", pattern: BLOCK_MODEL_PATTERN_V1, maxLength: 64 },
    modelSchema: short,
    axes: { type: "object", additionalProperties: { type: "array", minItems: 1, maxItems: L.maxAxisValues, items: { type: "string", maxLength: 40 } } },
    defaults: { type: "object", additionalProperties: { type: "string", maxLength: 40 } },
    variants: { type: "array", minItems: 1, maxItems: L.maxVariants, items: ref("variant") },
    defaultVariant: { type: "string", pattern: BLOCK_VARIANT_PATTERN_V1, maxLength: 40 },
    settings: { type: "object", additionalProperties: ref("setting") },
    modes: { type: "array", minItems: 1, maxItems: BLOCK_MODES_V1.length, items: { enum: [...BLOCK_MODES_V1] } },
    defaultMode: { enum: [...BLOCK_MODES_V1] },
    places: { type: "array", maxItems: L.maxPlaces, items: ref("place") },
    wireframe: closed({ items: { type: "integer", minimum: 1, maximum: 12 } }, ["items"], "The wireframe draws this many placeholder items of a list."),
  },
  "$defs": { variant, variantSettings, setting, place },
} as const;
