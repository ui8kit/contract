// Collection profile buildy-collection:v1: a hand-picked set of Stock screens and block variants that a person gathers
// on Stock (app.codegen-x.com) and hands to BuildY ("Open in BuildY"). BuildY takes the items its own frozen catalog
// snapshot has as the required block set of a Build turn and reports (never substitutes) the ones it does not have.
// It is NOT a Codex v0.4 collection (records of one kind) and it holds no credential or personal data.
// Item ids are Stock asset ids, the entity keys of the BuildY catalog snapshot: a screen page `screen.<screen>/<area>`,
// a block `block.<name>` with its variant (`block.<name>/<variant>` is the variant asset id), as page-spec/v1
// `catalogBlock` + `variant`.
// Schema: scripts/schemas-collection-v1.ts -> schemas/collection.schema.json.
import { SCHEMA_BASE_URL } from "./codex.js";
import { PAGE_CATALOG_BLOCK_PATTERN_V1, PAGE_VARIANT_PATTERN_V1 } from "./page-spec-v1.js";

export const COLLECTION_FORMAT_V1 = "buildy-collection:v1";
export const COLLECTION_VERSION_V1 = "1.0.0";
export const COLLECTION_SCHEMA_URL_V1 = `${SCHEMA_BASE_URL}/collection.schema.json`;

export const COLLECTION_ITEM_KINDS_V1 = ["screen", "block"] as const;
export type CollectionItemKindV1 = (typeof COLLECTION_ITEM_KINDS_V1)[number];

/** Collection id: host-made (e.g. col-<base36 time>-<random>). */
export const COLLECTION_ID_PATTERN_V1 = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$";
/** A screen page of Stock: `screen.<screen>/<area>` (e.g. screen.theme-food-grill/home). */
export const COLLECTION_SCREEN_ID_PATTERN_V1 = "^screen\\.[a-z0-9]+(?:-[a-z0-9]+)*/[a-z0-9]+(?:-[a-z0-9]+)*$";
/** A catalog block: `block.<name>` (page-spec/v1 catalogBlock). */
export const COLLECTION_BLOCK_ID_PATTERN_V1 = PAGE_CATALOG_BLOCK_PATTERN_V1;
/** A catalog variant of the block (page-spec/v1 variant). */
export const COLLECTION_VARIANT_PATTERN_V1 = PAGE_VARIANT_PATTERN_V1;
/** A registry item name (kebab case, e.g. feature-grid). */
export const COLLECTION_REGISTRY_NAME_PATTERN_V1 = "^[a-z0-9]+(?:-[a-z0-9]+)*$";
/** sha256 digest of the Stock asset index (`assets.v0.json` digest, the BuildY catalogDigest). */
export const COLLECTION_DIGEST_PATTERN_V1 = "^sha256:[0-9a-f]{64}$";
export const COLLECTION_COMMIT_PATTERN_V1 = "^[0-9a-f]{7,40}$";
export const COLLECTION_SKIN_PATTERN_V1 = "^[a-z0-9][a-z0-9-]{0,62}$";

export const COLLECTION_LIMITS_V1 = {
  maxItems: 100, maxTitleLength: 160, maxNoteLength: 500, maxShortLength: 200, maxIdLength: 128, maxVariantLength: 40, maxAssetIdLength: 120,
} as const;

/**
 * Checks a reader runs after the schema: no item twice (same kind, id and variant), and at least one item before the
 * collection is handed to Build. Against its own catalog snapshot a host then splits the items into the ones it has and
 * `missing` ones (ids or variants its snapshot lacks); missing items are reported, never replaced by look-alikes.
 */
export const COLLECTION_PROGRAM_CHECKS_V1 = ["duplicate_item", "empty_collection"] as const;
export type CollectionProgramCheckV1 = (typeof COLLECTION_PROGRAM_CHECKS_V1)[number];

export type CollectionScreenItemV1 = { kind: "screen"; id: string; title?: string; note?: string };
export type CollectionBlockItemV1 = { kind: "block"; id: string; variant?: string; registry?: string; title?: string; note?: string };
export type CollectionItemV1 = CollectionScreenItemV1 | CollectionBlockItemV1;

export type CollectionPinsV1 = {
  stock: { repo: string; assetsDigest: string; contentCommit?: string };
  registry?: { url: string; sourceCommit?: string };
};

export type CollectionV1 = {
  $schema?: string;
  format: typeof COLLECTION_FORMAT_V1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
  source?: { app: string; url?: string; version?: string };
  pins: CollectionPinsV1;
  skin?: string | null;
  items: CollectionItemV1[];
};

/** The Stock asset id of an item: the screen id, or `block.<name>/<variant>` (a block without a variant: `block.<name>`). */
export const collectionAssetIdV1 = (item: CollectionItemV1): string =>
  item.kind === "block" && item.variant ? `${item.id}/${item.variant}` : item.id;

/** The program checks of COLLECTION_PROGRAM_CHECKS_V1 that fail on a schema-valid collection (empty: none). */
export function collectionProgramIssuesV1(c: Pick<CollectionV1, "items">): { code: CollectionProgramCheckV1; index?: number }[] {
  const out: { code: CollectionProgramCheckV1; index?: number }[] = [];
  if (!c.items.length) out.push({ code: "empty_collection" });
  const seen = new Set<string>();
  c.items.forEach((item, index) => {
    const key = `${item.kind}:${collectionAssetIdV1(item)}`;
    if (seen.has(key)) out.push({ code: "duplicate_item", index });
    seen.add(key);
  });
  return out;
}

/**
 * Split the items against a host catalog: `has(assetId)` answers whether the snapshot holds the asset (a screen page, a
 * block variant, or a block for an item without a variant). Order is kept; nothing is substituted.
 */
export function splitCollectionV1(c: Pick<CollectionV1, "items">, has: (assetId: string) => boolean): { present: CollectionItemV1[]; missing: CollectionItemV1[] } {
  const present: CollectionItemV1[] = [];
  const missing: CollectionItemV1[] = [];
  for (const item of c.items) (has(collectionAssetIdV1(item)) ? present : missing).push(item);
  return { present, missing };
}
