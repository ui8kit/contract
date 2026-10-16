// Edge cases of the v0.4 core: statuses, nested pages, null dates, money, many locales, menus, comments.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { validateCollectionV04, type CollectionV04, type ValidateV04Options } from "../src/validate-v04.ts";
import type { EntryV04, TermV04 } from "../src/v04.ts";
import { fromWpPost, toWpPost, stripWpComputed, type WpPost } from "../src/adapters/wordpress.ts";

const at = "2026-10-15T00:00:00Z", later = "2026-10-16T00:00:00Z";
const files = (list: unknown[], prefix: string) => list.map((data, i) => ({ file: `${prefix}[${i}]`, data }));
const e = (id: string, x: Partial<EntryV04> = {}): EntryV04 => ({ id, locale: "en", kind: "page", status: "published", visibility: "public", slug: id, title: id, version: 1, created_at: at, updated_at: at, published_at: at, ...x });
const t = (id: string, x: Partial<TermV04> = {}): TermV04 => ({ id, locale: "en", taxonomy_id: "category", name: id, slug: id, version: 1, created_at: at, updated_at: at, ...x });
const run = (c: { entries?: unknown[]; terms?: unknown[]; comments?: unknown[]; menus?: unknown[]; dictionaries?: unknown[]; settings?: unknown[] }, o?: ValidateV04Options) => {
  const col: CollectionV04 = {};
  for (const [k, v] of Object.entries(c)) (col as any)[k] = files(v as unknown[], k);
  return validateCollectionV04(col, o);
};
const codes = (c: Parameters<typeof run>[0], o?: ValidateV04Options) => run(c, o).map((i) => i.code);
const wp: WpPost[] = JSON.parse(fs.readFileSync(path.resolve(import.meta.dir, "../fixtures/wordpress/posts.json"), "utf8"));
const wpPages: WpPost[] = JSON.parse(fs.readFileSync(path.resolve(import.meta.dir, "../fixtures/wordpress/pages.json"), "utf8"));
const roundTrip = (p: WpPost) => { const { entry, sidecar } = fromWpPost(p); return { entry, back: stripWpComputed(toWpPost(entry, sidecar)) }; };

describe("statuses and visibility", () => {
  test("every core status validates with its required dates", () => {
    expect(codes({ entries: [e("a", { status: "draft", published_at: undefined }), e("b", { status: "pending", published_at: undefined }), e("c", { status: "scheduled", published_at: later }), e("d"), e("f", { status: "archived" }), e("g", { status: "trashed", deleted_at: later })] })).toEqual([]);
  });
  test("scheduled needs published_at, trashed needs deleted_at", () => {
    expect(codes({ entries: [e("a", { status: "scheduled", published_at: undefined }), e("b", { status: "trashed" })] })).toEqual(["core.entry.published_at_required", "core.entry.deleted_at_required"]);
  });
  test("private is visibility, not a status", () => {
    expect(codes({ entries: [{ ...e("a"), status: "private" }] })).toEqual(["core.entry.status_invalid"]);
    expect(codes({ entries: [e("a", { visibility: "private" })] })).toEqual([]);
    expect(codes({ entries: [{ ...e("a"), visibility: "password" }] })).toEqual(["core.entry.visibility_invalid"]);
  });
  for (const s of ["pending", "private", "draft", "future", "trash"]) test(`WordPress ${s} round trips with 0 differences`, () => {
    const p: WpPost = { ...wp[0], status: s, ...(s === "draft" || s === "pending" ? { date_gmt: null } : {}), ...(s === "future" ? { date: "2027-01-01T10:00:00", date_gmt: "2027-01-01T10:00:00" } : {}) };
    const { entry, back } = roundTrip(p);
    expect(codes({ entries: [entry] })).toEqual([]);
    expect(back).toEqual(stripWpComputed(p));
  });
  test("sticky post -> pinned and back", () => {
    const { entry, back } = roundTrip({ ...wp[0], sticky: true });
    expect(entry.pinned).toBe(true);
    expect(back.sticky).toBe(true);
    expect(codes({ entries: [{ ...entry, pinned: "yes" }] })).toEqual(["core.entry.type_invalid"]);
  });
});

describe("null and missing dates", () => {
  test("WordPress draft with date_gmt null: no null in core, null restored by the sidecar", () => {
    const { entry, back } = roundTrip({ ...wp[0], status: "draft", date_gmt: null });
    expect(Object.values(entry).includes(null as never)).toBe(false);
    expect(entry.published_at).toBeUndefined();
    expect(back.date_gmt).toBeNull();
  });
  test("null is not a date in the core (absent instead)", () => {
    expect(codes({ entries: [{ ...e("a"), published_at: null }] })).toEqual(["core.entry.time_invalid"]);
    expect(codes({ entries: [{ ...e("a"), created_at: null }] })).toEqual(["core.timestamps_required"]);
  });
  test("dates need an offset; updated_at must not precede created_at", () => {
    expect(codes({ entries: [e("a", { published_at: "2026-10-15T00:00:00" })] })).toEqual(["core.entry.time_invalid"]);
    expect(codes({ entries: [e("a", { created_at: later, updated_at: at })] })).toEqual(["core.timestamps_order"]);
    expect(codes({ entries: [e("a", { created_at: "2026-10-15T03:00:00+03:00", updated_at: at })] })).toEqual([]);
  });
});

