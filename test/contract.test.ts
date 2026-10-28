import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ALL } from "../scripts/schemas.ts";
import { render } from "../scripts/gen.ts";
import { CASES, loadSnapshot, run } from "../scripts/self-test.ts";
import { KEYS, REVISION_KEYS, TAXONOMY_KEYS, validateRevision, validateSnapshot, validateTaxonomy } from "../src/validate.ts";
import { CODEX_VERSION, SCHEMA_LINE, SCHEMA_BASE_URL } from "../src/codex.ts";
import { ALL_V04 } from "../scripts/schemas-v04.ts";
import { Library, loadLibrary, loadOrError, SnapshotError } from "../src/library.ts";
import { localized, meta, pick, termIds } from "../src/access.ts";
import { adaptAll, defineAdapter, KindMismatchError } from "../src/adapter.ts";
import pkg from "../package.json";

const root = path.resolve(import.meta.dir, "..");
const fx = (n: string) => JSON.parse(fs.readFileSync(path.join(root, "fixtures/codex", n), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
ajv.addKeyword("x-codex-version");
ajv.addKeyword("x-ui-hint");
for (const s of Object.values(ALL)) ajv.addSchema(s);
// Legacy v0.3 schemas (in memory only, not published) to keep checking the v0.3 fixtures.
const v = (name: keyof typeof ALL) => ajv.getSchema((ALL[name] as any).$id)!;

describe("generated files", () => {
  test("schemas/ and public/ match scripts/schemas.ts (run `bun run gen`)", () => {
    for (const [rel, body] of Object.entries(render())) {
      // Checkout on Windows may turn LF into CRLF; the generator always emits LF.
      const disk = fs.readFileSync(path.join(root, rel), "utf8").replaceAll("\r\n", "\n");
      expect(disk).toBe(body);
    }
  });
  test("versions agree", () => {
    expect(pkg.codex.version).toBe(CODEX_VERSION);
    expect(pkg.codex.schemaLine).toBe(SCHEMA_LINE);
    expect(SCHEMA_LINE).toBe(`v${CODEX_VERSION.split(".").slice(0, 2).join(".")}`);
    // v0.4 is published at stable unversioned URLs; versioned URLs start at v0.5.
    for (const [n, s] of Object.entries(ALL_V04)) expect(s.$id).toBe(`${SCHEMA_BASE_URL}/${n}.schema.json`);
  });
});

describe("legacy v0.3 schemas agree with the validator's strict keys", () => {
  const props = (o: any) => Object.keys(o.properties).sort();
  const d = (s: any, k: string) => s.$defs[k];
  const m = ALL.manifest as any, e = ALL.entry as any, t = ALL.taxonomy as any;
  const pairs: [string, any, string[]][] = [
    ["entry", d(e, "Entry"), KEYS.entry],
    ["metadata", d(e, "Entry").properties.metadata.additionalProperties, KEYS.metadata],
    ["locale", d(e, "Entry").properties.locales.additionalProperties, KEYS.locale],
    ["term ref", d(e, "Entry").properties.terms.items, KEYS.term],
    ["manifest", d(m, "Manifest"), KEYS.manifest],
    ["resource", d(m, "Resource"), KEYS.resource],
    ["record", d(m, "RecordType"), KEYS.record],
    ["field", d(m, "Field"), KEYS.field],
    ["option", d(m, "Field").properties.options.items, KEYS.option],
    ["rule", d(m, "Field").properties.rules.items, KEYS.rule],
    ["relation", d(m, "Relation"), KEYS.relation],
    ["policy", d(m, "Relation").properties.policy, KEYS.policy],
    ["taxonomy bundle", d(t, "TaxonomyBundle"), TAXONOMY_KEYS.bundle],
    ["taxonomy definition", d(t, "Definition"), TAXONOMY_KEYS.definition],
    ["taxonomy term", d(t, "Term"), TAXONOMY_KEYS.term],
    ["revision", ALL.revision, REVISION_KEYS],
  ];
  for (const [name, schema, keys] of pairs) test(name, () => { expect(props(schema)).toEqual([...keys].sort()); expect(schema.additionalProperties).toBe(false); });
});

describe("codex v0.3.0 conformance fixtures", () => {
  const manifest = fx("example.manifest.json");
  test("manifest: ajv + TS validator", () => {
    expect(v("manifest")(manifest)).toBe(true);
    expect(v("manifest")(fx("example.manifest.canonical.json"))).toBe(true);
    expect(validateSnapshot(manifest, [])).toEqual([]);
    expect(validateSnapshot(fx("example.manifest.canonical.json"), [])).toEqual([]);
  });
  test("entry: ajv + TS validator against the manifest", () => {
    const entry = fx("article.entry.json");
    expect(v("entry")(entry)).toBe(true);
    expect(validateSnapshot(manifest, [{ file: "article", data: entry }])).toEqual([]);
  });
  test("invalid-location entry: structurally valid, rejected with schema.entry.field_location (as in Go)", () => {
    const entry = fx("article.entry.invalid-location.json");
    expect(v("entry")(entry)).toBe(true);
    const issues = validateSnapshot(manifest, [{ file: "bad", data: entry }]);
    expect(issues.map((i) => i.code)).toEqual(["schema.entry.field_location"]);
    expect(issues[0].path).toBe("bad.locales.en.source_id");
  });
  test("taxonomy bundle", () => {
    const b = fx("topic.taxonomy.json");
    expect(v("taxonomy")(b)).toBe(true);
    expect(validateTaxonomy(b)).toEqual([]);
    const cyc = structuredClone(b); cyc.terms[0].parent_id = "architecture";
    expect(validateTaxonomy(cyc).map((i) => i.code)).toContain("taxonomy.hierarchy.cycle");
    const flat = structuredClone(b); flat.definition.mode = "flat";
    expect(validateTaxonomy(flat).map((i) => i.code)).toContain("taxonomy.term.parent_flat");
    const bad = structuredClone(b); bad.definition.mode = "tree";
    expect(v("taxonomy")(bad)).toBe(false);
    expect(validateTaxonomy(bad).map((i) => i.code)).toContain("taxonomy.definition.mode_invalid");
  });
  test("revision", () => {
    const r = fx("article.revision.json");
    expect(v("revision")(r)).toBe(true);
    expect(validateRevision(r)).toEqual([]);
    const mm = structuredClone(r); mm.version = 2;
    expect(validateRevision(mm).map((i) => i.code)).toEqual(["revision.version_mismatch"]);
    const unk = structuredClone(r); unk.snapshot.bogus = 1;
    expect(v("revision")(unk)).toBe(false);
    expect(validateRevision(unk).map((i) => i.code)).toEqual(["decode.unknown_field"]);
  });
});

describe("broken-snapshot suite (fixtures/snapshot)", () => {
  const s0 = loadSnapshot();
  test("untouched snapshot is valid (TS validator, both modes) and every entry passes ajv", () => {
    expect(run(s0.manifest, s0.entries)).toEqual([]);
    expect(run(s0.manifest, s0.entries, true)).toEqual([]);
    expect(v("manifest")(s0.manifest)).toBe(true);
    for (const [id, e] of Object.entries(s0.entries)) expect([id, v("entry")(e)]).toEqual([id, true]);
  });
  for (const [name, mutate] of CASES) test(name, () => {
    const { manifest, entries } = loadSnapshot();
    mutate(manifest, entries);
    expect(run(manifest, entries).length).toBeGreaterThan(0);
  });
  test("extra.* checks are opt-in", () => {
    const { manifest, entries } = loadSnapshot();
    const withAuthor = Object.values(entries).find((e: any) => e.author_id)!;
    withAuthor.author_id = "page-home";
    expect(run(manifest, entries).map((i) => i.code)).not.toContain("extra.author_missing");
    expect(run(manifest, entries, true).map((i) => i.code)).toContain("extra.author_missing");
  });
});

describe("library, readers, adapters", () => {
  const { manifest, entries } = loadSnapshot();
  const files = Object.entries(entries).map(([id, data]) => ({ file: id, data }));
  const lib = loadLibrary(manifest, files);
  test("Library", () => {
    expect(lib).toBeInstanceOf(Library);
    expect(lib.get("page-home")?.kind).toBe("page");
    expect(lib.byKind("page").length).toBeGreaterThan(0);
    expect(lib.options("user", "role")).toContain("admin");
    expect(loadOrError({}, [])).toBeInstanceOf(SnapshotError);
  });
  test("accessors", () => {
    const e = lib.get("page-home")!;
    expect(pick({ en: "a", ru: "б" }, "ru")).toBe("б");
    expect(pick({ ru: "б" }, "de")).toBe("б");
    expect(pick(undefined)).toBe("");
    expect(localized(e, "title")).toBe(pick(e.title));
    expect(meta(fx("article.entry.json"), "source_id")).toBe("fixture-1001");
    expect(termIds(fx("article.entry.json"), "topic")).toEqual(["architecture"]);
  });
  test("defineAdapter", () => {
    const page = defineAdapter("page", (e, ctx) => ({ id: e.id, title: pick(e.title, ctx.locale) }));
    expect(page.kind).toBe("page");
    expect(page(lib.get("page-home")!).id).toBe("page-home");
    expect(() => page(fx("article.entry.json"))).toThrow(KindMismatchError);
    expect(adaptAll(lib, page).length).toBe(lib.byKind("page").length);
  });
});
