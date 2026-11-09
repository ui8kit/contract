// Page spec page-spec/v1 and page patch page-patch/v1: the generated schemas are the source, every real page fixture
// (assembled by buildytech/chat from the pinned Stock catalog) and the browser store blob validate, the conformance
// cases of buildytech/chat `parsePage` get the same verdict from the schema (except the documented program checks),
// patch fixtures validate and broken patches are rejected, and the source constants agree with the schemas.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { pagePatch, pageSpec } from "../scripts/schemas-page-spec-v1.ts";
import {
  PAGE_BLOCK_KINDS_V1, PAGE_CHILD_KINDS_V1, PAGE_COPY_KEYS_V1, PAGE_ITEM_SLOTS_V1, PAGE_LAYOUT_VERSION_V1, PAGE_LIMITS_V1,
  PAGE_PATCH_OPS_V1, PAGE_PATCH_SCHEMA_URL_V1, PAGE_PROGRAM_CHECKS_V1, PAGE_SECTION_KINDS_V1, PAGE_SLOTS_V1,
  PAGE_SPEC_PROFILE_V1, PAGE_SPEC_SCHEMA_URL_V1, PAGE_STATUSES_V1,
} from "../src/page-spec-v1.ts";

const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema(pageSpec);
ajv.addSchema(pagePatch);
const at = (def: string) => ajv.getSchema(`${PAGE_SPEC_SCHEMA_URL_V1}#/$defs/${def}`)!;
const page = ajv.getSchema(PAGE_SPEC_SCHEMA_URL_V1)!;
const patch = ajv.getSchema(PAGE_PATCH_SCHEMA_URL_V1)!;
const root = path.resolve(import.meta.dir, "..");
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
const specDir = "fixtures/page-spec";
const pageFiles = fs.readdirSync(path.join(root, specDir)).filter((f) => f.endsWith(".json") && !["store.json", "conformance-cases.json"].includes(f)).sort();
const patchFiles = fs.readdirSync(path.join(root, "fixtures/page-patch")).filter((f) => f.endsWith(".json")).sort();
const errs = (v: ReturnType<typeof ajv.getSchema> & {}, x: unknown) => (v(x) ? [] : v.errors);

describe("page-spec/v1 schemas", () => {
  test("generated files are the source", () => {
    expect(read("schemas/page-spec.schema.json")).toEqual(JSON.parse(JSON.stringify(pageSpec)));
    expect(read("schemas/page-patch.schema.json")).toEqual(JSON.parse(JSON.stringify(pagePatch)));
    expect(read("public/page-spec.schema.json")).toEqual(read("schemas/page-spec.schema.json"));
    expect(read("public/page-patch.schema.json")).toEqual(read("schemas/page-patch.schema.json"));
    expect(pageSpec["x-page-spec-profile"]).toBe(PAGE_SPEC_PROFILE_V1);
  });

  test("source constants agree with the schemas and with buildytech/chat", () => {
    const c = read(`${specDir}/conformance-cases.json`).constants;
    expect(c.layoutVersion).toBe(PAGE_LAYOUT_VERSION_V1);
    expect(c.blockKinds).toEqual([...PAGE_BLOCK_KINDS_V1]);
    expect(c.copyKeys).toEqual([...PAGE_COPY_KEYS_V1]);
    expect(c.statuses).toEqual([...PAGE_STATUSES_V1]);
    for (const [k, v] of Object.entries(c.limits)) expect(PAGE_LIMITS_V1[k as keyof typeof PAGE_LIMITS_V1] as number).toBe(v as number);
    expect(pageSpec.$defs.kind.enum).toEqual([...PAGE_BLOCK_KINDS_V1]);
    expect(Object.keys(pageSpec.$defs.copy.properties)).toEqual([...PAGE_COPY_KEYS_V1]);
    expect(pageSpec.$defs.page.properties.status.enum).toEqual([...PAGE_STATUSES_V1]);
    expect(pageSpec["x-program-checks"]).toEqual([...PAGE_PROGRAM_CHECKS_V1]);
    expect(pagePatch.$defs.op.oneOf.map((o) => o.properties.op.const)).toEqual([...PAGE_PATCH_OPS_V1]);
  });

  test("slots cover every kind; rows are child kinds with their row fields", () => {
    expect(Object.keys(PAGE_SLOTS_V1).sort()).toEqual([...PAGE_BLOCK_KINDS_V1].sort());
    for (const [kind, slot] of Object.entries(PAGE_SLOTS_V1)) {
      for (const key of slot.copy) expect(PAGE_COPY_KEYS_V1).toContain(key);
      if ("items" in slot) {
        expect(PAGE_SECTION_KINDS_V1 as string[]).toContain(kind);
        expect(PAGE_CHILD_KINDS_V1 as readonly string[]).toContain(slot.items.kind);
        expect((pageSpec["x-page-slots"] as Record<string, any>)[kind].items.fields).toEqual([...PAGE_ITEM_SLOTS_V1[slot.items.kind]]);
      }
      expect((pageSpec["x-page-slots"] as Record<string, any>)[kind].copy).toContain("badge");
    }
  });
});

