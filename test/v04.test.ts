import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ALL_V04 } from "../scripts/schemas-v04.ts";
import { KEYS_V04, validateCollectionV04 } from "../src/validate-v04.ts";
import { schemaUrlV04, type EntryV04 } from "../src/v04.ts";
import { fromWpPost, fromWpSettings, fromWpTerm, stripWpComputed, toWpPost, toWpSettings, toWpTerm, wpManifest, type WpPost, type WpTerm } from "../src/adapters/wordpress.ts";
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
    ["settings", ALL_V04.settings, KEYS_V04.settings],
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

describe("v0.4 metadata against the manifest", () => {

  const mk = (kind: string, metadata: Record<string, { value: unknown }> | undefined, id = `${kind}-1`): EntryV04 =>
    ({ id, locale: "en", kind, status: "published", visibility: "public", slug: id, title: id, version: 1, created_at: at, updated_at: at, ...(metadata ? { metadata } : {}) });
  const manifest: any = {
    name: "shop-crm", version: "1",
    resources: [
      { record: { id: "product", label: "Product", scope: "workspace", fields: [
        { id: "price", label: "Price", type: "number", required: true },
        { id: "sku", label: "SKU", type: "string", required: true },
        { id: "in_stock", label: "In stock", type: "boolean" },
        { id: "qty", label: "Qty", type: "number", rules: [{ name: "fastygo.codex/integer" }] },
        { id: "sizes", label: "Sizes", type: "collection", items: { id: "size", label: "Size", type: "select", options: [{ value: "s", label: "S" }, { value: "m", label: "M" }] } },
        { id: "dims", label: "Dims", type: "object", fields: [{ id: "w", label: "W", type: "number", required: true }] },
      ] } },
      { record: { id: "user", label: "User", scope: "workspace" } },
      { record: { id: "lead", label: "Lead", scope: "workspace", fields: [
        { id: "email", label: "Email", type: "string", required: true },
        { id: "stage", label: "Stage", type: "select", required: true, options: [{ value: "new", label: "New" }, { value: "won", label: "Won" }, { value: "lost", label: "Lost" }] },
        { id: "next_call", label: "Next call", type: "datetime" },
        { id: "owner", label: "Owner", type: "relation" },
      ], relations: [{ id: "owner", source: "lead", target: "user", cardinality: "one-to-one" }] } },
    ],
  };
  const check = (list: EntryV04[], m = manifest) => validateCollectionV04({ entries: files(list, "e") }, { manifest: m });
  const errors = (l: EntryV04[], m?: any) => check(l, m).filter((i) => !i.severity).map((i) => i.code);
  const warnings = (l: EntryV04[], m?: any) => check(l, m).filter((i) => i.severity === "warning").map((i) => i.code);
  const user = mk("user", undefined);
  const product = mk("product", { price: { value: 9.5 }, sku: { value: "A-1" }, in_stock: { value: true }, qty: { value: 3 }, sizes: { value: ["s", "m"] }, dims: { value: { w: 10 } } });
  const lead = mk("lead", { email: { value: "a@b.c" }, stage: { value: "new" }, next_call: { value: "2026-10-20T10:00:00Z" }, owner: { value: "user-1" } });

  test("manifest fixture passes the manifest schema", () => { expect(ok("manifest", manifest)).toBe(true); expect(ok("manifest", wpManifest())).toBe(true); });
  test("valid product and lead: no issues", () => { expect(check([user, product, lead])).toEqual([]); });
  test("product: price must be a number, required fields", () => {
    expect(errors([{ ...product, metadata: { ...product.metadata, price: { value: "9.5" } } }])).toEqual(["manifest.field_invalid"]);
    const { sku, ...rest } = product.metadata!;
    expect(errors([{ ...product, metadata: rest }])).toEqual(["manifest.field_required"]);
    expect(errors([{ ...product, metadata: { ...product.metadata, qty: { value: 1.5 } } }])).toEqual(["manifest.field_invalid"]);
    expect(errors([{ ...product, metadata: { ...product.metadata, sizes: { value: ["xl"] } } }])).toEqual(["manifest.field_invalid"]);
    expect(errors([{ ...product, metadata: { ...product.metadata, dims: { value: {} } } }])).toEqual(["manifest.field_invalid"]);
    expect(errors([{ ...product, metadata: { ...product.metadata, in_stock: { value: "yes" } } }])).toEqual(["manifest.field_invalid"]);
  });
  test("lead: enum stage, datetime, relation to user", () => {
    expect(errors([user, { ...lead, metadata: { ...lead.metadata, stage: { value: "maybe" } } }])).toEqual(["manifest.field_invalid"]);
    expect(errors([user, { ...lead, metadata: { ...lead.metadata, next_call: { value: "tomorrow" } } }])).toEqual(["manifest.field_invalid"]);
    expect(errors([user, product, { ...lead, metadata: { ...lead.metadata, owner: { value: "product-1" } } }])).toEqual(["manifest.field_invalid"]);
    expect(errors([user, { ...lead, metadata: { ...lead.metadata, owner: { value: "user-404" } } }])).toEqual(["manifest.field_invalid"]);
  });
  test("unknown metadata key and unknown kind are warnings, not errors", () => {
    expect(check([user, { ...product, metadata: { ...product.metadata, color: { value: "red" } } }]).map((i) => [i.code, i.severity])).toEqual([["manifest.metadata_unknown", "warning"]]);
    expect(check([mk("deal", { amount: { value: 1 } })]).map((i) => [i.code, i.severity])).toEqual([["manifest.kind_unknown", "warning"]]);
  });
  test("without a manifest, metadata is not checked", () => {
    expect(validateCollectionV04({ entries: files([mk("deal", { amount: { value: "x" } })], "e") })).toEqual([]);
  });
  test("WordPress fixtures validate against wpManifest() with no errors and no warnings", () => {
    const issues = validateCollectionV04({ entries: files(entries.map((x) => x.entry), "entries"), terms: files(terms, "terms") }, { manifest: wpManifest() });
    expect(issues).toEqual([]);
    expect(warnings([{ ...entries[0].entry, metadata: { custom: { value: 1 } } }], wpManifest())).toEqual(["manifest.metadata_unknown"]);
  });
});

