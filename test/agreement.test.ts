// One source of truth: src/v04.ts (types, enums, REQUIRED_V04) -> scripts/schemas-v04.ts (JSON Schemas) and
// src/validate-v04.ts (KEYS_V04, rules), src/codes-v04.ts (issue codes) -> README. This file proves they agree.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ALL_V04 } from "../scripts/schemas-v04.ts";
import { KEYS_V04, checkCommentV04, checkDictionaryV04, checkEntryV04, checkMenuV04, checkSettingsV04, checkTermV04 } from "../src/validate-v04.ts";
import { ISSUE_CODES_V04, WARNING_CODES_V04 } from "../src/codes-v04.ts";
import { COMMENT_STATUSES_V04, ENTRY_STATUSES_V04, REQUIRED_V04, TAXONOMY_MODES_V04, VISIBILITIES_V04, schemaUrlV04 } from "../src/v04.ts";
import type { CommentV04, DictionaryV04, EntryV04, MenuItemV04, MenuV04, RevisionV04, SettingsV04, TaxonomyDefinitionV04, TermV04 } from "../src/v04.ts";

// ---- compile time: the TS types have exactly the keys of KEYS_V04 and exactly the required keys of REQUIRED_V04
type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Req<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T];
type K<N extends keyof typeof KEYS_V04> = (typeof KEYS_V04)[N][number];
type R<N extends keyof typeof REQUIRED_V04> = (typeof REQUIRED_V04)[N][number];
const yes = <T extends true>() => true as T;
yes<Eq<keyof EntryV04, K<"entry">>>(); yes<Eq<Req<EntryV04>, R<"entry">>>();
yes<Eq<keyof TermV04, K<"term">>>(); yes<Eq<Req<TermV04>, R<"term">>>();
yes<Eq<keyof TaxonomyDefinitionV04, K<"definition">>>(); yes<Eq<Req<TaxonomyDefinitionV04>, R<"definition">>>();
yes<Eq<keyof CommentV04, K<"comment">>>(); yes<Eq<Req<CommentV04>, R<"comment">>>();
yes<Eq<keyof MenuV04, K<"menu">>>(); yes<Eq<Req<MenuV04>, R<"menu">>>();
yes<Eq<keyof MenuItemV04, K<"menuItem">>>(); yes<Eq<Req<MenuItemV04>, R<"menuItem">>>();
yes<Eq<keyof DictionaryV04, K<"dictionary">>>(); yes<Eq<Req<DictionaryV04>, R<"dictionary">>>();
yes<Eq<keyof SettingsV04, K<"settings">>>(); yes<Eq<Req<SettingsV04>, R<"settings">>>();
yes<Eq<Req<RevisionV04>, R<"revision">>>();

// ---- run time
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
ajv.addKeyword("x-codex-version");
for (const s of Object.values(ALL_V04)) ajv.addSchema(s);
const at = "2026-10-15T00:00:00Z";
type Check = (o: unknown, p: string, add: (c: string, p: string, m: string) => void) => void;
const codes = (check: Check, o: unknown) => { const out: string[] = []; check(o, "x", (c) => out.push(c)); return out; };

// minimal valid record of each type = only the required fields
const minimal = {
  entry: { schema: ALL_V04.entry, check: checkEntryV04, o: { id: "e1", locale: "en", kind: "post", status: "draft", visibility: "public", slug: "e1", title: "", version: 1, created_at: at, updated_at: at } },
  term: { schema: ALL_V04.term, check: checkTermV04, o: { id: "t1", locale: "en", taxonomy_id: "category", name: "News", slug: "news", version: 1, created_at: at, updated_at: at } },
  comment: { schema: ALL_V04.comment, check: checkCommentV04, o: { id: "c1", entry_id: "e1", content: "", status: "hold", version: 1, created_at: at, updated_at: at } },
  menu: { schema: ALL_V04.menu, check: checkMenuV04, o: { id: "main", location: "primary", locale: "en", items: [] } },
  dictionary: { schema: ALL_V04.dictionary, check: checkDictionaryV04, o: { locale: "en", messages: {} } },
  settings: { schema: ALL_V04.settings, check: checkSettingsV04, o: { id: "site", locale: "en", title: "Site", language: "en-US", version: 1, created_at: at, updated_at: at } },
} as const;