describe("page-spec/v1 fixtures", () => {
  test("real pages: one per scenario plus the chat contract fixture", () => {
    expect(pageFiles).toEqual(["dashboard-ru-demo.json", "landing-en.json", "north-harbor-kitchen.json", "website-en.json"]);
  });
  for (const f of pageFiles) test(f, () => expect(errs(page, read(`${specDir}/${f}`))).toEqual([]));
  test("browser store blob (legacy record without provenance included)", () => expect(errs(at("store"), read(`${specDir}/store.json`))).toEqual([]));
  test("every slot the real pages fill is a slot of its kind", () => {
    const walk = (blocks: any[]): any[] => blocks.flatMap((b) => [b, ...walk(b.children ?? [])]);
    for (const f of pageFiles.filter((f) => f !== "north-harbor-kitchen.json")) {
      for (const b of walk(read(`${specDir}/${f}`).layout.blocks)) {
        const allowed = pageSpec["x-page-slots"][b.kind as keyof typeof PAGE_SLOTS_V1].copy as string[];
        for (const key of Object.keys(b.copy ?? {})) expect(`${f} ${b.kind}.${key} ${allowed.includes(key)}`).toBe(`${f} ${b.kind}.${key} true`);
      }
    }
  });
});

describe("page-spec/v1 agrees with parsePage conformance cases", () => {
  const spec = read(`${specDir}/conformance-cases.json`);
  const base = read(`${specDir}/${spec.validDraft}`);
  const apply = (c: any) => {
    const doc = structuredClone(base);
    for (const op of c.set ?? []) {
      let cur: any = doc;
      for (const seg of op.path.slice(0, -1)) cur = cur[seg];
      cur[op.path.at(-1)] = op.value;
    }
    if (c.repeatTitle) doc.title = "n".repeat(c.repeatTitle);
    if (c.repeatSlug) doc.slug = "a".repeat(c.repeatSlug);
    for (let i = 0; i < (c.padBlocks ?? 0); i++) doc.layout.blocks.push({ id: `block-extra-${i}`, kind: "feature", title: "Extra", summary: "Padding block for the count limit." });
    if (c.nestDepth) {
      const nest = (d: number): any => ({ id: `block-d${d}`, kind: "feature", title: "Nested", summary: "Depth probe.", ...(d > 1 ? { children: [nest(d - 1)] } : {}) });
      doc.layout.blocks = [nest(c.nestDepth)];
    }
    return doc;
  };
  for (const c of spec.cases) {
    // A case parsePage accepts must pass the schema; a case it rejects must fail it, unless the rejection is a
    // program check (x-program-checks: the schema may or may not see it) or the draft-only status rule of
    // parseDraftPage (a creation mode, not a shape).
    const program = (PAGE_PROGRAM_CHECKS_V1 as readonly string[]).includes(c.code);
    const draftOnly = c.parser === "draft" && c.code === "invalid_status";
    const expected = !c.code || draftOnly ? "valid" : program ? "program" : "invalid";
    test(`${c.name} -> ${expected}`, () => {
      const valid = page(apply(c));
      if (expected !== "program") expect(valid).toBe(expected === "valid");
      if (c.code === "duplicate_id") expect(valid).toBe(true); // only the program sees duplicates
    });
  }
});

describe("page-patch/v1", () => {
  for (const f of patchFiles)
    test(f, () => {
      const { base, patch: p } = read(`fixtures/page-patch/${f}`);
      expect(fs.existsSync(path.join(root, specDir, base))).toBe(true);
      expect(errs(patch, p)).toEqual([]);
    });
  const ok = { ops: [{ op: "set", blockId: "block-hero", field: "headline", value: "Hi" }] };
  const bad: [string, any][] = [
    ["no ops", { ops: [] }],
    ["unknown op", { ops: [{ op: "rewrite", blockId: "block-hero" }] }],
    ["caller-supplied layout", { ops: ok.ops, layout: { version: 1, blocks: [] } }],
    ["unknown copy key", { ops: [{ op: "set", blockId: "block-hero", field: "promo", value: "x" }] }],
    ["markup in value", { ops: [{ op: "set", blockId: "block-hero", field: "lede", value: "<b>x</b>" }] }],
    ["javascript url", { ops: [{ op: "set", blockId: "block-cta", field: "action", value: "java\nscript:alert(1)" }] }],
    ["bad block id", { ops: [{ op: "remove", blockId: "Block_Hero" }] }],
    ["add a row kind", { ops: [{ op: "add", kind: "metric" }] }],
    ["add unknown kind", { ops: [{ op: "add", kind: "carousel" }] }],
    ["row without label", { ops: [{ op: "set_items", blockId: "block-chart", items: [{ value: "1" }] }] }],
    ["row unknown field", { ops: [{ op: "set_items", blockId: "block-chart", items: [{ label: "a", price: "1" }] }] }],
    ["too many rows", { ops: [{ op: "set_items", blockId: "block-chart", items: Array.from({ length: 13 }, (_, i) => ({ label: `r${i}` })) }] }],
    ["negative move", { ops: [{ op: "move", blockId: "block-cta", to: -1 }] }],
    ["set_page unknown field", { ops: [{ op: "set_page", field: "slug", value: "x" }] }],
    ["extra key on op", { ops: [{ op: "remove", blockId: "block-cta", why: "x" }] }],
  ];
  test("minimal patch", () => expect(errs(patch, ok)).toEqual([]));
  for (const [name, p] of bad) test(`rejects: ${name}`, () => expect(patch(p)).toBe(false));
});
