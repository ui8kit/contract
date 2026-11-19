// Block contract profile block-contract/v1: what a builder needs to drive one block of the simple line (codegen-x
// packages/prototypes, published at https://registry.buildy.tw/contracts/<item>/<version>.json) without reading its code:
// the registry item, the content model and its schema, the variants with their layout axes (and their own setting
// defaults), the settings, the modes and the places (the fields each region draws).
// A saved block of such an item is a page-spec/v2 block `{ id, item, variant, props }`: the settings live in `props`.
// Schema: scripts/schemas-block-contract-v1.ts -> schemas/block-contract.schema.json.
import { SCHEMA_BASE_URL } from "./codex.js";

export const BLOCK_CONTRACT_VERSION_V1 = "1.0.0";
export const BLOCK_CONTRACT_SCHEMA_URL_V1 = `${SCHEMA_BASE_URL}/block-contract.schema.json`;

/** The `align` setting: logical (start / end follow the writing direction), never a variant axis. */
export const BLOCK_ALIGNS_V1 = ["start", "center", "end"] as const;
export type BlockAlignV1 = (typeof BLOCK_ALIGNS_V1)[number];
/** The `padding` setting: the vertical rhythm of the section (multiples of 8px). */
export const BLOCK_PADDINGS_V1 = ["compact", "standard", "spacious"] as const;
export type BlockPaddingV1 = (typeof BLOCK_PADDINGS_V1)[number];
/** The `level` setting: the heading level of the block (list item titles one level below). */
export const BLOCK_LEVELS_V1 = [1, 2, 3] as const;
export type BlockLevelV1 = (typeof BLOCK_LEVELS_V1)[number];

export const BLOCK_PLACE_KINDS_V1 = ["heading", "text", "badge", "action", "media"] as const;
export type BlockPlaceKindV1 = (typeof BLOCK_PLACE_KINDS_V1)[number];
export const BLOCK_MODES_V1 = ["wireframe", "clean"] as const;
export type BlockModeV1 = (typeof BLOCK_MODES_V1)[number];

/** Registry item name (kebab case). */
export const BLOCK_ITEM_PATTERN_V1 = "^[a-z0-9]+(?:-[a-z0-9]+)*$";
/** Variant id (camelCase, the catalog variant of page-spec/v2). */
export const BLOCK_VARIANT_PATTERN_V1 = "^[a-z][A-Za-z0-9]*$";
/** Content model `<id>@<version>`. */
export const BLOCK_MODEL_PATTERN_V1 = "^[a-z][a-z0-9-]*@[1-9][0-9]*$";
/** A field of the model: a JSON Pointer, `*` for any index of a list. */
export const BLOCK_FIELD_POINTER_PATTERN_V1 = "^(?:/(?:[A-Za-z0-9_-]+|\\*))+$";

export const BLOCK_CONTRACT_LIMITS_V1 = { maxVariants: 64, maxPlaces: 64, maxFields: 16, maxAxes: 8, maxAxisValues: 16, maxShortLength: 200 } as const;

/** A variant's own setting defaults, over `settings[*].default`; a saved block's props override them. */
export interface BlockVariantSettingsV1 { align?: BlockAlignV1; padding?: BlockPaddingV1; level?: BlockLevelV1 }
export interface BlockVariantV1 { id: string; label: string; axes: Record<string, string>; settings?: BlockVariantSettingsV1 }
export interface BlockSettingV1 { type: string; default?: string | number | boolean }
export interface BlockPlaceV1 { place: string; kind: BlockPlaceKindV1; fields: string[]; list?: string }
export interface BlockContractV1 {
  item: string; version: number; block: string; organism: string; line: string; model: string; modelSchema: string;
  axes: Record<string, string[]>; defaults: Record<string, string>;
  variants: BlockVariantV1[]; defaultVariant: string;
  settings: Record<string, BlockSettingV1>;
  modes: BlockModeV1[]; defaultMode: BlockModeV1; places: BlockPlaceV1[]; wireframe: { items: number };
}

/** The settings a variant starts with: the contract defaults, then the variant's own. */
export function variantSettingsV1(c: BlockContractV1, variant: string): Record<string, string | number | boolean> {
  const base = Object.fromEntries(Object.entries(c.settings).flatMap(([k, s]) => (s.default === undefined ? [] : [[k, s.default]])));
  const v = c.variants.find((x) => x.id === variant) ?? c.variants.find((x) => x.id === c.defaultVariant);
  return { ...base, ...(v?.settings ?? {}) };
}

/** Checks a reader runs after the schema (program checks). */
export const BLOCK_CONTRACT_PROGRAM_CHECKS_V1 = ["default_variant_unknown", "variant_axis_unknown", "variant_axis_value", "default_mode_unknown"] as const;

export function blockContractProgramIssuesV1(c: BlockContractV1): Array<{ code: (typeof BLOCK_CONTRACT_PROGRAM_CHECKS_V1)[number]; path: string }> {
  const out: Array<{ code: (typeof BLOCK_CONTRACT_PROGRAM_CHECKS_V1)[number]; path: string }> = [];
  if (!c.variants.some((v) => v.id === c.defaultVariant)) out.push({ code: "default_variant_unknown", path: "/defaultVariant" });
  c.variants.forEach((v, i) => {
    for (const [axis, value] of Object.entries(v.axes)) {
      if (!(axis in c.axes)) out.push({ code: "variant_axis_unknown", path: `/variants/${i}/axes/${axis}` });
      else if (!c.axes[axis]!.includes(value)) out.push({ code: "variant_axis_value", path: `/variants/${i}/axes/${axis}` });
    }
  });
  if (!c.modes.includes(c.defaultMode)) out.push({ code: "default_mode_unknown", path: "/defaultMode" });
  return out;
}
