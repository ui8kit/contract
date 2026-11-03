// View profile view/v1: the generated schema compiles next to the v0.4 schemas, every fixture of fixtures/view
// (one context per page type) is valid against its root def, broken contexts are rejected, and the source constants
// (page types, archive types, Manifest field-type mapping) agree with the schema.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ALL_V04 } from "../scripts/schemas-v04.ts";
import { view } from "../scripts/schemas-view-v1.ts";
import { FIELD_TYPE_VIEW_V1, VIEW_ARCHIVE_TYPES_V1, VIEW_PAGE_TYPES_V1, VIEW_PROFILE_V1, VIEW_SCHEMA_URL_V1, type ViewExampleV1 } from "../src/view-v1.ts";

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true, strictTypes: false });
addFormats(ajv);
for (const k of ["x-codex-version", "x-ui-hint", "x-view-profile", "x-view-version"]) ajv.addKeyword(k);
for (const s of Object.values(ALL_V04)) ajv.addSchema(s);
ajv.addSchema(view);
const at = (def: string) => ajv.getSchema(`${VIEW_SCHEMA_URL_V1}#/$defs/${def}`)!;
const dir = path.resolve(import.meta.dir, "../fixtures/view");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
const load = (f: string): ViewExampleV1 => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

describe("view/v1 schema", () => {
  test("generated file is the source", () => {
    const onDisk = JSON.parse(fs.readFileSync(path.resolve(import.meta.dir, "../schemas/view.schema.json"), "utf8"));
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(view)));
    expect(view.$id).toBe(VIEW_SCHEMA_URL_V1);
    expect(view["x-view-profile"]).toBe(VIEW_PROFILE_V1);
  });

  test("source constants agree with the schema", () => {
    expect(view.$defs.request.properties.pageType.enum).toEqual([...VIEW_PAGE_TYPES_V1]);
    expect(view.$defs.archiveContext.allOf[1].properties.archive.properties.type.enum).toEqual([...VIEW_ARCHIVE_TYPES_V1]);
    for (const t of Object.keys(FIELD_TYPE_VIEW_V1)) expect(view.$defs.fieldValue.description).toContain(`- ${t} -> `);
    // every Field.type the Manifest schema knows has a view mapping
    const known = String(ALL_V04.manifest.$defs.Field.properties.type.description).replace(/^Known: |\..*$/gs, "").split(" ");
    for (const t of known) expect(Object.keys(FIELD_TYPE_VIEW_V1)).toContain(t);
  });
});

describe("view/v1 fixtures", () => {
  test("one fixture per page type", () => {
    expect(files.length).toBeGreaterThanOrEqual(19);
    const types = new Set(files.map((f) => load(f).context.request?.pageType));
    for (const t of VIEW_PAGE_TYPES_V1.filter((t) => t !== "archive")) expect(types.has(t)).toBe(true);
  });
  for (const f of files)
    test(f, () => {
      const { kind, context } = load(f);
      const v = at(`${kind}Context`);
      expect(v(context) ? [] : v.errors).toEqual([]);
    });
});

describe("view/v1 rejects", () => {
  const single = () => structuredClone(load("single.json").context) as any;
  const bad: [string, (c: any) => void][] = [
    ["entry without url", (c) => { delete c.page.url; }],
    ["title not text", (c) => { c.page.title = 42; }],
    ["kind not a Codex kind", (c) => { c.page.kind = "Not A Kind"; }],
    ["status not a Codex status", (c) => { c.page.status = "live"; }],
    ["menu item without children", (c) => { delete c.menu.primary.items[0].children; }],
    ["image without alt", (c) => { delete c.page.featuredImage.alt; }],
    ["wrong profile", (c) => { c.profile = "view/v2"; }],
    ["unknown page type", (c) => { c.request.pageType = "landing"; }],
  ];
  for (const [name, breakIt] of bad)
    test(name, () => {
      const c = single();
      breakIt(c);
      expect(at("pageContext")(c)).toBe(false);
    });
  test("pagination needs a {0} pattern", () => {
    const c = structuredClone(load("home.json").context) as any;
    c.pagination.url = "/blog/page/";
    expect(at("archiveContext")(c)).toBe(false);
  });
});