describe("WordPress custom post types (real 8082 projects, 8083 products with typed REST meta)", () => {
  const projects: WpPost[] = wpfx("projects"), products: WpPost[] = wpfx("products");
  const ptypes: WpTerm[] = wpfx("project_type"), pcats: WpTerm[] = wpfx("product_cat");
  const prefix = { project: "_folio_", product: "_shop_" } as Record<string, string>;
  for (const p of [...projects, ...products]) test(`round trip ${p.type} ${p.id} (${p.slug}): 0 differences`, () => {
    const { entry, sidecar } = fromWpPost(p, { metaPrefix: prefix[p.type] });
    expect(stripWpComputed(toWpPost(entry, sidecar))).toEqual(stripWpComputed(p));
  });
  for (const t of [...ptypes, ...pcats]) test(`round trip term ${t.taxonomy} ${t.id}`, () => {
    expect(stripWpComputed(toWpTerm(fromWpTerm(t, { at }), { hierarchical: true }))).toEqual(stripWpComputed(t));
  });
  test("all taxonomies of a type become terms; no keys the type does not have", () => {
    const { entry, sidecar } = fromWpPost(projects[0], { metaPrefix: "_folio_" });
    expect(entry.terms?.every((t) => t.taxonomy === "project_type")).toBe(true);
    expect(entry.terms?.length).toBe((projects[0].project_type as number[]).length);
    expect(entry.discussion).toBeUndefined();
    const back = toWpPost(entry, sidecar);
    for (const k of ["author", "comment_status", "ping_status", "parent", "categories", "tags"]) expect(k in back).toBe(false);
    const prod = fromWpPost(products[0], { metaPrefix: "_shop_" }).entry;
    expect(prod.terms?.map((t) => t.taxonomy)).toEqual((products[0].product_cat as number[]).map(() => "product_cat"));
    expect(fromWpPost(products[0], { taxonomies: { product_cat: "shop_category" } }).entry.terms?.[0].taxonomy).toBe("shop_category");
  });
  test("unset REST meta (null) is left out of the core record", () => {
    const unset = products.find((p) => (p.meta as any)._shop_stock === null)!;
    const { entry } = fromWpPost(unset, { metaPrefix: "_shop_" });
    expect(entry.metadata && "stock" in entry.metadata).toBe(false);
    expect(typeof entry.metadata!.price.value).toBe("number");
  });
  const shopManifest: any = { name: "shop", version: "1", resources: [{ record: { id: "product", label: "Product", scope: "workspace", fields: [
    { id: "price", label: "Price", type: "number", required: true, rules: [{ name: "fastygo.codex/money" }] },
    { id: "sale_price", label: "Sale price", type: "number", rules: [{ name: "fastygo.codex/money" }] },
    { id: "sku", label: "SKU", type: "string" },
    { id: "stock", label: "Stock", type: "number", rules: [{ name: "fastygo.codex/integer" }] },
    { id: "currency", label: "Currency", type: "string" },
  ] }, taxonomies: ["product_cat"] }, { record: { id: "project", label: "Project", scope: "workspace", fields: [
    { id: "client", label: "Client", type: "string" }, { id: "year", label: "Year", type: "string" }, { id: "role", label: "Role", type: "string" },
    { id: "url", label: "URL", type: "string", rules: [{ name: "fastygo.codex/uri" }] },
  ] }, taxonomies: ["project_type"] }] };
  const site = { id: "site", locale: "en", title: "Latte Shop", language: "en-US", currency: "USD", version: 1, created_at: at, updated_at: at };
  test("converted projects/products + terms + settings validate with a manifest (money with settings currency)", () => {
    const es = [...projects.map((p) => fromWpPost(p, { metaPrefix: "_folio_" }).entry), ...products.map((p) => fromWpPost(p, { metaPrefix: "_shop_" }).entry)];
    for (const e of es) expect([e.id, ok("entry", e)]).toEqual([e.id, true]);
    const ts = [...ptypes, ...pcats].map((t) => fromWpTerm(t, { at }));
    expect(validateCollectionV04({ entries: files(es, "e"), terms: files(ts, "t"), settings: files([site], "s") }, { manifest: shopManifest })).toEqual([]);
    const noCurrency = validateCollectionV04({ entries: files(es, "e") }, { manifest: shopManifest }).map((i) => i.code);
    expect(noCurrency).toContain("manifest.currency_missing");
    expect(validateCollectionV04({ entries: files(es, "e") }, { manifest: shopManifest, currency: "EUR" })).toEqual([]);
  });
  test("money: integer minor units; own currency wins and must be ISO 4217", () => {
    const e = fromWpPost(products[0], { metaPrefix: "_shop_" }).entry;
    const run = (md: any, s: unknown[] = [site]) => validateCollectionV04({ entries: files([{ ...e, metadata: { ...e.metadata, ...md } }], "e"), settings: files(s, "s") }, { manifest: shopManifest }).map((i) => i.code);
    expect(run({ price: { value: 48.5 } })).toEqual(["manifest.field_invalid"]);
    expect(run({ currency: { value: "EUR" } }, [])).toEqual([]);
    expect(run({ currency: { value: "euro" } }, [])).toEqual(["manifest.currency_invalid"]);
  });
});

