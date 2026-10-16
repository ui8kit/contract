import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ALL_V04 } from "../scripts/schemas-v04.ts";
import { KEYS_V04, validateCollectionV04 } from "../src/validate-v04.ts";
import { schemaUrlV04, type EntryV04 } from "../src/v04.ts";
import { fromWpPost, fromWpTerm, stripWpComputed, toWpPost, toWpTerm, type WpPost, type WpTerm } from "../src/adapters/wordpress.ts";
import * as core from "../src/index.ts";

const root = path.resolve(import.meta.dir, "..");
const wpfx = (n: string) => JSON.parse(fs.readFileSync(path.join(root, "fixtures/wordpress", `${n}.json`), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
ajv.addKeyword("x-codex-version");
for (const s of Object.values(ALL_V04)) ajv.addSchema(s);
const v = (n: keyof typeof ALL_V04) => ajv.getSchema(schemaUrlV04(n))!;
const ok = (n: keyof typeof ALL_V04, d: unknown) => { const f = v(n); const r = f(d); if (!r) console.log(n, f.errors); return r; };

const posts: WpPost[] = wpfx("posts"), pages: WpPost[] = wpfx("pages");
const cats: WpTerm[] = wpfx("categories"), tags: WpTerm[] = wpfx("tags");
const at = "2026-10-15T00:00:00Z";
const entries = [...posts, ...pages].map((p) => fromWpPost(p));
const terms = [...cats, ...tags].map((t) => fromWpTerm(t, { at }));
const files = (list: unknown[], prefix: string) => list.map((data, i) => ({ file: `${prefix}[${i}]`, data }));

describe("v0.4 schemas agree with the validator's strict keys", () => {
  const props = (o: any) => Object.keys(o.properties).sort();
  const pairs: [string, any, string[]][] = [
    ["entry", ALL_V04.entry, KEYS_V04.entry],
    ["term", ALL_V04.term, KEYS_V04.term],
    ["taxonomy definition", ALL_V04.taxonomy.$defs.Definition, KEYS_V04.definition],
    ["comment", ALL_V04.comment, KEYS_V04.comment],
    ["menu", ALL_V04.menu, KEYS_V04.menu],
    ["menu item", ALL_V04.menu.properties.items.items, KEYS_V04.menuItem],
    ["dictionary", ALL_V04.dictionary, KEYS_V04.dictionary],
  ];
  for (const [n, s, keys] of pairs) test(n, () => { expect(props(s)).toEqual([...keys].sort()); expect(s.additionalProperties).toBe(false); });
});

describe("real WordPress fixtures (fixtures/wordpress, context=edit)", () => {
  test("fixtures are present", () => { expect(posts.length).toBeGreaterThan(0); expect(pages.length).toBeGreaterThan(0); expect(cats.length).toBeGreaterThan(0); expect(tags.length).toBeGreaterThan(0); });
  test("converted entries and terms pass ajv", () => {
    for (const { entry } of entries) expect([entry.id, ok("entry", entry)]).toEqual([entry.id, true]);
    for (const t of terms) expect([t.id, ok("term", t)]).toEqual([t.id, true]);
  });
  test("converted collection passes the v0.4 validator", () => {
    expect(validateCollectionV04({ entries: files(entries.map((x) => x.entry), "entries"), terms: files(terms, "terms") })).toEqual([]);
  });
  test("no platform fields leak into core records", () => {
    for (const { entry } of entries) for (const k of Object.keys(entry)) expect(["password", "guid", "link", "sticky", "menu_order", "comment_status", "ping_status"]).not.toContain(k);
  });
  for (const p of [...posts, ...pages]) test(`round trip ${p.type} ${p.id} (${p.slug})`, () => {
    const { entry, sidecar } = fromWpPost(p);
    expect(stripWpComputed(toWpPost(entry, sidecar))).toEqual(stripWpComputed(p));
  });
  for (const t of [...cats, ...tags]) test(`round trip term ${t.taxonomy} ${t.id} (${t.slug})`, () => {
    expect(stripWpComputed(toWpTerm(fromWpTerm(t, { at })))).toEqual(stripWpComputed(t));
  });
  test("statuses: pending and private", () => {
    const p = { ...posts[0], status: "pending" };
    expect(fromWpPost(p).entry.status).toBe("pending");
    const priv = fromWpPost({ ...posts[0], status: "private" }).entry;
    expect([priv.status, priv.visibility]).toEqual(["published", "private"]);
    expect(toWpPost(priv).status).toBe("private");
  });
  test("password lives only in the sidecar", () => {
    const { entry, sidecar } = fromWpPost({ ...posts[0], password: "secret" });
    expect(JSON.stringify(entry)).not.toContain("secret");
    expect(toWpPost(entry, sidecar).password).toBe("secret");
  });
});

describe("v0.4 validator rules", () => {
  const e0 = entries.find((x) => x.entry.kind === "post")!.entry;
  const run = (list: EntryV04[]) => validateCollectionV04({ entries: files(list, "e") }).map((i) => i.code);
  test("(id, locale) unique; translation with another locale is allowed", () => {
    expect(run([e0, { ...e0 }])).toContain("core.entry.key_duplicated");
    expect(run([e0, { ...e0, locale: "ru", slug: "ru-slug" }])).toEqual([]);
  });
  test("slug unique within (kind, locale, parent_id)", () => {
    expect(run([e0, { ...e0, id: "post-x" }])).toContain("core.entry.slug_duplicated");
    expect(run([e0, { ...e0, id: "post-x", kind: "page" }])).toEqual([]);
    const par = { ...e0, id: "page-a", kind: "page", slug: "a" }, par2 = { ...par, id: "page-b", slug: "b" };
    expect(run([par, par2, { ...par, id: "c1", slug: "s", parent_id: "page-a" }, { ...par, id: "c2", slug: "s", parent_id: "page-b" }])).toEqual([]);
  });
  test("term slug unique within (taxonomy_id, locale, parent_id)", () => {
    const t = terms[0];
    const codes = (l: unknown[]) => validateCollectionV04({ terms: files(l, "t") }).map((i) => i.code);
    expect(codes([t, { ...t, id: "category-99" }])).toContain("core.term.slug_duplicated");
    expect(codes([t, { ...t, id: "post_tag-99", taxonomy_id: "post_tag" }])).toEqual([]);
    expect(codes([t, { ...t, locale: "ru" }])).toEqual([]);
  });
  test("entry status includes pending; unknown status rejected", () => {
    expect(run([{ ...e0, status: "pending" }])).toEqual([]);
    expect(run([{ ...e0, status: "review" as never }])).toContain("core.entry.status_invalid");
    expect(ok("entry", { ...e0, status: "review" })).toBe(false);
  });
  test("comment statuses approved/hold/spam/trash", () => {
    const c = { id: "c1", entry_id: e0.id, content: "hi", status: "hold", version: 1, created_at: at, updated_at: at };
    for (const s of ["approved", "hold", "spam", "trash"]) expect(validateCollectionV04({ comments: files([{ ...c, status: s }], "c") })).toEqual([]);
    expect(validateCollectionV04({ comments: files([{ ...c, status: "pending" }], "c") }).map((i) => i.code)).toEqual(["core.comment.status_invalid"]);
    expect(ok("comment", c)).toBe(true);
  });
  test("menu and dictionary", () => {
    const menu = { id: "primary", location: "primary", locale: "en", items: [{ id: "about", label: "About", url: "/about", target: { kind: "page", id: "page-12" } }] };
    const dict = { locale: "ru", source_locale: "en", messages: { "menu:primary:about:label": "О нас", "ui:read_more": "Читать" } };
    expect(ok("menu", menu)).toBe(true);
    expect(ok("dictionary", dict)).toBe(true);
    expect(validateCollectionV04({ menus: files([menu], "m"), dictionaries: files([dict], "d") })).toEqual([]);
  });
  test("unknown field rejected (strict)", () => {
    expect(run([{ ...e0, wp_password: "x" } as never])).toContain("decode.unknown_field");
  });
  test("adapter is not exported from the core index", () => {
    expect("fromWpPost" in core).toBe(false);
    expect("validateCollectionV04" in core).toBe(true);
  });
});
