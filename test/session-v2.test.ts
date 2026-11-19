// Session buildy:v2: the generated schema is the source, the studio file (hero-simple + team-simple, chat in ext.chat)
// and a minimal file validate, the buildy:v1 legacy keys are rejected, the program-check fields of the fixtures hold
// and the source constants agree with the schema.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { pageSpec } from "../scripts/schemas-page-spec-v1.ts";
import { pageSpecV2 } from "../scripts/schemas-page-spec-v2.ts";
import { sessionSchemaV2 } from "../scripts/schemas-session-v2.ts";
import {
  SESSION_FORMAT_V2, SESSION_LIMITS_V2, SESSION_OPEN_RECORDS_V2, SESSION_PREFS_LAYOUT_FLAGS_V2, SESSION_PREFS_LAYOUT_SIZES_V2,
  SESSION_PROGRAM_CHECKS_V2, SESSION_REVISION_OPS_V2, SESSION_SCHEMA_URL_V2, SESSION_VERSION_V2,
} from "../src/session-v2.ts";
import { SESSION_MODES_V1 } from "../src/session-v1.ts";

const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema(pageSpec);
ajv.addSchema(pageSpecV2);
ajv.addSchema(sessionSchemaV2);
const file = ajv.getSchema(SESSION_SCHEMA_URL_V2)!;
const root = path.resolve(import.meta.dir, "..");
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
const dir = "fixtures/session-v2";
const fixtures = fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".json")).sort();
const errs = (x: unknown) => (file(x) ? [] : file.errors);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe("session buildy:v2 schema", () => {
  test("generated files are the source", () => {
    expect(read("schemas/session-v2.schema.json")).toEqual(JSON.parse(JSON.stringify(sessionSchemaV2)));
    expect(read("public/session-v2.schema.json")).toEqual(read("schemas/session-v2.schema.json"));
    expect(sessionSchemaV2.$id).toBe(SESSION_SCHEMA_URL_V2);
  });

  test("source constants agree with the schema", () => {
    const d = sessionSchemaV2.$defs as Record<string, any>;
    expect(sessionSchemaV2["x-session-format"]).toBe(SESSION_FORMAT_V2);
    expect(sessionSchemaV2["x-session-version"]).toBe(SESSION_VERSION_V2);
    expect(sessionSchemaV2.properties.format.const).toBe(SESSION_FORMAT_V2);
    expect(d.mode.enum).toEqual([...SESSION_MODES_V1]);
    expect(d.revisionEntry.properties.op.enum).toEqual([...SESSION_REVISION_OPS_V2]);
    expect(Object.keys(d.prefs.properties.layout.properties)).toEqual([...SESSION_PREFS_LAYOUT_SIZES_V2, ...SESSION_PREFS_LAYOUT_FLAGS_V2]);
    expect(sessionSchemaV2["x-program-checks"]).toEqual([...SESSION_PROGRAM_CHECKS_V2]);
    expect(sessionSchemaV2["x-open-records"]).toEqual([...SESSION_OPEN_RECORDS_V2]);
    expect(sessionSchemaV2["x-limits"]).toEqual({ ...SESSION_LIMITS_V2 });
  });

  test("fixtures validate and keep the program checks", () => {
    expect(fixtures).toEqual(["minimal.json", "studio.json"]);
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

  test("the studio file is the simple line: hero-simple + team-simple, the chat in ext.chat, registry and prototypes pins", () => {
    const x = read(`${dir}/studio.json`);
    const s = x.sessions[0];
    expect(s.page.applied.blocks.map((b: { item: string }) => b.item)).toEqual(["hero-simple", "team-simple"]);
    expect(s.ext.chat.messages.map((m: { mode: string }) => m.mode)).toEqual(["build", "build", "ask", "ask"]);
    expect(s.ext.chat.messages.filter((m: { mode: string; proposal?: unknown }) => m.mode === "ask" && m.proposal)).toEqual([]);
    expect(Object.keys(x.pins)).toEqual(["registry", "prototypes", "catalogDigest"]);
  });

  test("buildy:v1 legacy keys and broken files are rejected", () => {
    const base = read(`${dir}/studio.json`);
    const msg = (x: any) => x.sessions[0].ext.chat.messages[1];
    const cases: Array<[string, (x: any) => void]> = [
      ["v1 format", (x) => { x.format = "buildy:v1"; }],
      ["no pins", (x) => { delete x.pins; }],
      ["no prototypes pin", (x) => { delete x.pins.prototypes; }],
      ["stock pin", (x) => { x.pins.stock = { repo: "codegen-x/ui8kit", contentCommit: "081a1c5e5cc5db6f6439a37edb666ddfee7aa006" }; }],
      ["flat messages", (x) => { x.sessions[0].messages = []; }],
      ["flat mode", (x) => { x.sessions[0].mode = "build"; }],
      ["scenarioId", (x) => { x.sessions[0].scenarioId = "landing"; }],
      ["screenId", (x) => { x.sessions[0].screenId = null; }],
      ["collection", (x) => { x.sessions[0].collection = { id: "c1", title: "Shelf", items: [] }; }],
      ["page-spec/v1 record", (x) => { x.sessions[0].page.applied = { id: "p", slug: "p", status: "draft", title: "P", layout: { version: 1, blocks: [] } }; }],
      ["message artifacts", (x) => { msg(x).artifacts = []; }],
      ["message plan", (x) => { msg(x).plan = {}; }],
      ["proposal origin", (x) => { msg(x).proposal.origin = "ask-card"; }],
      ["proposal screenId", (x) => { msg(x).proposal.screenId = null; }],
      ["proposal page", (x) => { msg(x).proposal.page = x.sessions[0].page.applied; }],
      ["proposal changes", (x) => { msg(x).proposal.changes = { added: [], kept: [], removed: [] }; }],
      ["set_family op", (x) => { x.sessions[0].history[1].op = "set_family"; }],
      ["chatWidth pref", (x) => { x.prefs.layout.chatWidth = 320; }],
      ["unknown root key", (x) => { x.token = "x"; }],
      ["unknown session key", (x) => { x.sessions[0].secret = "x"; }],
      ["bad ext name", (x) => { x.sessions[0].ext.Chat = {}; }],
      ["bad chat mode", (x) => { x.sessions[0].ext.chat.mode = "edit"; }],
      ["bad role", (x) => { msg(x).role = "system"; }],
      ["short commit", (x) => { x.pins.prototypes.commit = "abc"; }],
      ["local time", (x) => { x.exportedAt = "2026-11-20 10:00"; }],
    ];
    for (const [name, mutate] of cases) {
      const x = clone(base);
      mutate(x);
      expect({ name, ok: file(x) }).toEqual({ name, ok: false });
    }
  });

  test("open records stay open: usage, run.usage, run.rejected", () => {
    const x = clone(read(`${dir}/studio.json`));
    x.sessions[0].ext.chat.usage.anything = { nested: true };
    x.sessions[0].ext.chat.messages[1].run.usage.extra = 1;
    x.sessions[0].ext.chat.messages[1].run.rejected = { issues: [{ path: "/blocks/1/props/members", code: "props_invalid", expected: "array", got: "string" }] };
    expect(errs(x)).toEqual([]);
  });
});
