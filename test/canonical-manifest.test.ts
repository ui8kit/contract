// codex-manifest/v2: Canonical() is the FULL manifest (schemas/manifest.schema.json) under the codex-entry/v1 rules.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { canonicalizeManifest, manifestDigest, CanonicalError, CANONICAL_MANIFEST_PROFILE, CANONICAL_ERROR_CODES, MANIFEST_SHAPE } from "../src/canonical.ts";
import * as core from "../src/index.ts";

const root = path.resolve(import.meta.dir, "..");
type Case = { name: string; input_text: string; canonical?: string; digest?: string; error?: string; same_digest_as?: string; differs_from?: string };
const vectors: { profile: string; cases: Case[] } = JSON.parse(fs.readFileSync(path.join(root, "fixtures/vectors/manifest.json"), "utf8"));
const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas/manifest.schema.json"), "utf8"));
const byName = new Map(vectors.cases.map((c) => [c.name, c]));
const codeOf = (m: string | object) => { try { canonicalizeManifest(m); return "ok"; } catch (e) { return e instanceof CanonicalError ? e.code : String(e); } };
const FULL = "full: every field of manifest.schema.json";

describe("codex-manifest/v2 vectors (fixtures/vectors/manifest.json)", () => {
  test("profile, size, unique names", () => {
    expect(vectors.profile).toBe(CANONICAL_MANIFEST_PROFILE);
    expect(CANONICAL_MANIFEST_PROFILE).toBe("codex-manifest/v2");
    expect(vectors.cases.length).toBeGreaterThanOrEqual(4);
    expect(byName.size).toBe(vectors.cases.length);
  });
  for (const c of vectors.cases) {
    test(c.name, () => {
      if (c.error !== undefined) {
        expect(CANONICAL_ERROR_CODES as readonly string[]).toContain(c.error);
        expect(codeOf(c.input_text)).toBe(c.error);
        expect(() => manifestDigest(c.input_text)).toThrow(CanonicalError);
        return;
      }
      const out = canonicalizeManifest(c.input_text);
      expect(out).toBe(c.canonical!);
      expect(manifestDigest(c.input_text)).toBe(c.digest!);
      expect(c.digest).toBe(`codex-manifest/v2:sha256:${createHash("sha256").update(out, "utf8").digest("hex")}`);
      expect(canonicalizeManifest(out)).toBe(out);
      // object input gives the same digest as text input
      expect(manifestDigest(JSON.parse(c.input_text))).toBe(c.digest!);
      if (c.same_digest_as) expect(c.digest).toBe(byName.get(c.same_digest_as)!.digest!);
      if (c.differs_from) expect(c.digest).not.toBe(byName.get(c.differs_from)!.digest!);
    });
  }
  test("vectors are valid manifests (ajv), except the error case", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
    addFormats(ajv);
    ajv.addKeyword("x-codex-version");
    ajv.addKeyword("x-ui-hint");
    const v = ajv.compile(schema);
    for (const c of vectors.cases) if (!c.error) expect([c.name, v(JSON.parse(c.input_text))]).toEqual([c.name, true]);
  });
  test("the full vector uses every property of every manifest $def", () => {
    const seen: Record<string, Set<string>> = {};
    const add = (shape: string, o: object) => { for (const k of Object.keys(o)) (seen[shape] ??= new Set()).add(k); };
    const field = (f: any) => { add("field", f); f.options?.forEach((o: object) => add("option", o)); f.rules?.forEach((r: object) => add("rule", r)); if (f.items) field(f.items); f.fields?.forEach(field); };
    const m = JSON.parse(byName.get(FULL)!.input_text);
    add("manifest", m);
    for (const r of m.resources) { add("resource", r); add("record", r.record); r.record.fields?.forEach(field); r.record.relations?.forEach((x: any) => { add("relation", x); if (x.policy) add("policy", x.policy); }); }
    for (const [shape, { keys }] of Object.entries(MANIFEST_SHAPE)) expect([shape, [...(seen[shape] ?? [])].sort()]).toEqual([shape, [...keys].sort()]);
  });
});

