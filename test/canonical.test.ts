import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { canonicalize, digest, sha256Hex, CanonicalError, CANONICAL_ENTRY_PROFILE, CANONICAL_ERROR_CODES } from "../src/canonical.ts";
import * as core from "../src/index.ts";

const root = path.resolve(import.meta.dir, "..");
type Case = { name: string; input_text: string; canonical?: string; digest?: string; error?: string };
const vectors: { profile: string; cases: Case[] } = JSON.parse(fs.readFileSync(path.join(root, "fixtures/vectors/canonical.json"), "utf8"));
const codeOf = (text: string) => { try { canonicalize(text); return "ok"; } catch (e) { return e instanceof CanonicalError ? e.code : String(e); } };

describe("codex-entry/v1 vectors (fixtures/vectors/canonical.json)", () => {
  test("profile and size", () => {
    expect(vectors.profile).toBe(CANONICAL_ENTRY_PROFILE);
    expect(vectors.cases.length).toBeGreaterThanOrEqual(20);
    expect(new Set(vectors.cases.map((c) => c.name)).size).toBe(vectors.cases.length);
  });
  for (const c of vectors.cases) {
    test(c.name, () => {
      if (c.error !== undefined) {
        expect(CANONICAL_ERROR_CODES as readonly string[]).toContain(c.error);
        expect(codeOf(c.input_text)).toBe(c.error);
        expect(() => digest(c.input_text)).toThrow(CanonicalError);
      } else {
        const out = canonicalize(c.input_text);
        expect(out).toBe(c.canonical!);
        expect(digest(c.input_text)).toBe(c.digest!);
        // digest = profile + sha256 of the UTF-8 canonical bytes
        expect(c.digest).toBe(`codex-entry/v1:sha256:${createHash("sha256").update(out, "utf8").digest("hex")}`);
        // idempotent: the canonical text is itself a valid input with the same canonical form
        expect(canonicalize(out)).toBe(out);
      }
    });
  }
  test("control vector digest", () => {
    expect(vectors.cases[0].digest).toBe("codex-entry/v1:sha256:d7ebf2eece26fa0a0b6772b2ad8a14e7eb517882946023bfff1fbbaa8224cc4a");
  });
});

describe("canonical module", () => {
  test("exported from the package index", () => {
    expect(core.canonicalize).toBe(canonicalize);
    expect(core.digest).toBe(digest);
    expect(core.CanonicalError).toBe(CanonicalError);
  });
  test("own SHA-256 matches node:crypto", () => {
    for (const s of ["", "abc", "x".repeat(55), "x".repeat(56), "x".repeat(64), "y".repeat(1000), "ёж 😀"]) {
      expect(sha256Hex(new TextEncoder().encode(s))).toBe(createHash("sha256").update(s, "utf8").digest("hex"));
    }
  });
  test("errors carry code and path", () => {
    try { canonicalize("{}"); throw new Error("no throw"); } catch (e) {
      expect(e).toBeInstanceOf(CanonicalError);
      expect((e as CanonicalError).code).toBe("canonical.missing_field");
      expect((e as CanonicalError).path).toBe("$.id");
    }
  });
  test("malformed JSON, lone surrogates and non-objects", () => {
    expect(codeOf("{")).toBe("canonical.invalid_json");
    expect(codeOf('{"a":1,}')).toBe("canonical.invalid_json");
    expect(codeOf("[]")).toBe("canonical.invalid_type");
    expect(codeOf('{"id":"\\ud800"}')).toBe("canonical.invalid_string");
    expect(codeOf('{"id":1e400}')).toBe("canonical.invalid_number");
    expect(codeOf('{"id":9007199254740993.0}')).toBe("canonical.unsafe_integer");
  });
});
