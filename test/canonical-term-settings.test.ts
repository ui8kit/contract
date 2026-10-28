// codex-term/v1 and codex-settings/v1: JCS of the schema projection of TermV04 / SettingsV04 with the codex-entry/v1 rules.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  canonicalizeTerm, termDigest, canonicalizeSettings, settingsDigest, CanonicalError, CANONICAL_ERROR_CODES,
  CANONICAL_TERM_PROFILE, CANONICAL_SETTINGS_PROFILE, TERM_COMPUTED_FIELDS,
} from "../src/canonical.ts";
import { KEYS_V04 } from "../src/validate-v04.ts";
import { REQUIRED_V04 } from "../src/v04.ts";
import { fromWpSettings, fromWpTerm, type WpSettings, type WpTerm } from "../src/adapters/wordpress.ts";
import * as core from "../src/index.ts";

const root = path.resolve(import.meta.dir, "..");
type Case = { name: string; input_text: string; canonical?: string; digest?: string; error?: string; same_digest_as?: string };
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
ajv.addKeyword("x-codex-version");
ajv.addKeyword("x-ui-hint");

const suites = [
  { kind: "term" as const, profile: CANONICAL_TERM_PROFILE, canon: canonicalizeTerm, dig: termDigest },
  { kind: "settings" as const, profile: CANONICAL_SETTINGS_PROFILE, canon: canonicalizeSettings, dig: settingsDigest },
];

for (const s of suites) {
  const vectors: { profile: string; cases: Case[] } = read(`fixtures/vectors/${s.kind}.json`);
  const schema = read(`schemas/${s.kind}.schema.json`);
  const validate = ajv.compile(schema);
  const byName = new Map(vectors.cases.map((c) => [c.name, c]));
  const codeOf = (x: string | object) => { try { s.canon(x); return "ok"; } catch (e) { return e instanceof CanonicalError ? e.code : String(e); } };

  describe(`${s.profile} vectors (fixtures/vectors/${s.kind}.json)`, () => {
    test("profile, size, unique names", () => {
      expect(vectors.profile).toBe(s.profile);
      expect(s.profile).toBe(`codex-${s.kind}/v1`);
      expect(vectors.cases.length).toBeGreaterThanOrEqual(5);
      expect(vectors.cases.length).toBeLessThanOrEqual(12);
      expect(byName.size).toBe(vectors.cases.length);
    });
    for (const c of vectors.cases) {
      test(c.name, () => {
        if (c.error !== undefined) {
          expect(CANONICAL_ERROR_CODES as readonly string[]).toContain(c.error);
          expect(codeOf(c.input_text)).toBe(c.error);
          expect(() => s.dig(c.input_text)).toThrow(CanonicalError);
          return;
        }
        const out = s.canon(c.input_text);
        expect(out).toBe(c.canonical!);
        expect(s.dig(c.input_text)).toBe(c.digest!);
        expect(c.digest).toBe(`${s.profile}:sha256:${createHash("sha256").update(out, "utf8").digest("hex")}`);
        expect(s.canon(out)).toBe(out);
        expect(s.dig(JSON.parse(c.input_text))).toBe(c.digest!);
        if (c.same_digest_as) expect(c.digest).toBe(byName.get(c.same_digest_as)!.digest!);
        // the canonical form is a valid record of the schema
        expect(validate(JSON.parse(out))).toBe(true);
      });
    }
    test("distinct non-error vectors: minimal and full differ; only same_digest_as cases share a digest", () => {
      const own = vectors.cases.filter((c) => c.digest && !c.same_digest_as);
      expect(own.length).toBeGreaterThanOrEqual(2);
      expect(new Set(own.map((c) => c.digest)).size).toBe(own.length);
    });
  });

  describe(`${s.profile} rules`, () => {
    test("key set and required list match the schema", () => {
      expect<string[]>([...KEYS_V04[s.kind]].sort()).toEqual(Object.keys(schema.properties).sort());
      expect<string[]>([...REQUIRED_V04[s.kind]].sort()).toEqual([...schema.required].sort());
    });
    const min = JSON.parse(vectors.cases[0].input_text);
    test("same error codes as entry: unknown field, missing field, invalid id, date, fractional seconds, non-object", () => {
      expect(codeOf({ ...min, bogus: 1 })).toBe("canonical.unknown_field");
      const { version, ...noVersion } = min;
      expect(codeOf(noVersion)).toBe("canonical.missing_field");
      expect(codeOf({ ...min, id: "-x" })).toBe("canonical.invalid_id");
      expect(codeOf({ ...min, created_at: "2026-10-25" })).toBe("canonical.invalid_date");
      expect(codeOf({ ...min, created_at: "2026-10-25T11:09:00.5Z" })).toBe("canonical.fractional_seconds");
      expect(codeOf({ ...min, metadata: { a: { value: 1, extra: 2 } } })).toBe("canonical.unknown_field");
      expect(codeOf({ ...min, origin: [{ system: "wp", id: "1", x: 1 }] })).toBe("canonical.unknown_field");
      expect(codeOf("[]")).toBe("canonical.invalid_type");
      expect(codeOf(`{"id":"a","id":"b"}`)).toBe("canonical.duplicate_key");
      expect(codeOf({ ...min, version: NaN })).toBe("canonical.invalid_number");
    });
    test("metadata values are kept as is; origin order is kept", () => {
      const out = JSON.parse(s.canon({ ...min, origin: [{ system: "z", id: "1" }, { system: "a", id: "2" }], metadata: { v: { value: { "": [], b: {}, a: "" } } } }));
      expect(out.origin.map((o: { system: string }) => o.system)).toEqual(["z", "a"]);
      expect(out.metadata).toEqual({ v: { value: { "": [], b: {}, a: "" } } });
    });
  });
}

describe("term: count", () => {
  test("count is the only computed field and never in the canonical form", () => {
    expect([...TERM_COMPUTED_FIELDS]).toEqual(["count"]);
    expect(KEYS_V04.term as readonly string[]).not.toContain("count");
    const t = JSON.parse(read("fixtures/vectors/term.json").cases[0].input_text);
    for (const count of [0, 7, null, "x"]) expect(termDigest({ ...t, count })).toBe(termDigest(t));
    expect(canonicalizeTerm({ ...t, count: 3 })).not.toContain("count");
  });
});

describe("adapters produce canonicalizable records", () => {
  test("fromWpTerm (categories, tags) and fromWpSettings fixtures", () => {
    for (const f of ["categories", "tags"]) for (const t of read(`fixtures/wordpress/${f}.json`) as WpTerm[]) termDigest(fromWpTerm(t));
    expect(settingsDigest(fromWpSettings(read("fixtures/wordpress/settings.json") as WpSettings).settings)).toMatch(/^codex-settings\/v1:sha256:[0-9a-f]{64}$/);
  });
  test("exported from the package index", () => {
    expect(core.termDigest).toBe(termDigest);
    expect(core.settingsDigest).toBe(settingsDigest);
    expect(core.canonicalizeTerm).toBe(canonicalizeTerm);
    expect(core.canonicalizeSettings).toBe(canonicalizeSettings);
  });
});