describe("manifestDigest rules", () => {
  test("MANIFEST_SHAPE matches schemas/manifest.schema.json", () => {
    const d = schema.$defs;
    const pairs: [keyof typeof MANIFEST_SHAPE, any][] = [
      ["manifest", d.Manifest], ["resource", d.Resource], ["record", d.RecordType], ["field", d.Field], ["relation", d.Relation],
      ["option", d.Field.properties.options.items], ["rule", d.Field.properties.rules.items], ["policy", d.Relation.properties.policy],
    ];
    for (const [k, s] of pairs) {
      expect<unknown>([k, [...MANIFEST_SHAPE[k].keys].sort()]).toEqual([k, Object.keys(s.properties).sort()]);
      expect<unknown>([k, [...MANIFEST_SHAPE[k].required].sort()]).toEqual([k, [...(s.required ?? [])].sort()]);
    }
  });
  const base = () => JSON.parse(byName.get(FULL)!.input_text);
  const full = manifestDigest(byName.get(FULL)!.input_text);
  test("changing any field or rule changes the digest", () => {
    const edits: ((m: any) => void)[] = [
      (m) => { m.name = "shop2"; }, (m) => { m.version = "2.1.1"; },
      (m) => { m.resources[0].taxonomies.reverse(); }, (m) => { m.resources[0].record.scope = "global"; },
      (m) => { m.resources[0].record.fields[0].required = false; }, (m) => { m.resources[0].record.fields[0].rules[0].severity = "warning"; },
      (m) => { m.resources[0].record.fields[1].options.reverse(); }, (m) => { m.resources[0].record.fields[2].items.type = "text"; },
      (m) => { m.resources[0].record.relations[0].policy.read_only = false; }, (m) => { delete m.resources[0].record.description; },
      (m) => { m.resources[0].record.fields[0].default_value = "x"; }, (m) => { m.resources[1].record.fields = []; },
    ];
    const seen = new Set([full]);
    for (const edit of edits) { const m = base(); edit(m); const d = manifestDigest(m); expect(seen.has(d)).toBe(false); seen.add(d); }
  });
  test("full manifest, not the short {name, version, resources[{id, collection}]} form", () => {
    const m = base();
    const c = canonicalizeManifest(m);
    for (const k of ["\"fields\"", "\"relations\"", "\"rules\"", "\"policy\"", "\"taxonomies\"", "\"sensitive\""]) expect(c).toContain(k);
  });
  test("nested empty values are kept; only top-level optional empties are dropped (the manifest has none)", () => {
    const m = { name: "n", version: "1", resources: [{ record: { id: "a", label: "A", scope: "tenant", fields: [], description: "" } }] };
    expect(canonicalizeManifest(m)).toBe('{"name":"n","resources":[{"record":{"description":"","fields":[],"id":"a","label":"A","scope":"tenant"}}],"version":"1"}');
    expect(manifestDigest(m)).not.toBe(manifestDigest({ ...m, resources: [{ record: { id: "a", label: "A", scope: "tenant" } }] }));
  });
  test("errors: unknown field, missing field, wrong shape, duplicate key, unsafe integer, non-finite number", () => {
    expect(codeOf({ name: "n", version: "1", resources: [], extra: 1 })).toBe("canonical.unknown_field");
    expect(codeOf({ name: "n", version: "1", resources: [{ record: { id: "a", label: "A", scope: "t", fields: [{ id: "f", label: "F", type: "string", bogus: true }] } }] })).toBe("canonical.unknown_field");
    expect(codeOf({ name: "n", version: "1" })).toBe("canonical.missing_field");
    expect(codeOf({ name: "n", version: "1", resources: [{ record: { id: "a", label: "A" } }] })).toBe("canonical.missing_field");
    expect(codeOf({ name: "n", version: "1", resources: {} })).toBe("canonical.invalid_type");
    expect(codeOf([])).toBe("canonical.invalid_type");
    expect(codeOf('{"name":"n","name":"m","version":"1","resources":[]}')).toBe("canonical.duplicate_key");
    expect(codeOf('{"name":"n","version":"1","resources":[{"record":{"id":"a","label":"A","scope":"t","fields":[{"id":"f","label":"F","type":"number","default_value":9007199254740993}]}}]}')).toBe("canonical.unsafe_integer");
    expect(codeOf({ name: "n", version: "1", resources: [], x: 2 ** 60 })).toBe("canonical.unsafe_integer");
    expect(codeOf({ name: "n", version: NaN, resources: [] })).toBe("canonical.invalid_number");
  });
  test("exported from the package index; v1 fixture untouched", () => {
    expect(core.manifestDigest).toBe(manifestDigest);
    expect(core.canonicalizeManifest).toBe(canonicalizeManifest);
    expect(core.CANONICAL_MANIFEST_PROFILE).toBe("codex-manifest/v2");
    const v1 = JSON.parse(fs.readFileSync(path.join(root, "fixtures/codex/example.manifest.digest.json"), "utf8"));
    expect(v1.digest.startsWith("codex-manifest/v1:sha256:")).toBe(true);
  });
});