describe("nested pages and terms", () => {
  test("real WordPress child pages keep their parent", () => {
    const entries = wpPages.map((p) => fromWpPost(p).entry);
    expect(codes({ entries })).toEqual([]);
  });
  test("three levels deep validate; missing, self, other-kind parents and cycles are errors", () => {
    expect(codes({ entries: [e("a"), e("b", { parent_id: "a" }), e("c", { parent_id: "b" })] })).toEqual([]);
    expect(codes({ entries: [e("b", { parent_id: "nope" })] })).toEqual(["core.entry.parent_missing"]);
    expect(codes({ entries: [e("a", { parent_id: "a" })] })).toEqual(["core.entry.parent_self"]);
    expect(codes({ entries: [e("a", { kind: "post" }), e("b", { parent_id: "a" })] })).toEqual(["core.entry.parent_kind_invalid"]);
    expect(codes({ entries: [e("a", { parent_id: "c" }), e("b", { parent_id: "a" }), e("c", { parent_id: "b" })] })).toEqual(["core.entry.parent_cycle", "core.entry.parent_cycle", "core.entry.parent_cycle"]);
  });
  test("same slug under different parents is fine, under the same parent is not", () => {
    expect(codes({ entries: [e("a"), e("b"), e("a-team", { slug: "team", parent_id: "a" }), e("b-team", { slug: "team", parent_id: "b" })] })).toEqual([]);
    expect(codes({ entries: [e("a"), e("x", { slug: "team", parent_id: "a" }), e("y", { slug: "team", parent_id: "a" })] })).toEqual(["core.entry.slug_duplicated"]);
  });
  test("term trees: nesting, cycles, slug per parent", () => {
    expect(codes({ terms: [t("news"), t("local", { parent_id: "news" }), t("city", { parent_id: "local" })] })).toEqual([]);
    expect(codes({ terms: [t("a", { parent_id: "b" }), t("b", { parent_id: "a" })] })).toEqual(["core.term.parent_cycle", "core.term.parent_cycle"]);
    expect(codes({ terms: [t("a", { parent_id: "a" })] })).toEqual(["core.term.parent_self"]);
    expect(codes({ terms: [t("tags-a", { taxonomy_id: "post_tag", slug: "news" }), t("news")] })).toEqual([]);
  });
});

describe("many locales", () => {
  const locales = ["en", "ru", "de", "pt-BR", "zh-Hans", "sr-Latn-RS"];
  test("one id in six locales: translations share id and slug", () => {
    expect(codes({ entries: locales.map((l) => e("about", { locale: l })), terms: locales.map((l) => t("news", { locale: l })), settings: locales.map((l) => ({ id: "site", locale: l, title: "S", language: l, version: 1, created_at: at, updated_at: at })) })).toEqual([]);
  });
  test("translated subpages: each locale has its own tree; a cycle in one locale only", () => {
    const tree = (l: string) => [e("a", { locale: l }), e("b", { locale: l, parent_id: "a" })];
    expect(codes({ entries: [...tree("en"), ...tree("ru")] })).toEqual([]);
    expect(codes({ entries: [...tree("en"), e("a", { locale: "ru", parent_id: "b" }), e("b", { locale: "ru", parent_id: "a" })] })).toEqual(["core.entry.parent_cycle", "core.entry.parent_cycle"]);
  });
  test("the same (id, locale) twice is a duplicate; bad tags are rejected", () => {
    expect(codes({ entries: [e("a", { locale: "ru" }), e("a", { locale: "ru", slug: "other" })] })).toEqual(["core.entry.key_duplicated"]);
    for (const l of ["EN", "en_US", "", "english"]) expect(codes({ entries: [e("a", { locale: l })] })).toEqual(["core.locale_invalid"]);
  });
  test("dictionaries per locale hold short strings only", () => {
    const d = (locale: string, messages: Record<string, unknown>) => ({ locale, source_locale: "en", messages });
    expect(codes({ dictionaries: locales.map((l) => d(l, { "ui:read_more": "…", "menu:main:about:label": "About" })) })).toEqual([]);
    expect(codes({ dictionaries: [d("ru", { "ui:x": { ru: "x" } })] })).toEqual(["core.dictionary.value_invalid"]);
  });
});

