// Page spec page-spec/v2 and page patch page-patch/v2: the generated schemas are the source, the fixtures validate,
// broken documents and patches are rejected, the source constants agree with the schemas, and page-spec/v1 stays published.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { pagePatch, pageSpec } from "../scripts/schemas-page-spec-v1.ts";
import { pagePatchV2, pageSpecV2 } from "../scripts/schemas-page-spec-v2.ts";
import { sessionSchema } from "../scripts/schemas-session-v1.ts";
import { collectionSchema } from "../scripts/schemas-collection-v1.ts";
import {
  PAGE_HOST_CHECKS_V2, PAGE_LIMITS_V2, PAGE_PATCH_LIMITS_V2, PAGE_PATCH_OPS_V2, PAGE_PATCH_PATH_PATTERN_V2, PAGE_PATCH_SCHEMA_URL_V2,
  PAGE_PROGRAM_CHECKS_V2, PAGE_SPEC_PROFILE_V2, PAGE_SPEC_SCHEMA_URL_V2,
} from "../src/page-spec-v2.ts";
import { SESSION_SCHEMA_URL_V1 } from "../src/session-v1.ts";

const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema(pageSpec);
ajv.addSchema(pagePatch);
ajv.addSchema(pageSpecV2);
ajv.addSchema(pagePatchV2);
ajv.addSchema(collectionSchema);
ajv.addSchema(sessionSchema);
const page = ajv.getSchema(PAGE_SPEC_SCHEMA_URL_V2)!;
const patch = ajv.getSchema(PAGE_PATCH_SCHEMA_URL_V2)!;
const record = ajv.getSchema(`${PAGE_SPEC_SCHEMA_URL_V2}#/$defs/record`)!;
const session = ajv.getSchema(SESSION_SCHEMA_URL_V1)!;
const root = path.resolve(import.meta.dir, "..");
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
const errs = (v: ReturnType<typeof ajv.getSchema> & {}, x: unknown) => (v(x) ? [] : v.errors);
const doc = () => read("fixtures/page-spec-v2/landing-fitness.json");

describe("page-spec/v2 schemas", () => {
  test("generated files are the source; v1 stays published", () => {
    expect(read("schemas/page-spec-v2.schema.json")).toEqual(JSON.parse(JSON.stringify(pageSpecV2)));
    expect(read("schemas/page-patch-v2.schema.json")).toEqual(JSON.parse(JSON.stringify(pagePatchV2)));
    expect(read("public/page-spec-v2.schema.json")).toEqual(read("schemas/page-spec-v2.schema.json"));
    expect(read("public/page-patch-v2.schema.json")).toEqual(read("schemas/page-patch-v2.schema.json"));
    expect(read("schemas/page-spec.schema.json")).toEqual(JSON.parse(JSON.stringify(pageSpec)));
    expect(read("public/page-spec.schema.json")["x-page-spec-profile"]).toBe("page-spec/v1");
    expect(pageSpecV2["x-page-spec-profile"]).toBe(PAGE_SPEC_PROFILE_V2);
  });

  test("source constants agree with the schemas", () => {
    expect(pageSpecV2["x-program-checks"]).toEqual([...PAGE_PROGRAM_CHECKS_V2]);
    expect(pageSpecV2["x-host-checks"]).toEqual([...PAGE_HOST_CHECKS_V2]);
    expect(pageSpecV2["x-limits"]).toEqual({ ...PAGE_LIMITS_V2 });
    expect(pageSpecV2.$defs.page.properties.blocks.maxItems).toBe(PAGE_LIMITS_V2.maxBlocks);
    expect(pagePatchV2.$defs.op.oneOf.map((o) => o.properties.op.const)).toEqual([...PAGE_PATCH_OPS_V2]);
    expect(pagePatchV2.maxItems).toBe(PAGE_PATCH_LIMITS_V2.maxOps);
  });

  test("the model has no kind, copy, children or family", () => {
    const keys = Object.keys(pageSpecV2.$defs.block.properties);
    expect(keys).toEqual(["id", "item", "variant", "props"]);
    expect(Object.keys(pageSpecV2.$defs.page.properties)).not.toContain("layout");
  });
});

