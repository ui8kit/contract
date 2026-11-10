// Collection buildy-collection:v1: the generated schema is the source, the fixtures validate, broken files are rejected,
// the program checks and the split against a host catalog behave, and the source constants agree with the schema.
// The schema also stays inside the keyword subset of the buildytech/chat browser validator.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { collectionSchema } from "../scripts/schemas-collection-v1.ts";
import {
  COLLECTION_FORMAT_V1, COLLECTION_ITEM_KINDS_V1, COLLECTION_LIMITS_V1, COLLECTION_PROGRAM_CHECKS_V1, COLLECTION_SCHEMA_URL_V1, COLLECTION_VERSION_V1,
  collectionAssetIdV1, collectionProgramIssuesV1, splitCollectionV1, type CollectionV1,
} from "../src/collection-v1.ts";

const ajv = new Ajv2020({ strict: false, allErrors: true });
const file = ajv.compile(collectionSchema);
const root = path.resolve(import.meta.dir, "..");
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
const dir = "fixtures/collection";
const fixtures = fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".json")).sort();
const errs = (x: unknown) => (file(x) ? [] : file.errors);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// the keywords the chat's page-contract json-schema.ts validates, plus annotations; anything else would throw there
const SUBSET = new Set([
  "$schema", "$id", "$defs", "title", "description", "default", "examples",
  "$ref", "allOf", "anyOf", "oneOf", "not", "type", "enum", "const", "pattern", "minLength", "maxLength",
  "minimum", "maximum", "minItems", "maxItems", "items", "properties", "required", "additionalProperties",
]);
function keywords(s: unknown, out: Set<string>, inProps = false): Set<string> {
  if (Array.isArray(s)) { for (const x of s) keywords(x, out); return out; }
  if (!s || typeof s !== "object") return out;
  for (const [k, v] of Object.entries(s)) {
    if (!inProps && !k.startsWith("x-")) out.add(k);
    if (k.startsWith("x-") || k === "const" || k === "enum") continue;
    keywords(v, out, k === "properties" || k === "$defs");
  }
  return out;
}

describe("collection buildy-collection:v1 schema", () => {
  test("generated files are the source", () => {
    expect(read("schemas/collection.schema.json")).toEqual(JSON.parse(JSON.stringify(collectionSchema)));
    expect(read("public/collection.schema.json")).toEqual(read("schemas/collection.schema.json"));
    expect(collectionSchema.$id).toBe(COLLECTION_SCHEMA_URL_V1);
    expect(COLLECTION_SCHEMA_URL_V1).toBe("https://schema.buildy.tw/collection.schema.json");
  });

  test("source constants agree with the schema", () => {
    const d = collectionSchema.$defs as Record<string, any>;
    expect(collectionSchema["x-collection-format"]).toBe(COLLECTION_FORMAT_V1);
    expect(collectionSchema["x-collection-version"]).toBe(COLLECTION_VERSION_V1);
    expect(collectionSchema.properties.format.const).toBe(COLLECTION_FORMAT_V1);
    expect([d.screenItem.properties.kind.const, d.blockItem.properties.kind.const]).toEqual([...COLLECTION_ITEM_KINDS_V1]);
    expect(collectionSchema["x-program-checks"]).toEqual([...COLLECTION_PROGRAM_CHECKS_V1]);
    expect(collectionSchema["x-limits"]).toEqual({ ...COLLECTION_LIMITS_V1 });
    expect(collectionSchema.properties.items.maxItems).toBe(COLLECTION_LIMITS_V1.maxItems);
  });

  test("stays inside the chat validator's keyword subset", () => {
    const used = keywords(collectionSchema, new Set());
    expect([...used].filter((k) => !SUBSET.has(k))).toEqual([]);
  });

  test("fixtures validate and pass the program checks", () => {
    expect(fixtures).toEqual(["grill-delivery.json", "minimal.json"]);
    for (const f of fixtures) {
      const x = read(`${dir}/${f}`);
      expect({ f, e: errs(x) }).toEqual({ f, e: [] });
      expect({ f, p: collectionProgramIssuesV1(x) }).toEqual({ f, p: [] });
    }
  });

  test("broken files are rejected", () => {
    const base = read(`${dir}/grill-delivery.json`);
    const cases: Array<[string, (x: any) => void]> = [
      ["wrong format", (x) => { x.format = "buildy-collection:v2"; }],
      ["no pins", (x) => { delete x.pins; }],
      ["no digest", (x) => { delete x.pins.stock.assetsDigest; }],
      ["bad digest", (x) => { x.pins.stock.assetsDigest = "md5:abc"; }],
      ["short commit", (x) => { x.pins.stock.contentCommit = "abc"; }],
      ["unknown root key", (x) => { x.token = "x"; }],
      ["unknown item key", (x) => { x.items[1].props = {}; }],
      ["bad kind", (x) => { x.items[0].kind = "page"; }],
      ["screen id as block", (x) => { x.items[1].id = "screen.site/home"; }],
      ["variant asset id as block id", (x) => { x.items[1].id = "block.hero/centered"; }],
      ["variant on a screen", (x) => { x.items[0].variant = "home"; }],
      ["bad variant", (x) => { x.items[1].variant = "1col"; }],
      ["bad registry name", (x) => { x.items[1].registry = "Hero Classic"; }],
      ["empty title", (x) => { x.title = ""; }],
      ["local time", (x) => { x.createdAt = "2026-11-11 10:00"; }],
      ["bad skin", (x) => { x.skin = "Rose"; }],
      ["too many items", (x) => { x.items = Array.from({ length: COLLECTION_LIMITS_V1.maxItems + 1 }, () => x.items[0]); }],
      ["long note", (x) => { x.items[0].note = "x".repeat(COLLECTION_LIMITS_V1.maxNoteLength + 1); }],
    ];
    for (const [name, mutate] of cases) {
      const x = clone(base);
      mutate(x);
      expect({ name, ok: file(x) }).toEqual({ name, ok: false });
    }
  });

  test("program checks: duplicates and an empty set", () => {
    const base = read(`${dir}/grill-delivery.json`) as CollectionV1;
    const dup = clone(base);
    dup.items.push({ kind: "block", id: "block.hero", variant: "centered" });
    expect(collectionProgramIssuesV1(dup)).toEqual([{ code: "duplicate_item", index: 5 }]);
    const other = clone(base);
    other.items.push({ kind: "block", id: "block.hero", variant: "backdrop" });
    expect(collectionProgramIssuesV1(other)).toEqual([]);
    const empty = clone(base);
    empty.items = [];
    expect(errs(empty)).toEqual([]);
    expect(collectionProgramIssuesV1(empty)).toEqual([{ code: "empty_collection" }]);
  });

  test("split against a host catalog keeps order and never substitutes", () => {
    const base = read(`${dir}/grill-delivery.json`) as CollectionV1;
    expect(base.items.map(collectionAssetIdV1)).toEqual([
      "screen.theme-food-grill/home", "block.hero/centered", "block.dishshowcase/grid3", "block.grillbuilder/split", "block.menuboard",
    ]);
    const snapshot = new Set(["screen.theme-food-grill/home", "block.hero/centered", "block.menuboard", "block.dishshowcase/grid4"]);
    const { present, missing } = splitCollectionV1(base, (id) => snapshot.has(id));
    expect(present.map(collectionAssetIdV1)).toEqual(["screen.theme-food-grill/home", "block.hero/centered", "block.menuboard"]);
    expect(missing.map(collectionAssetIdV1)).toEqual(["block.dishshowcase/grid3", "block.grillbuilder/split"]);
  });
});