describe("schemas, types and validator agree", () => {
  const schemaOf: Record<keyof typeof REQUIRED_V04, any> = {
    entry: ALL_V04.entry, term: ALL_V04.term, definition: ALL_V04.taxonomy.$defs.Definition, comment: ALL_V04.comment, menu: ALL_V04.menu,
    menuItem: ALL_V04.menu.properties.items.items, dictionary: ALL_V04.dictionary, settings: ALL_V04.settings, revision: ALL_V04.revision,
  };
  for (const [n, s] of Object.entries(schemaOf)) test(`${n}: schema required = REQUIRED_V04.${n}`, () => expect([...s.required].sort()).toEqual([...REQUIRED_V04[n as keyof typeof REQUIRED_V04]].sort()));
  test("enums come from the TS constants", () => {
    expect(ALL_V04.entry.properties.status.enum).toEqual([...ENTRY_STATUSES_V04]);
    expect(ALL_V04.entry.properties.visibility.enum).toEqual([...VISIBILITIES_V04]);
    expect(ALL_V04.comment.properties.status.enum).toEqual([...COMMENT_STATUSES_V04]);
    expect(ALL_V04.taxonomy.$defs.Definition.properties.mode.enum).toEqual([...TAXONOMY_MODES_V04]);
  });
  for (const [n, { schema, check, o }] of Object.entries(minimal)) {
    const valid = ajv.getSchema(schema.$id)!;
    test(`${n}: required-only record passes ajv and the validator`, () => { expect(valid(o)).toBe(true); expect(codes(check as Check, o)).toEqual([]); });
    for (const k of (schema as any).required as string[]) test(`${n}: without ${k} both reject`, () => {
      const { [k]: _, ...rest } = o as Record<string, unknown>;
      expect(valid(rest)).toBe(false);
      expect(codes(check as Check, rest).length).toBeGreaterThan(0);
    });
    test(`${n}: an unknown field is rejected by both`, () => {
      expect(valid({ ...o, wp_extra: 1 })).toBe(false);
      expect(codes(check as Check, { ...o, wp_extra: 1 })).toContain("decode.unknown_field");
    });
  }
  for (const s of ENTRY_STATUSES_V04) test(`entry status ${s}: same verdict`, () => {
    const e = { ...minimal.entry.o, status: s, published_at: at, deleted_at: at };
    expect(ajv.getSchema(schemaUrlV04("entry"))!(e)).toBe(true);
    expect(codes(checkEntryV04, e)).toEqual([]);
  });
  test("unknown status: both reject", () => {
    const e = { ...minimal.entry.o, status: "review" };
    expect(ajv.getSchema(schemaUrlV04("entry"))!(e)).toBe(false);
    expect(codes(checkEntryV04, e)).toEqual(["core.entry.status_invalid"]);
  });
});

describe("issue codes", () => {
  const root = path.resolve(import.meta.dir, "..");
  const src = ["src/validate-v04.ts"].map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
  const used = new Set([...src.matchAll(/"((?:core|manifest|decode)\.[a-z_.]+)"/g)].map((m) => m[1]));
  const registry = Object.keys(ISSUE_CODES_V04);
  test("every code the validator emits is registered", () => expect([...used].filter((c) => !registry.includes(c))).toEqual([]));
  test("every registered code is emitted somewhere", () => expect(registry.filter((c) => !used.has(c))).toEqual([]));
  test("codes follow <layer>.<scope>.<problem> | <layer>.<field>_<problem>", () => {
    for (const c of registry) expect(c).toMatch(/^(decode|core|manifest)\.[a-z]+(_[a-z]+)*(\.[a-z]+(_[a-z]+)*)?$/);
  });
  test("warnings are registered codes", () => { for (const w of WARNING_CODES_V04) expect(registry).toContain(w); });
  test("README documents every code", () => {
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
    expect(registry.filter((c) => !readme.includes(`\`${c}\``))).toEqual([]);
  });
});