describe("page-spec/v2 documents", () => {
  test("the fixture validates", () => expect(errs(page, doc())).toEqual([]));
  test("the minimal document validates (host-managed fields and variant are optional)", () =>
    expect(errs(page, { version: 2, slug: "home", title: "Home", locale: "en", blocks: [{ id: "block-hero", item: "hero-split" }] })).toEqual([]));
  test("props may carry the 34 UI words of a dish block (up to 64 keys per object)", () => {
    const labels = Object.fromEntries(Array.from({ length: 34 }, (_, i) => [`word${i}`, ""]));
    expect(errs(page, { version: 2, slug: "home", title: "Home", locale: "en", blocks: [{ id: "block-menu", item: "menu-board", props: { labels } }] })).toEqual([]);
    const tooMany = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`word${i}`, ""]));
    expect((errs(page, { version: 2, slug: "home", title: "Home", locale: "en", blocks: [{ id: "block-menu", item: "menu-board", props: { labels: tooMany } }] }) ?? []).length).toBeGreaterThan(0);
  });
  test("a prop string may hold { } (registry templates such as ?paged={0}); markup and URL schemes stay rejected", () => {
    const withProp = (value: string) => ({ version: 2, slug: "home", title: "Home", locale: "en", blocks: [{ id: "block-posts", item: "post-grid", props: { pager: { url: value } } }] });
    expect(errs(page, withProp("?paged={0}"))).toEqual([]);
    for (const value of ["<b>x</b>", "javascript:alert(1)", "a\u0001b"]) expect((errs(page, withProp(value)) ?? []).length).toBeGreaterThan(0);
    // titles and other fields keep the strict safeText
    expect((errs(page, { version: 2, slug: "home", title: "{x}", locale: "en", blocks: [{ id: "block-a", item: "hero-split" }] }) ?? []).length).toBeGreaterThan(0);
  });
  const bad: Array<[string, (d: any) => void]> = [
    ["v1 layout", (d) => { d.layout = { version: 1, blocks: [] }; }],
    ["no version", (d) => { delete d.version; }],
    ["version 1", (d) => { d.version = 1; }],
    ["block with kind", (d) => { d.blocks[0].kind = "nav"; }],
    ["block with copy", (d) => { d.blocks[0].copy = { headline: "x" }; }],
    ["block with children", (d) => { d.blocks[0].children = []; }],
    ["block without item", (d) => { delete d.blocks[0].item; }],
    ["item not a registry name", (d) => { d.blocks[0].item = "Hero Split"; }],
    ["bad block id", (d) => { d.blocks[0].id = "Block_1"; }],
    ["variant with a space", (d) => { d.blocks[1].variant = "quote stats"; }],
    ["bad locale", (d) => { d.locale = "Russian"; }],
    ["bad slug", (d) => { d.slug = "Home Page"; }],
    ["empty title", (d) => { d.title = " "; }],
    ["markup in props", (d) => { d.blocks[1].props.title = "<b>x</b>"; }],
    ["javascript url in props", (d) => { d.blocks[1].props.actions.primaryHref = "java\nscript:alert(1)"; }],
    ["props key not a prop name", (d) => { d.blocks[1].props["a b"] = "x"; }],
    ["props as a pointer map key", (d) => { d.blocks[1].props["/content/stats"] = []; }],
    ["too many blocks", (d) => { d.blocks = Array.from({ length: PAGE_LIMITS_V2.maxBlocks + 1 }, (_, i) => ({ id: `block-${i}`, item: "hero-split" })); }],
    ["unknown key", (d) => { d.layoutBlocks = []; }],
  ];
  for (const [name, mutate] of bad)
    test(`rejects: ${name}`, () => {
      const d = doc();
      mutate(d);
      expect(page(d)).toBe(false);
    });
});