describe("money (integer minor units + ISO 4217)", () => {
  const manifest: any = { name: "shop", version: "1", resources: [{ record: { id: "product", label: "Product", scope: "workspace", fields: [
    { id: "price", label: "Price", type: "number", rules: [{ name: "fastygo.codex/money" }] },
    { id: "currency", label: "Currency", type: "string" },
  ] } }, { record: { id: "order", label: "Order", scope: "workspace", fields: [
    { id: "items", label: "Items", type: "collection", items: { id: "item", label: "Item", type: "object", fields: [
      { id: "sku", label: "SKU", type: "string", required: true },
      { id: "unit_price", label: "Unit price", type: "number", required: true, rules: [{ name: "fastygo.codex/money" }] },
    ] } },
    { id: "total", label: "Total", type: "number", rules: [{ name: "fastygo.codex/money", args: { currency_field: "order_currency" } }] },
    { id: "order_currency", label: "Currency", type: "string" },
  ] } }] };
  const p = (price: unknown, currency?: unknown) => e("p", { kind: "product", metadata: { price: { value: price }, ...(currency === undefined ? {} : { currency: { value: currency } }) } });
  const m = (list: EntryV04[], o: ValidateV04Options = {}) => codes({ entries: list }, { manifest, ...o });
  test("zero, negative (refunds) and the largest safe integer are valid", () => {
    for (const v of [0, -500, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) expect(m([p(v, "USD")])).toEqual([]);
  });
  test("floats, strings, unsafe integers, NaN-like values are invalid", () => {
    for (const v of [12.5, "1250", 2 ** 53, 1e21, true]) expect(m([p(v, "USD")])).toEqual(["manifest.field_invalid"]);
  });
  test("currency: own field, settings default, option default, missing, invalid", () => {
    expect(m([p(100)])).toEqual(["manifest.currency_missing"]);
    expect(m([p(100)], { currency: "EUR" })).toEqual([]);
    expect(codes({ entries: [p(100)], settings: [{ id: "site", locale: "en", title: "S", language: "en", currency: "JPY", version: 1, created_at: at, updated_at: at }] }, { manifest })).toEqual([]);
    for (const c of ["usd", "US", "EURO", ""]) expect(m([p(100, c)])).toEqual(["manifest.currency_invalid"]);
    expect(m([p(100, 840)])).toEqual(["manifest.field_invalid", "manifest.currency_invalid"]);
  });
  test("money inside order items and a custom currency field", () => {
    const o = (items: unknown, total: unknown, cur?: string) => e("o", { kind: "order", metadata: { items: { value: items }, total: { value: total }, ...(cur ? { order_currency: { value: cur } } : {}) } });
    expect(m([o([{ sku: "A", unit_price: 1999 }, { sku: "B", unit_price: 0 }], 1999, "GBP")])).toEqual([]);
    expect(m([o([{ sku: "A", unit_price: 19.99 }], 1999, "GBP")])).toEqual(["manifest.field_invalid"]);
    expect(m([o([{ sku: "A", unit_price: 1999 }], 1999)])).toEqual(["manifest.currency_missing"]);
    expect(m([o([{ sku: "A" }], 0, "GBP")])).toEqual(["manifest.field_invalid"]);
  });
});

describe("menus and comments", () => {
  const menu = (items: unknown[]) => ({ id: "main", location: "primary", locale: "en", items });
  test("nested menu items validate; missing parent, duplicate id and cycles do not", () => {
    expect(codes({ menus: [menu([{ id: "a", label: "A", url: "/" }, { id: "b", label: "B", url: "/b", parent_id: "a", order: 1, target: { kind: "page", id: "page-2" } }, { id: "c", label: "C", url: "/c", parent_id: "b" }])] })).toEqual([]);
    expect(codes({ menus: [menu([{ id: "a", label: "A", url: "/", parent_id: "z" }])] })).toEqual(["core.menu.parent_missing"]);
    expect(codes({ menus: [menu([{ id: "a", label: "A", url: "/" }, { id: "a", label: "A2", url: "/2" }])] })).toEqual(["core.menu.item_duplicated"]);
    expect(codes({ menus: [menu([{ id: "a", label: "A", url: "/", parent_id: "b" }, { id: "b", label: "B", url: "/b", parent_id: "a" }])] })).toEqual(["core.menu.parent_cycle", "core.menu.parent_cycle"]);
    expect(codes({ menus: [menu([{ id: "a", label: "A", url: "/", target: { kind: "page" } }])] })).toEqual(["core.menu.target_invalid"]);
  });
  test("comment statuses, threads and references", () => {
    const c = (id: string, x: Record<string, unknown> = {}) => ({ id, entry_id: "a", content: "hi", status: "approved", version: 1, created_at: at, updated_at: at, ...x });
    expect(codes({ entries: [e("a")], comments: [c("1"), c("2", { parent_id: "1", status: "hold" }), c("3", { status: "spam" }), c("4", { status: "trash" })] })).toEqual([]);
    expect(codes({ entries: [e("a")], comments: [c("1", { entry_id: "gone" })] })).toEqual(["core.comment.entry_missing"]);
    expect(codes({ comments: [c("1", { status: "pending" })] })).toEqual(["core.comment.status_invalid"]);
    expect(codes({ comments: [c("1"), c("1")] })).toEqual(["core.comment.key_duplicated"]);
  });
});
