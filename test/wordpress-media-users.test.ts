// fromWpMedia / fromWpUser and the id rule. fixtures/wordpress/*.synthetic.json are SYNTHETIC: hand-written strictly
// after the documented WP REST shape (developer.wordpress.org/rest-api/reference/media, /users, context=edit),
// not captured from a live site.
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

const media: WpMedia[] = wpfx("media.synthetic");
const users: WpUser[] = wpfx("users.synthetic");
const posts: WpPost[] = wpfx("posts");

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
    expect(() => fromWpMedia(media[0], bad)).toThrow(/wordpress: id for media 20/);
    expect(() => fromWpUser(users[0], bad)).toThrow(/wordpress: id for user 1/);
    expect(() => fromWpPost(posts[0], bad)).toThrow(/wordpress: id for post 4/);
    expect(() => fromWpTerm(wpfx("categories")[0] as WpTerm, bad)).toThrow(/wordpress: id for category/);
    expect(fromWpMedia(media[0], { idFor: (k, n) => `wp:${k}:${n}` }).id).toBe("wp:media:20");
  });
});

describe("fromWpMedia (synthetic /wp/v2/media fixtures)", () => {
  const out = media.map((m) => fromWpMedia(m, { locale: "en" }));
  test("image: fields", () => {
    expect(out[0]).toEqual({
      id: "media-20", locale: "en", kind: "media", status: "published", visibility: "public", slug: "grid", title: "grid",
      origin: [{ system: "wordpress", id: "20" }], version: 1,
      created_at: "2026-10-14T23:24:20Z", updated_at: "2026-10-14T23:24:21Z", published_at: "2026-10-14T23:24:20Z",
      content: "An 8px layout grid.", author_id: "user-1", discussion: { comments: true, pings: false },
      metadata: {
        file: { value: "http://localhost:8081/wp-content/uploads/2026/10/grid.jpg" }, mime: { value: "image/jpeg" },
        size: { value: 184320 }, width: { value: 1200 }, height: { value: 800 },
        alt: { value: "A layout grid with 8px steps" }, caption: { value: "Every layout sits on an 8px grid." }, post: { value: 4 },
      },
    });
  });
  test("file without dimensions, empty texts, no parent post", () => {
    const e = out[1];
    expect(e.metadata).toEqual({ file: { value: "http://localhost:8081/wp-content/uploads/2026/10/price-list.pdf" }, mime: { value: "application/pdf" }, size: { value: 52431 } });
    expect("content" in e).toBe(false);
    expect(e.author_id).toBe("user-2");
  });
  test("the post's featured_media points at the media id", () => {
    expect(fromWpPost(posts[0]).entry.featured_media_id).toBe(out[0].id);
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

describe("fromWpUser (synthetic /wp/v2/users fixtures)", () => {
  const out = users.map((u) => fromWpUser(u));
  test("admin: public fields, login and roles private", () => {
    expect(out[0]).toEqual({
      id: "user-1", locale: "en", kind: "user", status: "published", visibility: "public", slug: "admin", title: "Site Admin",
      origin: [{ system: "wordpress", id: "1" }], version: 1, created_at: "2026-10-14T23:20:00+00:00", updated_at: "2026-10-14T23:20:00+00:00",
      content: "Runs the studio site.",
      metadata: { url: { value: "http://localhost:8081" }, login: { value: "admin", private: true }, roles: { value: ["administrator"], private: true } },
    });
  });
  test("no email, names, capabilities, avatar or password by default", () => {
    for (const e of out) {
      const s = JSON.stringify(e);
      for (const leak of ["@example.com", "capabilities", "gravatar", "password", "first_name", "last_name", "nickname", "en_US"]) expect(s).not.toContain(leak);
    }
  });
  test("personal: true adds email and names, only as private", () => {
    const e = fromWpUser(users[1], { personal: true });
    expect(e.metadata).toEqual({
      login: { value: "anna.editor", private: true }, roles: { value: ["editor"], private: true },
      email: { value: "anna@example.com", private: true }, first_name: { value: "Anna", private: true },
      last_name: { value: "Editor", private: true }, nickname: { value: "anna.editor", private: true },
    });
    expect(canonicalize(JSON.stringify(e))).not.toContain("anna@example.com");
  });
  test("view context (no registered_date, no edit fields) uses `at`", () => {
    const { username, email, roles, registered_date, first_name, last_name, nickname, locale, ...view } = users[0];
    const e = fromWpUser(view as WpUser, { at: "2026-10-20T00:00:00Z" });
    expect([e.created_at, e.updated_at]).toEqual(["2026-10-20T00:00:00Z", "2026-10-20T00:00:00Z"]);
    expect(Object.keys(e.metadata ?? {})).toEqual(["url"]);
  });
});

describe("media and users pass the v0.4 schema, validator and canonicalize()", () => {
  const all: EntryV04[] = [
    ...media.map((m) => fromWpMedia(m)), ...users.map((u) => fromWpUser(u)), ...users.map((u) => fromWpUser(u, { personal: true, locale: "ru" })),
    ...posts.map((p) => fromWpPost(p).entry),
  ];
  test("ajv entry schema", () => { for (const e of all) { const r = entrySchema(e); if (!r) console.log(e.id, entrySchema.errors); expect([e.id, r]).toEqual([e.id, true]); } });
  test("validateCollectionV04 together with posts", () => { expect(validateCollectionV04({ entries: files(all, "entries") })).toEqual([]); });
  test("canonicalize() accepts every record; private metadata is not in the projection", () => {
    for (const e of all) {
      const c = canonicalize(JSON.stringify(e));
      expect(isCodexId(e.id)).toBe(true);
      expect(c).not.toContain('"login"');
      expect(c).not.toContain('"roles"');
    }
  });
});
