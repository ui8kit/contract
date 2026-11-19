// Block contract block-contract/v1: the generated schema is the source, the contracts codegen-x publishes validate
// (fixtures/block-contract: hero-simple, team-simple), the optional variants[].settings takes the known settings with
// their values only, the program checks behave, and the schema stays inside the keyword subset of the chat validator.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { blockContractSchema } from "../scripts/schemas-block-contract-v1.ts";
import { BLOCK_ALIGNS_V1, BLOCK_CONTRACT_SCHEMA_URL_V1, blockContractProgramIssuesV1, variantSettingsV1, type BlockContractV1 } from "../src/block-contract-v1.ts";

const ajv = new Ajv2020({ strict: false, allErrors: true });
const valid = ajv.compile(blockContractSchema);
const root = path.resolve(import.meta.dir, "..");
const dir = path.join(root, "fixtures/block-contract");
const fixtures = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
const read = (f: string): BlockContractV1 => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
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

describe("block contract block-contract/v1 schema", () => {
  test("the committed schema is the generated one, at its stable URL", () => {
    const file = JSON.parse(fs.readFileSync(path.join(root, "schemas/block-contract.schema.json"), "utf8"));
    expect(file).toEqual(JSON.parse(JSON.stringify(blockContractSchema)));
    expect(file.$id).toBe(BLOCK_CONTRACT_SCHEMA_URL_V1);
  });

  test("keywords stay inside the browser validator subset", () => {
    expect([...keywords(blockContractSchema, new Set())].filter((k) => !SUBSET.has(k))).toEqual([]);
  });

  for (const f of fixtures) test(`${f} validates and passes the program checks`, () => {
    const c = read(f);
    expect(valid(c), JSON.stringify(valid.errors)).toBe(true);
    expect(blockContractProgramIssuesV1(c)).toEqual([]);
  });

  test("variants[].settings is optional; align takes start | center | end", () => {
    const hero = read("hero-simple.json");
    expect(hero.variants.find((v) => v.id === "mediaTop")!.settings).toEqual({ align: "center" });
    const none = clone(hero);
    for (const v of none.variants) delete v.settings;
    expect(valid(none)).toBe(true);
    for (const a of BLOCK_ALIGNS_V1) {
      const c = clone(hero);
      c.variants[0]!.settings = { align: a };
      expect(valid(c), a).toBe(true);
    }
  });

  test("variants[].settings rejects a physical side, an unknown setting and a wrong value", () => {
    const hero = read("hero-simple.json");
    for (const bad of [{ align: "left" }, { align: "right" }, { color: "red" }, { padding: "huge" }, { level: 4 }]) {
      const c = clone(hero) as unknown as { variants: Array<{ settings?: unknown }> };
      c.variants[0]!.settings = bad;
      expect(valid(c), JSON.stringify(bad)).toBe(false);
    }
  });

  test("closed objects: an unknown key in a contract or a variant is rejected", () => {
    const c = clone(read("team-simple.json")) as unknown as Record<string, unknown> & { variants: Array<Record<string, unknown>> };
    expect(valid({ ...c, extra: 1 })).toBe(false);
    c.variants[0]!.props = {};
    expect(valid(c)).toBe(false);
  });

  test("variantSettingsV1: contract defaults, then the variant's own", () => {
    const hero = read("hero-simple.json");
    expect(variantSettingsV1(hero, "mediaTop")).toEqual({ level: 2, padding: "standard", align: "center" });
    expect(variantSettingsV1(hero, "mediaEnd").align).toBe("start");
    expect(variantSettingsV1(hero, "nope").align).toBe("start");
  });

  test("program checks: unknown default variant, axis, axis value and mode", () => {
    const c = clone(read("hero-simple.json"));
    c.defaultVariant = "nope";
    c.variants[0]!.axes = { media: "middle", side: "x" };
    (c as { defaultMode: string }).defaultMode = "clean";
    expect(blockContractProgramIssuesV1(c).map((i) => i.code).sort()).toEqual(["default_mode_unknown", "default_variant_unknown", "variant_axis_unknown", "variant_axis_value"]);
  });
});
