// Session buildy:v1: the generated schema is the source, a real file exported by buildytech/chat (`window.buildy.export()`)
// and a minimal file validate, broken files are rejected, the program-check fields of the fixtures hold and the
// source constants agree with the schema.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { pageSpec } from "../scripts/schemas-page-spec-v1.ts";
import { sessionSchema } from "../scripts/schemas-session-v1.ts";
import { collectionSchema } from "../scripts/schemas-collection-v1.ts";
import {
  SESSION_FORMAT_V1, SESSION_HOSTS_V1, SESSION_LIMITS_V1, SESSION_MODES_V1, SESSION_OPEN_RECORDS_V1, SESSION_PROGRAM_CHECKS_V1,
  SESSION_REVISION_CAUSES_V1, SESSION_ROLES_V1, SESSION_SCHEMA_URL_V1, SESSION_VERSION_V1,
} from "../src/session-v1.ts";

const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema(pageSpec);
ajv.addSchema(collectionSchema);
ajv.addSchema(sessionSchema);
const file = ajv.getSchema(SESSION_SCHEMA_URL_V1)!;
const root = path.resolve(import.meta.dir, "..");
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
const dir = "fixtures/session";
const fixtures = fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".json")).sort();
const errs = (x: unknown) => (file(x) ? [] : file.errors);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe("session buildy:v1 schema", () => {
  test("generated files are the source", () => {
    expect(read("schemas/session.schema.json")).toEqual(JSON.parse(JSON.stringify(sessionSchema)));
    expect(read("public/session.schema.json")).toEqual(read("schemas/session.schema.json"));
    expect(sessionSchema.$id).toBe(SESSION_SCHEMA_URL_V1);
  });

  test("source constants agree with the schema", () => {
    const d = sessionSchema.$defs as Record<string, any>;
    expect(sessionSchema["x-session-format"]).toBe(SESSION_FORMAT_V1);
    expect(sessionSchema["x-session-version"]).toBe(SESSION_VERSION_V1);
    expect(sessionSchema.properties.format.const).toBe(SESSION_FORMAT_V1);
    expect(d.mode.enum).toEqual([...SESSION_MODES_V1]);
    expect(d.message.properties.role.enum).toEqual([...SESSION_ROLES_V1]);
    expect(d.app.properties.host.enum).toEqual([...SESSION_HOSTS_V1]);
    expect(d.revisionEntry.properties.cause.enum).toEqual([...SESSION_REVISION_CAUSES_V1]);
    expect(sessionSchema["x-program-checks"]).toEqual([...SESSION_PROGRAM_CHECKS_V1]);
    expect(sessionSchema["x-open-records"]).toEqual([...SESSION_OPEN_RECORDS_V1]);
    expect(sessionSchema["x-limits"]).toEqual({ ...SESSION_LIMITS_V1 });
  });

  test("fixtures validate and keep the program checks", () => {
    expect(fixtures).toContain("exported-chat.json");
    for (const f of fixtures) {
      const x = read(`${dir}/${f}`);
      expect({ f, e: errs(x) }).toEqual({ f, e: [] });
      const ids = x.sessions.map((s: { id: string }) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      if (x.selectedSessionId != null) expect(ids).toContain(x.selectedSessionId);
      for (const s of x.sessions) {
        if (s.page) expect(s.pageRevision ?? s.page.revision).toBe(s.page.revision);
        const revs = (s.history ?? []).map((h: { revision: number }) => h.revision);
        for (let i = 1; i < revs.length; i++) expect(revs[i]).toBeGreaterThanOrEqual(revs[i - 1]);
        if (revs.length && s.page) expect(revs.at(-1)).toBeLessThanOrEqual(s.page.revision);
      }
    }
  });

  test("the exported chat carries modes, a page record, revisions and pins", () => {
    const x = read(`${dir}/exported-chat.json`);
    const s = x.sessions.find((c: { id: string }) => c.id === x.selectedSessionId);
    expect(s.mode).toBe("build");
    expect(s.page.revision).toBeGreaterThan(0);
    expect(s.history.map((h: { cause: string }) => h.cause)).toContain("apply");
    expect(x.pins.stock.contentCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(x.pins.registry.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  test("broken files are rejected", () => {
    const base = read(`${dir}/exported-chat.json`);
    const cases: Array<[string, (x: any) => void]> = [
      ["wrong format", (x) => { x.format = "buildy:v2"; }],
      ["no pins", (x) => { delete x.pins; }],
      ["unknown root key", (x) => { x.token = "x"; }],
      ["unknown session key", (x) => { x.sessions[0].secret = "x"; }],
      ["bad mode", (x) => { x.sessions[0].mode = "edit"; }],
      ["bad role", (x) => { x.sessions[0].messages[0].role = "system"; }],
      ["bad revision cause", (x) => { x.sessions[0].history[0].cause = "import"; }],
      ["negative revision", (x) => { x.sessions[0].pageRevision = -1; }],
      ["short commit", (x) => { x.pins.stock.contentCommit = "abc"; }],
      ["local time", (x) => { x.exportedAt = "2026-11-10 10:00"; }],
      ["bad host", (x) => { x.app.host = "server"; }],
      ["bad page record", (x) => { x.sessions[0].page = { pages: 1 }; }],
    ];
    for (const [name, mutate] of cases) {
      const x = clone(base);
      mutate(x);
      expect({ name, ok: file(x) }).toEqual({ name, ok: false });
    }
  });
});

describe("session buildy:v1 1.1.0: skin", () => {
  test("a chat may carry a skin id or null; a bad id is rejected", () => {
    const base = read(`${dir}/exported-chat.json`);
    for (const skin of ["claude", "doom-64", null]) {
      const x = clone(base);
      x.sessions[0].skin = skin;
      expect(errs(x)).toEqual([]);
    }
    for (const skin of ["Claude", "theme claude", "", 7]) {
      const x = clone(base);
      x.sessions[0].skin = skin;
      expect({ skin, ok: file(x) }).toEqual({ skin, ok: false });
    }
  });
});

describe("session buildy:v1 1.2.0: prefs", () => {
  test("optional layout prefs: sizes are integers, flags booleans, unknown keys rejected; 1.0/1.1 files stay valid", () => {
    const base = read(`${dir}/exported-chat.json`);
    expect(errs(base)).toEqual([]);
    const ok = clone(base);
    ok.prefs = { layout: { navWidth: 240, chatWidth: 320, inspectorWidth: 304, layersHeight: 200, treeWidth: 208, navCollapsed: true, chatCollapsed: false, inspectorCollapsed: false, layersCollapsed: false, treeCollapsed: false, focus: false } };
    expect(errs(ok)).toEqual([]);
    const empty = clone(base);
    empty.prefs = {};
    expect(errs(empty)).toEqual([]);
    for (const layout of [{ chatWidth: 320.5 }, { chatWidth: -1 }, { chatWidth: 99999 }, { focus: "yes" }, { panel: 1 }]) {
      const x = clone(base);
      x.prefs = { layout };
      expect({ layout, ok: file(x) }).toEqual({ layout, ok: false });
    }
    const extra = clone(base);
    extra.prefs = { layout: {}, theme: "dark" };
    expect(file(extra)).toBe(false);
  });
});

describe("session buildy:v1 1.3.0: collection", () => {
  test("optional per-chat collection: items are collection items, closed object; older files stay valid", () => {
    const base = read(`${dir}/exported-chat.json`);
    const doc = read("fixtures/collection/grill-delivery.json");
    const ok = clone(base);
    ok.sessions[0].collection = { id: doc.id, title: doc.title, importedAt: "2026-11-11T10:00:00.000Z", assetsDigest: doc.pins.stock.assetsDigest, items: doc.items.slice(1), missing: doc.items.slice(0, 1) };
    expect(errs(ok)).toEqual([]);
    const bare = clone(base);
    bare.sessions[0].collection = { id: "c1", title: "Shelf", items: [] };
    expect(errs(bare)).toEqual([]);
    for (const collection of [
      { id: "c1", title: "Shelf" },
      { id: "c1", title: "", items: [] },
      { id: "c1", title: "Shelf", items: [{ kind: "block", id: "hero" }] },
      { id: "c1", title: "Shelf", items: [{ kind: "screen", id: "screen.site/home", variant: "a" }] },
      { id: "c1", title: "Shelf", items: [], source: "stock" },
      { id: "c1", title: "Shelf", items: [], assetsDigest: "sha256:abc" },
    ]) {
      const x = clone(base);
      x.sessions[0].collection = collection;
      expect({ collection, ok: file(x) }).toEqual({ collection, ok: false });
    }
  });
});

describe("session buildy:v1 1.4.0: Ask page plan", () => {
  const plan = {
    status: "partial", pageId: "page-1", baseRevision: 3, summary: "Rework blocks",
    executedAt: "2026-11-11T10:00:00.000Z",
    ops: [
      { id: "op-1", op: "set_variant", blockId: "block-nav", variant: "inverse", from: "inline", label: "Header (block.navbar)", reason: "Dark header", valid: true, result: { status: "applied" } },
      { id: "op-2", op: "set", blockId: "block-hero", field: "headline", value: "Grill at home", valid: true, result: { status: "skipped" } },
      { id: "op-3", op: "set_variant", blockId: "block-steps", variant: "nope", valid: false, issue: { code: "unknown_variant", message: "no variant nope", allowed: ["row", "centered"] }, result: { status: "rejected", code: "unknown_variant" } },
      { id: "op-4", op: "add", kind: "faq", title: "FAQ", copy: { lede: "Answers" }, items: [{ label: "When?" }], valid: true },
    ],
  };
  const withPlan = (p: unknown, origin = "ask-plan") => {
    const x = clone(read(`${dir}/exported-chat.json`));
    const messages = x.sessions[0].messages;
    messages.push({ id: "msg-plan", role: "assistant", text: "Plan", createdAt: "2026-11-11T10:00:00.000Z", mode: "ask", answer: { blocks: [] }, plan: p });
    messages.push({ id: "msg-run", role: "assistant", text: "Ran", createdAt: "2026-11-11T10:00:01.000Z", mode: "build", proposal: { applied: false, status: "pending", origin, changes: { added: [], kept: ["block-hero"], removed: [] } } });
    return x;
  };

  test("an Ask message carries a plan; an ask-plan proposal is valid; older files stay valid", () => {
    expect(errs(withPlan(plan))).toEqual([]);
    expect(errs(withPlan(plan, "ask-card"))).toEqual([]);
    expect(errs(read(`${dir}/exported-chat.json`))).toEqual([]);
  });

  test("plans are closed and typed", () => {
    for (const bad of [
      { ...plan, status: "done" },
      { ...plan, ops: [{ ...plan.ops[0], op: "set_page" }] },
      { ...plan, ops: [{ ...plan.ops[0], valid: undefined }] },
      { ...plan, ops: [{ ...plan.ops[0], extra: 1 }] },
      { ...plan, ops: [{ ...plan.ops[0], result: { status: "done" } }] },
      { ...plan, ops: [{ ...plan.ops[3], copy: { lede: 1 } }] },
      { status: "proposed", pageId: "page-1", ops: [] },
    ]) {
      expect({ bad, ok: file(withPlan(bad)) }).toEqual({ bad, ok: false });
    }
    expect(file(withPlan(plan, "model"))).toBe(false);
  });

  test("1.5.0: a replace op names the catalog block that takes the block's place and the fields it drops", () => {
    const swap = { id: "op-5", op: "replace", blockId: "block-hero", kind: "hero", catalogBlock: "block.storehero", from: "block.hero/centered", dropped: ["eyebrow", "rows.icon"], valid: true, result: { status: "applied", message: "Dropped: eyebrow." } };
    expect(errs(withPlan({ ...plan, ops: [...plan.ops, swap] }))).toEqual([]);
    expect(file(withPlan({ ...plan, ops: [{ ...swap, dropped: [1] }] }))).toBe(false);
    expect(file(withPlan({ ...plan, ops: [{ ...swap, catalogBlock: 7 }] }))).toBe(false);
  });
});
