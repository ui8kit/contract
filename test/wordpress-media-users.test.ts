// fromWpMedia / fromWpUser and the id rule. fixtures/wordpress/{media,users}.{edit,view}.json are LIVE /wp/v2 REST bodies
// (local WordPress 7.1.3 + wp-fasty demo, 2026-10-25, host rewritten to http://localhost:8081; test accounts on example.com).
// context=edit is the main path; context=view (no raw/edit-only fields) must convert without throwing.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ALL_V04 } from "../scripts/schemas-v04.ts";
import { validateCollectionV04 } from "../src/validate-v04.ts";
import { schemaUrlV04, type EntryV04 } from "../src/v04.ts";
import { canonicalize, CanonicalError } from "../src/canonical.ts";
import { CODEX_ID_PATTERN, assertCodexId, codexIdForInt, isCodexId } from "../src/id.ts";
import { fromWpMedia, fromWpPost, fromWpTerm, fromWpUser, type WpMedia, type WpPost, type WpTerm, type WpUser } from "../src/adapters/wordpress.ts";
import * as core from "../src/index.ts";

const root = path.resolve(import.meta.dir, "..");
const wpfx = (n: string) => JSON.parse(fs.readFileSync(path.join(root, "fixtures/wordpress", `${n}.json`), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
ajv.addKeyword("x-codex-version");
for (const s of Object.values(ALL_V04)) ajv.addSchema(s);
const entrySchema = ajv.getSchema(schemaUrlV04("entry"))!;
const files = (list: unknown[], prefix: string) => list.map((data, i) => ({ file: `${prefix}[${i}]`, data }));

const media: WpMedia[] = wpfx("media.edit");
const mediaView: WpMedia[] = wpfx("media.view");
const users: WpUser[] = wpfx("users.edit");
const usersView: WpUser[] = wpfx("users.view");
const posts: WpPost[] = wpfx("posts");
const products: WpPost[] = wpfx("products");
// media 11 is attached to product 10 (fixtures/wordpress/products.json), media 19 is unattached.
const productIds = new Set(products.map((p) => p.id));
const resolveKind = (n: number) => (productIds.has(n) ? "product" : undefined);

describe("id rule (src/id.ts)", () => {
  test("pattern is the one canonicalize uses", () => {
    expect(CODEX_ID_PATTERN.source).toBe("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$");
    for (const ok of ["post-4", "a", "A.b:c_d-1", "x".repeat(128)]) expect(isCodexId(ok)).toBe(true);
    for (const bad of ["", "-a", "_a", "a b", "пост-1", "x".repeat(129), 4, null]) expect(isCodexId(bad)).toBe(false);
  });
  test("canonicalize rejects exactly what isCodexId rejects", () => {
    const base = { id: "post-1", locale: "en", kind: "post", status: "draft", visibility: "public", slug: "s", title: "t", version: 1, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
    for (const id of ["post-1", "a b", "-x", "x".repeat(129), "é"]) {
      let code: string | undefined;
      try { canonicalize(JSON.stringify({ ...base, id })); } catch (e) { code = (e as CanonicalError).code; }
      expect([id, code]).toEqual([id, isCodexId(id) ? undefined : "canonical.invalid_id"]);
    }
  });
  test("integer primary keys -> <kind>-<n>", () => {
    expect(codexIdForInt("media", 20)).toBe("media-20");
    expect(() => codexIdForInt("media", 1.5)).toThrow();
    expect(() => codexIdForInt("media", -1)).toThrow();
    expect(() => codexIdForInt("bad kind", 1)).toThrow();
    expect(() => assertCodexId("a b")).toThrow();
  });
  test("exported from the core index", () => {
    expect(typeof core.isCodexId).toBe("function");
    expect(core.CODEX_ID_PATTERN).toBe(CODEX_ID_PATTERN);
  });
  test("adapters refuse an invalid custom id", () => {
    const bad = { idFor: (k: string, n: number) => `${k} ${n}` };
    expect(() => fromWpMedia(media[0], bad)).toThrow(/wordpress: id for media 11/);
    expect(() => fromWpUser(users[0], bad)).toThrow(/wordpress: id for user 2/);
    expect(() => fromWpPost(posts[0], bad)).toThrow(/wordpress: id for post 4/);
    expect(() => fromWpTerm(wpfx("categories")[0] as WpTerm, bad)).toThrow(/wordpress: id for category/);
    expect(fromWpMedia(media[0], { idFor: (k, n) => `wp:${k}:${n}` }).id).toBe("wp:media:11");
  });
});

describe("fromWpMedia (live /wp/v2/media, context=edit)", () => {
  const out = media.map((m) => fromWpMedia(m, { locale: "en", resolveKind }));
  test("fixtures are the expected live records", () => {
    expect(media.map((m) => [m.id, m.post, m.status])).toEqual([[11, 10, "inherit"], [19, null, "inherit"]]);
    expect(mediaView.map((m) => m.id)).toEqual([11, 19]);
    expect(JSON.stringify([media, mediaView, users, usersView])).not.toContain("127.0.0.1");
  });
  test("attached image: fields", () => {
    expect(out[0]).toEqual({
      id: "media-11", locale: "en", kind: "media", status: "published", visibility: "public", slug: "picsum-id-972", title: "Picsum ID: 972",
      origin: [{ system: "wordpress", id: "11" }], version: 1,
      created_at: "2026-10-25T14:32:53Z", updated_at: "2026-10-25T14:34:02Z", published_at: "2026-10-25T14:32:53Z",
      content: "Picsum ID: 972", discussion: { comments: true, pings: false },
      metadata: {
        file: { value: "http://localhost:8081/wp-content/uploads/2026/10/shop-linen-apron.jpg" }, mime: { value: "image/jpeg" },
        size: { value: 145618 }, width: { value: 1000 }, height: { value: 1000 },
        alt: { value: "Shop Linen Apron" }, attached_to: { value: "product-10" },
      },
    });
    // author 0 -> no author_id; empty caption.raw -> no caption; post never lands as metadata.post
    expect("author_id" in out[0]).toBe(false);
    expect("caption" in (out[0].metadata ?? {})).toBe(false);
    expect("post" in (out[0].metadata ?? {})).toBe(false);
  });
  test("unattached image (post: null): no attached_to", () => {
    expect(out[1].id).toBe("media-19");
    expect(Object.keys(out[1].metadata ?? {})).toEqual(["file", "mime", "size", "width", "height", "alt"]);
  });
  test("attached_to: resolveKind -> owner entry id (wins over parentKind); parentKind; unknown / 0 -> omitted", () => {
    const owner = fromWpPost(products.find((p) => p.id === 10)!).entry;
    expect(owner.id).toBe("product-10");
    const r = fromWpMedia(media[0], { resolveKind, parentKind: "page" });
    expect(r.metadata?.attached_to).toEqual({ value: owner.id });
    expect(fromWpMedia(media[0], { parentKind: "page" }).metadata?.attached_to).toEqual({ value: "page-10" });
    expect("attached_to" in (fromWpMedia(media[0], { resolveKind: () => undefined, parentKind: "page" }).metadata ?? {})).toBe(false);
    const zero = fromWpMedia({ ...media[0], post: 0 }, { parentKind: "post" });
    expect("attached_to" in (zero.metadata ?? {}) || "post" in (zero.metadata ?? {})).toBe(false);
    expect("parent_id" in r).toBe(false);
    for (const e of [r, zero]) { expect(entrySchema(e)).toBe(true); canonicalize(JSON.stringify(e)); }
    for (const e of [r, zero]) expect(validateCollectionV04({ entries: files([e, owner], "entries") })).toEqual([]);
  });
  test("file without dimensions, empty texts, with author (variant of a live record)", () => {
    const { width, height, sizes, image_meta, ...details } = media[1].media_details as Record<string, unknown>;
    const e = fromWpMedia({
      ...media[1], author: 2, mime_type: "application/pdf", source_url: "http://localhost:8081/wp-content/uploads/2026/10/price-list.pdf",
      alt_text: "", description: { raw: "" }, media_details: { ...details, filesize: 52431 },
    });
    expect(e.metadata).toEqual({ file: { value: "http://localhost:8081/wp-content/uploads/2026/10/price-list.pdf" }, mime: { value: "application/pdf" }, size: { value: 52431 } });
    expect("content" in e).toBe(false);
    expect(e.author_id).toBe("user-2");
  });
  test("statuses: private, draft; unknown throws", () => {
    const p = fromWpMedia({ ...media[0], status: "private" });
    expect([p.status, p.visibility]).toEqual(["published", "private"]);
    expect(fromWpMedia({ ...media[0], status: "draft" }).published_at).toBeUndefined();
    expect(() => fromWpMedia({ ...media[0], status: "weird" })).toThrow();
  });
  test("WP meta key colliding with an adapter field throws", () => {
    expect(() => fromWpMedia({ ...media[0], meta: { alt: "x" } })).toThrow(/collides/);
    expect(fromWpMedia({ ...media[0], meta: { credit: "me", _hidden: 1 } }).metadata?.credit).toEqual({ value: "me" });
  });
});

describe("fromWpMedia (live /wp/v2/media, context=view)", () => {
  test("no edit fields (title/caption/description without raw): converts without throwing", () => {
    for (const m of mediaView) {
      expect("raw" in m.title).toBe(false);
      const e = fromWpMedia(m, { resolveKind });
      const edit = fromWpMedia(media.find((x) => x.id === m.id)!, { resolveKind });
      expect(e.id).toBe(edit.id);
      expect([e.created_at, e.updated_at, e.status, e.slug]).toEqual([edit.created_at, edit.updated_at, edit.status, edit.slug]);
      expect(e.metadata?.file).toEqual(edit.metadata?.file);
      expect(e.metadata?.attached_to).toEqual(edit.metadata?.attached_to);
      // view has no title.raw / description.raw: the adapter does not use rendered HTML, so title and content are absent.
      expect("title" in e && e.title !== undefined).toBe(false);
      expect("content" in e).toBe(false);
    }
  });
});

describe("fromWpUser (live /wp/v2/users, context=edit)", () => {
  const out = users.map((u) => fromWpUser(u));
  test("author: public fields, login and roles private", () => {
    expect(out[0]).toEqual({
      id: "user-2", locale: "en", kind: "user", status: "published", visibility: "public", slug: "demo-author", title: "Demo Author",
      origin: [{ system: "wordpress", id: "2" }], version: 1, created_at: "2026-10-25T14:33:48+00:00", updated_at: "2026-10-25T14:33:48+00:00",
      content: "Writes the demo posts.",
      metadata: {
        url: { value: "https://example.com/demo-author" }, login: { value: "demo-author", private: true }, roles: { value: ["author"], private: true },
      },
    });
    expect(out[1].metadata).toEqual({ login: { value: "demo-editor", private: true }, roles: { value: ["editor"], private: true } });
  });
  test("WP meta persisted_preferences (editor settings) is always dropped, other meta passes through", () => {
    expect(users.map((u) => Object.keys(u.meta as object))).toEqual([["persisted_preferences"], ["persisted_preferences"]]);
    for (const personal of [undefined, false, true]) for (const u of users) {
      const e = fromWpUser(u, { personal });
      expect(JSON.stringify(e)).not.toContain("persisted_preferences");
      const withPrefs = { ...u, meta: { persisted_preferences: { core: { welcomeGuide: false } }, bio_extra: "x" } };
      const m = fromWpUser(withPrefs, { personal }).metadata ?? {};
      expect("persisted_preferences" in m).toBe(false);
      expect(m.bio_extra).toEqual({ value: "x" });
    }
  });
  test("personal: false (default): no email, names, capabilities, avatar or password", () => {
    for (const e of [...out, ...users.map((u) => fromWpUser(u, { personal: false }))]) {
      const s = JSON.stringify(e);
      for (const leak of ["@example.com", "capabilities", "gravatar", "password", "first_name", "last_name", "nickname", "en_US", "persisted_preferences"]) expect(s).not.toContain(leak);
    }
  });
  test("personal: true adds email and non-empty names, only as private", () => {
    const a = fromWpUser(users[0], { personal: true });
    expect(a.metadata).toEqual({
      url: { value: "https://example.com/demo-author" }, login: { value: "demo-author", private: true }, roles: { value: ["author"], private: true },
      email: { value: "demo-author@example.com", private: true }, first_name: { value: "Demo", private: true },
      last_name: { value: "Author", private: true }, nickname: { value: "demo-author", private: true },
    });
    const b = fromWpUser(users[1], { personal: true });
    expect(Object.keys(b.metadata ?? {})).toEqual(["login", "roles", "email", "nickname"]);
    for (const e of [a, b]) {
      const c = canonicalize(JSON.stringify(e));
      expect(c).not.toContain("@example.com");
      expect(c).not.toContain('"first_name"');
    }
  });
});

describe("fromWpUser (live /wp/v2/users, context=view)", () => {
  test("no registered_date / edit fields: converts without throwing, uses `at`", () => {
    expect(usersView.map((u) => u.id)).toEqual([2, 3]);
    for (const u of usersView) {
      for (const k of ["email", "username", "roles", "registered_date"]) expect(k in u).toBe(false);
      const e = fromWpUser(u, { at: "2026-10-20T00:00:00Z", personal: true });
      expect([e.created_at, e.updated_at]).toEqual(["2026-10-20T00:00:00Z", "2026-10-20T00:00:00Z"]);
      expect(entrySchema(e)).toBe(true);
    }
    expect(fromWpUser(usersView[0]).metadata).toEqual({ url: { value: "https://example.com/demo-author" } });
    expect("metadata" in fromWpUser(usersView[1])).toBe(false);
  });
});

describe("media and users pass the v0.4 schema, validator and canonicalize()", () => {
  const owner = fromWpPost(products.find((p) => p.id === 10)!).entry;
  const all: EntryV04[] = [
    ...media.map((m) => fromWpMedia(m, { resolveKind })), ...users.map((u) => fromWpUser(u)), ...users.map((u) => fromWpUser(u, { personal: true, locale: "ru" })),
    ...usersView.map((u) => fromWpUser(u, { locale: "de" })), ...posts.map((p) => fromWpPost(p).entry), owner,
  ];
  test("ajv entry schema", () => { for (const e of all) { const r = entrySchema(e); if (!r) console.log(e.id, entrySchema.errors); expect([e.id, r]).toEqual([e.id, true]); } });
  test("validateCollectionV04 together with posts and the owner product", () => { expect(validateCollectionV04({ entries: files(all, "entries") })).toEqual([]); });
  test("canonicalize() accepts every record; private metadata is not in the projection", () => {
    for (const e of all) {
      const c = canonicalize(JSON.stringify(e));
      expect(isCodexId(e.id)).toBe(true);
      expect(c).not.toContain('"login"');
      expect(c).not.toContain('"roles"');
    }
  });
});
