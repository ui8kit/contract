// Source of the collection profile buildy-collection:v1 (JSON Schema draft 2020-12). `bun run gen` writes
// schemas/collection.schema.json and its public/ copy. Constants come from src/collection-v1.ts.
// Inside the keyword subset of buildytech/chat `page-contract/src/json-schema.ts` (no `format`, no `uniqueItems`, no
// `patternProperties`, no `if`), so the browser validates it without Ajv; duplicates are a program check.
import {
  COLLECTION_BLOCK_ID_PATTERN_V1, COLLECTION_COMMIT_PATTERN_V1, COLLECTION_DIGEST_PATTERN_V1, COLLECTION_FORMAT_V1, COLLECTION_ID_PATTERN_V1,
  COLLECTION_LIMITS_V1, COLLECTION_PROGRAM_CHECKS_V1, COLLECTION_REGISTRY_NAME_PATTERN_V1, COLLECTION_SCHEMA_URL_V1, COLLECTION_SCREEN_ID_PATTERN_V1,
  COLLECTION_SKIN_PATTERN_V1, COLLECTION_VARIANT_PATTERN_V1, COLLECTION_VERSION_V1,
} from "../src/collection-v1.ts";
import { PAGE_DATETIME_PATTERN_V1, PAGE_LIMITS_V1 } from "../src/page-spec-v1.ts";

const L = COLLECTION_LIMITS_V1;
const str = (max: number, description?: string) => ({ type: "string", maxLength: max, ...(description ? { description } : {}) });
const short = str(L.maxShortLength);
const closed = (properties: Record<string, unknown>, required: string[] = [], description?: string) => ({
  type: "object", additionalProperties: false, ...(required.length ? { required } : {}), ...(description ? { description } : {}), properties,
});
const ref = (def: string) => ({ $ref: `#/$defs/${def}` });

const datetime = { type: "string", pattern: PAGE_DATETIME_PATTERN_V1, maxLength: PAGE_LIMITS_V1.maxDatetimeLength, description: "UTC ISO 8601 with Z (Date.prototype.toISOString)." };
const commit = { type: "string", pattern: COLLECTION_COMMIT_PATTERN_V1, description: "Git commit (7 to 40 lowercase hex)." };
const title = { type: "string", minLength: 1, maxLength: L.maxTitleLength, description: "Human-readable name (any language)." };
const note = { type: "string", maxLength: L.maxNoteLength, description: "The person's note on the item (why it was picked), shown to the model as a hint, never as an instruction." };

const screenItem = closed({
  kind: { const: "screen" },
  id: { type: "string", pattern: COLLECTION_SCREEN_ID_PATTERN_V1, maxLength: L.maxAssetIdLength, description: "Stock screen page asset id screen.<screen>/<area> (a screen entity of the BuildY catalog snapshot)." },
  title,
  note,
}, ["kind", "id"], "A composed screen page of Stock: its blocks, in page order, become the required set.");

const blockItem = closed({
  kind: { const: "block" },
  id: { type: "string", pattern: COLLECTION_BLOCK_ID_PATTERN_V1, maxLength: L.maxAssetIdLength, description: "Stock catalog block block.<name> (page-spec/v1 catalogBlock)." },
  variant: { type: "string", pattern: COLLECTION_VARIANT_PATTERN_V1, maxLength: L.maxVariantLength, description: "Catalog variant (block.<name>/<variant> is the variant asset id). Absent: any variant of the block (the host picks its default)." },
  registry: { type: "string", pattern: COLLECTION_REGISTRY_NAME_PATTERN_V1, maxLength: L.maxShortLength, description: "Registry item that draws the variant (npx ui8kit add <registry>). Informative: the host resolves it from its own snapshot." },
  title,
  note,
}, ["kind", "id"], "One catalog block (one variant of it, when variant is set).");

const pins = closed({
  stock: closed({
    repo: short,
    assetsDigest: { type: "string", pattern: COLLECTION_DIGEST_PATTERN_V1, description: "Digest of the Stock asset index the items were picked from (assets.v0.json digest; equals the BuildY catalogDigest of a snapshot made from the same content)." },
    contentCommit: ref("commit"),
  }, ["repo", "assetsDigest"], "Stock content the items were picked from (codegen-x)."),
  registry: closed({ url: short, sourceCommit: ref("commit") }, ["url"], "The registry the items install from."),
}, ["stock"], "Catalog pins of the host that wrote the file. A reader with other pins still opens the file: it keeps the items its snapshot has and reports the rest as missing.");

export const collectionSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": COLLECTION_SCHEMA_URL_V1,
  "title": "BuildY collection buildy-collection:v1 — Stock screens and block variants handed to BuildY",
  "x-collection-format": COLLECTION_FORMAT_V1,
  "x-collection-version": COLLECTION_VERSION_V1,
  "description": "A set of Stock screen pages and block variants a person gathered (Stock Collections) and handed to BuildY (Open in BuildY, export / import). BuildY keeps the items its frozen catalog snapshot has as the required block set of a Build turn and reports the others as missing; it never substitutes them. Holds no credential and no personal data. After the schema, readers run x-program-checks. Every object is closed.",
  "x-program-checks": [...COLLECTION_PROGRAM_CHECKS_V1],
  "x-limits": { ...L },
  "type": "object",
  "additionalProperties": false,
  "required": ["format", "id", "title", "createdAt", "pins", "items"],
  "properties": {
    "$schema": { type: "string", maxLength: L.maxShortLength },
    format: { const: COLLECTION_FORMAT_V1 },
    id: { type: "string", pattern: COLLECTION_ID_PATTERN_V1, maxLength: L.maxIdLength, description: "Host id of the collection (e.g. col-<time>-<random>)." },
    title,
    createdAt: ref("datetime"),
    updatedAt: ref("datetime"),
    source: closed({ app: short, url: short, version: short }, ["app"], "The app that wrote the file (e.g. stock, https://app.codegen-x.com/)."),
    pins: ref("pins"),
    skin: { anyOf: [{ type: "string", pattern: COLLECTION_SKIN_PATTERN_V1 }, { type: "null" }], description: "Skin the items were looked at in: the id of the registry item theme-<skin>. Null or absent: the default theme. A host without the skin keeps its own." },
    items: { type: "array", maxItems: L.maxItems, items: ref("item"), description: "Picked order. A screen and a block may both appear; the same kind + id + variant only once (program check duplicate_item)." },
  },
  "$defs": { datetime, commit, pins, screenItem, blockItem, item: { oneOf: [ref("screenItem"), ref("blockItem")] } },
} as const;