describe("settings", () => {
  const wps = wpfx("settings");
  test("real 8081 /wp/v2/settings -> core settings: ajv + validator, round trip equal", () => {
    const { settings, sidecar } = fromWpSettings(wps, { at, currency: "USD" });
    expect(ok("settings", settings)).toBe(true);
    expect(validateCollectionV04({ settings: files([settings], "s") })).toEqual([]);
    expect([settings.title, settings.language, settings.posts_per_page, settings.comments_open, settings.currency]).toEqual(["Latte Press", "en-US", 6, true, "USD"]);
    expect(settings.front_page_id).toBeUndefined();
    expect(toWpSettings(settings, sidecar)).toEqual(wps);
    expect(JSON.stringify(settings)).not.toContain("admin@example.com");
  });
  test("static front page, logo, wpfasty_currency", () => {
    const w = { ...wps, show_on_front: "page", page_on_front: 16, page_for_posts: 3, site_logo: 7, timezone: "Europe/Riga", wpfasty_currency: "EUR" };
    const { settings, sidecar } = fromWpSettings(w, { at });
    expect([settings.front_page_id, settings.posts_page_id, settings.logo_media_id, settings.timezone, settings.currency]).toEqual(["page-16", "page-3", "media-7", "Europe/Riga", "EUR"]);
    expect(toWpSettings(settings, sidecar)).toEqual(w);
  });
  test("validator rules", () => {
    const s = { id: "site", locale: "en", title: "X", language: "en-US", version: 1, created_at: at, updated_at: at };
    const codes = (x: unknown[]) => validateCollectionV04({ settings: files(x, "s") }).map((i) => i.code);
    expect(codes([{ ...s, currency: "usd" }])).toEqual(["core.settings.currency_invalid"]);
    expect(codes([{ ...s, posts_per_page: 0 }])).toEqual(["core.settings.type"]);
    expect(codes([s, { ...s }])).toEqual(["core.settings.key_duplicated"]);
    expect(codes([{ ...s, timezone: "Moscow time" }])).toEqual(["core.settings.timezone_invalid"]);
    expect(ok("settings", { ...s, currency: "usd" })).toBe(false);
  });
});

describe("metadata keys equal to core field names", () => {
  test("warning core.metadata.core_key", () => {
    const e = entries[0].entry;
    const issues = validateCollectionV04({ entries: files([{ ...e, metadata: { status: { value: "shipped" }, excerpt: { value: "x" } } }], "e") });
    expect(issues.map((i) => [i.code, i.severity])).toEqual([["core.metadata.core_key", "warning"], ["core.metadata.core_key", "warning"]]);
  });
});