describe("page-patch/v2 (RFC 6902)", () => {
  test("the fixture patch validates", () => {
    const { base, patch: p } = read("fixtures/page-patch-v2/replace-and-add.json");
    expect(fs.existsSync(path.join(root, "fixtures/page-spec-v2", base))).toBe(true);
    expect(errs(patch, p)).toEqual([]);
  });
  const ok = [{ op: "replace", path: "/blocks/1/props/title", value: "Hi" }];
  test("minimal patch", () => expect(errs(patch, ok)).toEqual([]));
  test("every operation of RFC 6902", () =>
    expect(errs(patch, [
      { op: "test", path: "/locale", value: "en" },
      { op: "add", path: "/blocks/-", value: { id: "block-cta", item: "cta-band" } },
      { op: "copy", from: "/blocks/1", path: "/blocks/-" },
      { op: "move", from: "/blocks/2", path: "/blocks/0" },
      { op: "remove", path: "/blocks/3" },
      { op: "replace", path: "/seo/title", value: "SEO" },
    ])).toEqual([]));
  const bad: Array<[string, unknown]> = [
    ["empty patch", []],
    ["an object, not an array", { ops: ok }],
    ["unknown op", [{ op: "merge", path: "/title", value: "x" }]],
    ["no value on replace", [{ op: "replace", path: "/title" }]],
    ["no from on move", [{ op: "move", path: "/blocks/0" }]],
    ["extra key", [{ op: "remove", path: "/blocks/0", why: "x" }]],
    ["path outside the document", [{ op: "replace", path: "/status", value: "published" }]],
    ["path to the page id", [{ op: "replace", path: "/id", value: "x" }]],
    ["path to a block kind", [{ op: "add", path: "/blocks/0/kind", value: "hero" }]],
    ["path without a leading slash", [{ op: "replace", path: "title", value: "x" }]],
    ["too many operations", Array.from({ length: PAGE_PATCH_LIMITS_V2.maxOps + 1 }, () => ok[0])],
  ];
  for (const [name, p] of bad) test(`rejects: ${name}`, () => expect(patch(p)).toBe(false));
  test("path pattern accepts block, props and page field pointers only", () => {
    const re = new RegExp(PAGE_PATCH_PATH_PATTERN_V2);
    for (const p of ["/title", "/seo/title", "/blocks", "/blocks/-", "/blocks/12", "/blocks/3/item", "/blocks/3/props", "/blocks/3/props/content/stats/0/value"]) expect(re.test(p)).toBe(true);
    for (const p of ["/", "/layout", "/blocks/x", "/blocks/100", "/blocks/1/kind", "/seo/keywords"]) expect(re.test(p)).toBe(false);
  });
});

describe("page-spec/v2 records and the session (1.8.0)", () => {
  const rec = () => ({ applied: doc(), candidate: null, lastProposed: null, appliedProvenance: { screenId: "screen.theme-marketing-landing/teams", scenarioId: "landing", missing: [] }, selectedBlockId: null, revision: 2 });
  test("a v2 record validates", () => expect(errs(record, rec())).toEqual([]));
  test("a v1 page is not a v2 record", () => expect(record({ applied: read("fixtures/page-spec/landing-en.json") })).toBe(false));
  const file = (chat: Record<string, unknown>) => {
    const base = read("fixtures/session/minimal.json");
    return { ...base, sessions: [{ ...base.sessions[0], ...chat }] };
  };
  test("a session with a v2 page record and a write_page proposal (Ask) validates", () => {
    const chat = {
      pageRevision: 2,
      page: rec(),
      messages: [
        { id: "m1", role: "user", text: "Make it a fitness page", createdAt: "2026-11-13T12:00:00.000Z", mode: "ask" },
        { id: "m2", role: "assistant", text: "Proposal", createdAt: "2026-11-13T12:00:01.000Z", mode: "ask", proposal: { applied: false, status: "pending", origin: "ask-proposal", baseRevision: 2, page: doc(), diff: [{ scope: "block", change: "changed", id: "block-hero", paths: ["/title"] }, { scope: "block", change: "added", id: "block-steps", item: "steps-row", variant: "row", to: 2 }, { scope: "page", change: "changed", paths: ["/locale"] }] } },
      ],
    };
    expect(errs(session, file(chat))).toEqual([]);
  });
  test("a session with a v1 page record still validates", () => {
    const v1 = read("fixtures/page-spec/store.json");
    const first = Object.values(v1.pages)[0] as Record<string, unknown>;
    expect(errs(session, file({ page: first, pageRevision: (first.revision as number) ?? undefined }))).toEqual([]);
  });
  test("the diff is closed", () => {
    const chat = { messages: [{ id: "m2", role: "assistant", text: "x", createdAt: "2026-11-13T12:00:01.000Z", proposal: { applied: false, diff: [{ scope: "block", change: "renamed" }] } }] };
    expect(session(file(chat))).toBe(false);
  });
});
