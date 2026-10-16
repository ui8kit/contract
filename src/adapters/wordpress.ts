// WordPress REST v2 <-> Codex v0.4 core. Lives OUTSIDE the core: import from "@ui8kit/contract/adapters/wordpress".
// Field names come from real /wp/v2/{posts,pages,categories,tags}?context=edit responses (fixtures/wordpress).
// Platform-only fields (password, local dates) go to an adapter-side sidecar so WP -> core -> WP is lossless;
// computed fields (link, guid, *.rendered, *.protected, block_version, class_list, generated_slug,
// permalink_template, count, _links, _embedded) are dropped and not restored.
import type { EntryStatusV04, EntryV04, MetaValueV04, SettingsV04, TermV04 } from "../v04.js";
import type { Manifest } from "../codex.js";

export const WP_SYSTEM = "wordpress";

/** Subset of a WP REST post/page in context=edit that the adapter reads and writes. */
export type WpPost = {
  id: number; type: string; slug: string; status: string;
  date: string | null; date_gmt: string | null; modified: string; modified_gmt: string;
  password: string;
  title: { raw: string; rendered?: string };
  content: { raw: string; rendered?: string; protected?: boolean; block_version?: number };
  excerpt: { raw: string; rendered?: string; protected?: boolean };
  author?: number; featured_media: number;
  comment_status?: string; ping_status?: string;
  template: string;
  meta?: Record<string, unknown> | unknown[];
  sticky?: boolean; format?: string; categories?: number[]; tags?: number[];
  menu_order?: number; parent?: number;
  [computed: string]: unknown;
};
export type WpTerm = {
  id: number; taxonomy: string; name: string; slug: string; description: string;
  parent?: number; meta: Record<string, unknown> | unknown[];
  [computed: string]: unknown;
};

/** WordPress-only values kept next to (not inside) the core record. */
export type WpPostSidecar = {
  password: string; date: string | null; date_gmt_null: boolean; modified: string;
  /** Keys of the original REST object (minus computed ones): toWpPost writes back only these. */
  keys?: string[];
  /** REST field -> taxonomy used for this object (e.g. { project_type: "project_type" }). */
  taxonomies?: Record<string, string>;
  /** core metadata key -> original WP meta key (when a meta prefix was stripped). */
  metaKeys?: Record<string, string>;
  /** WP meta keys that were null (not set) in REST; they are left out of the core record and restored as null. */
  metaNull?: string[];
};

export type WpOptions = {
  /** Locale of the site's texts (WP REST does not report it). Default "en". */
  locale?: string;
  /** Core id for a WP object. Default `${kind}-${wpId}` (e.g. post-4, user-1, media-20, category-2). Must be reversible with `wpId`. */
  idFor?: (kind: string, wpId: number) => string;
  /** WP id from a core id. Default: the number after the last "-". */
  wpId?: (coreId: string) => number;
  /**
   * REST field -> taxonomy name, e.g. { categories: "category", tags: "post_tag", project_type: "project_type" }
   * (from /wp/v2/types/<type>.taxonomies + /wp/v2/taxonomies/<tax>.rest_base). Default: categories/tags, plus every
   * other top-level array of integers in the object, taken as a taxonomy whose name is the field name.
   */
  taxonomies?: Record<string, string>;
  /** Meta key prefix to strip, e.g. "_folio_" turns `_folio_client` into `client`. Keys without the prefix are kept as they are. */
  metaPrefix?: string;
};

const REST_TERM_FIELD: Record<string, string> = { categories: "category", tags: "post_tag" };
const STATUS_IN: Record<string, EntryStatusV04> = { publish: "published", future: "scheduled", draft: "draft", pending: "pending", private: "published", trash: "trashed" };
/** Top-level REST post keys that are not taxonomies even when they hold arrays. */
const NON_TAX = new Set(["class_list", "_links", "_embedded", "meta"]);

const defId = (kind: string, n: number) => `${kind}-${n}`;
const defWpId = (id: string) => Number(id.slice(id.lastIndexOf("-") + 1));
const utc = (gmt: string) => (/[zZ]|[+-]\d\d:\d\d$/.test(gmt) ? gmt : `${gmt}Z`);
const gmtOut = (t: string) => t.replace(/(\.\d+)?(Z|[+-]00:00)$/, "");

function metaIn(meta: WpPost["meta"] | undefined, prefix?: string): { md?: Record<string, MetaValueV04>; keys: Record<string, string>; nulls: string[] } {
  const keys: Record<string, string> = {};
  const nulls: string[] = [];
  if (Array.isArray(meta) || !meta || !Object.keys(meta).length) return { keys, nulls };
  const md: Record<string, MetaValueV04> = {};
  for (const [k, value] of Object.entries(meta)) {
    if (value === null) { nulls.push(k); continue; }
    if (prefix && k.startsWith(prefix) && k.length > prefix.length) { const c = k.slice(prefix.length); keys[c] = k; md[c] = { value }; }
    else md[k] = k.startsWith("_") ? { value, private: true } : { value };
  }
  return { md: Object.keys(md).length ? md : undefined, keys, nulls };
}
// PHP encodes an empty associative array as [], so WP sends [] when there is no meta.
function metaOut(m: Record<string, MetaValueV04> | undefined, keys: Record<string, string> = {}, nulls: string[] = []): Record<string, unknown> | unknown[] {
  const out: Record<string, unknown> = Object.fromEntries(Object.entries(m ?? {}).map(([k, v]) => [keys[k] ?? k, v.value]));
  for (const k of nulls) out[k] = null;
  return Object.keys(out).length ? out : [];
}

function taxFields(p: Record<string, unknown>, opts: WpOptions): Record<string, string> {
  if (opts.taxonomies) return Object.fromEntries(Object.entries(opts.taxonomies).filter(([f]) => Array.isArray(p[f])));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) if (!NON_TAX.has(k) && Array.isArray(v) && v.every((x) => Number.isInteger(x))) out[k] = REST_TERM_FIELD[k] ?? k;
  return out;
}

export function fromWpPost(p: WpPost, opts: WpOptions = {}): { entry: EntryV04; sidecar: WpPostSidecar } {
  const id = opts.idFor ?? defId;
  // WP `date_gmt` is the publish time; for a scheduled (future) post it lies after `modified`, so the core
  // created_at falls back to modified and the WP date lives in published_at.
  const dated = utc(p.date_gmt ?? p.modified_gmt);
  const updated = utc(p.modified_gmt);
  const created = dated > updated ? updated : dated;
  const status = STATUS_IN[p.status];
  if (!status) throw new Error(`wordpress: unknown post status "${p.status}" (post ${p.id})`);
  const e: EntryV04 = {
    id: id(p.type, p.id),
    locale: opts.locale ?? "en",
    kind: p.type,
    status,
    visibility: p.status === "private" ? "private" : "public",
    slug: p.slug || id(p.type, p.id),
    title: p.title.raw,
    origin: [{ system: WP_SYSTEM, id: String(p.id) }],
    version: 1,
    created_at: created,
    updated_at: updated,
  };
  if (p.content?.raw) e.content = p.content.raw;
  if (p.excerpt?.raw) e.excerpt = p.excerpt.raw;
  if (p.author) e.author_id = id("user", p.author);
  if (p.parent) e.parent_id = id(p.type, p.parent);
  if (p.featured_media) e.featured_media_id = id("media", p.featured_media);
  if (p.template) e.template = p.template;
  const taxonomies = taxFields(p, opts);
  const terms = Object.entries(taxonomies).flatMap(([field, tax]) => ((p[field] as number[] | undefined) ?? []).map((n) => ({ taxonomy: tax, term_id: id(tax, n) })));
  if (terms.length) e.terms = terms;
  if (p.menu_order !== undefined) e.order = p.menu_order;
  if (p.sticky !== undefined) e.pinned = p.sticky;
  if (p.format !== undefined) e.format = p.format;
  if (p.comment_status !== undefined || p.ping_status !== undefined) e.discussion = { comments: p.comment_status === "open", pings: p.ping_status === "open" };
  const { md, keys: metaKeys, nulls } = metaIn(p.meta, opts.metaPrefix);
  if (md) e.metadata = md;
  if (status === "published" || status === "scheduled") e.published_at = dated;
  if (status === "trashed") e.deleted_at = updated; // WP REST has no trash time; modified is the closest
  const keys = Object.keys(p).filter((k) => !(WP_COMPUTED as readonly string[]).includes(k));
  return { entry: e, sidecar: { password: p.password ?? "", date: p.date, date_gmt_null: p.date_gmt === null, modified: p.modified, keys, taxonomies, ...(Object.keys(metaKeys).length ? { metaKeys } : {}), ...(nulls.length ? { metaNull: nulls } : {}) } };
}

const STATUS_OUT: Record<EntryStatusV04, string> = { published: "publish", scheduled: "future", draft: "draft", pending: "pending", archived: "draft", trashed: "trash" };

/**
 * Core entry (+ sidecar from fromWpPost) -> WP REST write/edit shape. With a sidecar only the original keys are written
 * (a `project` without author/comments gets none). Without one: post-like defaults, empty password, local dates = GMT.
 */
export function toWpPost(e: EntryV04, sidecar?: WpPostSidecar, opts: WpOptions = {}): WpPost {
  const wp = opts.wpId ?? defWpId;
  const origin = e.origin?.find((o) => o.system === WP_SYSTEM);
  const p: WpPost = {
    id: origin ? Number(origin.id) : wp(e.id),
    type: e.kind,
    slug: e.slug,
    status: e.visibility === "private" && e.status === "published" ? "private" : STATUS_OUT[e.status],
    date: sidecar ? sidecar.date : gmtOut(e.published_at ?? e.created_at),
    date_gmt: sidecar?.date_gmt_null ? null : gmtOut(e.published_at ?? e.created_at),
    modified: sidecar ? sidecar.modified : gmtOut(e.updated_at),
    modified_gmt: gmtOut(e.updated_at),
    password: sidecar?.password ?? "",
    title: { raw: e.title },
    content: { raw: e.content ?? "" },
    excerpt: { raw: e.excerpt ?? "" },
    author: e.author_id ? wp(e.author_id) : 0,
    featured_media: e.featured_media_id ? wp(e.featured_media_id) : 0,
    comment_status: e.discussion?.comments ? "open" : "closed",
    ping_status: e.discussion?.pings ? "open" : "closed",
    template: e.template ?? "",
    meta: metaOut(e.metadata, sidecar?.metaKeys, sidecar?.metaNull),
  };
  if (e.pinned !== undefined) p.sticky = e.pinned;
  if (e.format !== undefined) p.format = e.format;
  const taxonomies = sidecar?.taxonomies ?? opts.taxonomies ?? REST_TERM_FIELD;
  for (const [field, tax] of Object.entries(taxonomies)) {
    const ids = (e.terms ?? []).filter((t) => t.taxonomy === tax).map((t) => wp(t.term_id));
    if (ids.length || sidecar || e.kind === "post") p[field] = ids;
  }
  if (e.order !== undefined) p.menu_order = e.order;
  p.parent = e.parent_id ? wp(e.parent_id) : 0;
  if (!sidecar?.keys) { if (e.parent_id === undefined && e.order === undefined) delete p.parent; return p; }
  const out: WpPost = {} as WpPost;
  for (const k of sidecar.keys) if (k in p) (out as Record<string, unknown>)[k] = p[k];
  return out;
}

/** WP term -> core term. WP REST terms carry no timestamps: `at` (default epoch) fills created_at/updated_at. */
export function fromWpTerm(t: WpTerm, opts: WpOptions & { at?: string } = {}): TermV04 {
  const id = opts.idFor ?? defId;
  const at = opts.at ?? "1970-01-01T00:00:00Z";
  const term: TermV04 = {
    id: id(t.taxonomy, t.id), locale: opts.locale ?? "en", taxonomy_id: t.taxonomy, name: t.name, slug: t.slug,
    origin: [{ system: WP_SYSTEM, id: String(t.id) }], version: 1, created_at: at, updated_at: at,
  };
  if (t.description) term.description = t.description;
  if (t.parent) term.parent_id = id(t.taxonomy, t.parent);
  const { md } = metaIn(t.meta);
  if (md) term.metadata = md;
  return term;
}

/** Core term -> WP term. `hierarchical` decides whether `parent` is written (WP sends it only for hierarchical taxonomies). */
export function toWpTerm(t: TermV04, opts: WpOptions & { hierarchical?: boolean } = {}): WpTerm {
  const wp = opts.wpId ?? defWpId;
  const origin = t.origin?.find((o) => o.system === WP_SYSTEM);
  const out: WpTerm = { id: origin ? Number(origin.id) : wp(t.id), taxonomy: t.taxonomy_id, name: t.name, slug: t.slug, description: t.description ?? "", meta: metaOut(t.metadata) };
  if (opts.hierarchical ?? t.taxonomy_id === "category") out.parent = t.parent_id ? wp(t.parent_id) : 0;
  return out;
}

/** Keys of a WP REST post/term that are computed by WordPress and are not carried through the core. */
export const WP_COMPUTED = ["link", "guid", "_links", "_embedded", "class_list", "generated_slug", "permalink_template", "count"] as const;
/** Strips computed fields (and *.rendered, *.protected, content.block_version) from a WP REST object, for comparisons. */
export function stripWpComputed<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if ((WP_COMPUTED as readonly string[]).includes(k)) continue;
    if (v && typeof v === "object" && !Array.isArray(v) && "raw" in v) out[k] = { raw: (v as { raw: unknown }).raw };
    else out[k] = v;
  }
  return out;
}

/**
 * Manifest for WordPress post/page as seen in fixtures/wordpress: the only registered meta key there is `footnotes`
 * (a string, WordPress core). Sites with more registered meta extend `fields`.
 */
export function wpManifest(extraFields: { post?: Manifest["resources"][number]["record"]["fields"]; page?: Manifest["resources"][number]["record"]["fields"] } = {}): Manifest {
  const footnotes = { id: "footnotes", label: "Footnotes", type: "string" };
  return {
    name: "wordpress",
    version: "1",
    resources: [
      { record: { id: "post", label: "Post", scope: "workspace", fields: [footnotes, ...(extraFields.post ?? [])] }, taxonomies: ["category", "post_tag"] },
      { record: { id: "page", label: "Page", scope: "workspace", fields: [footnotes, ...(extraFields.page ?? [])] } },
    ],
  };
}

// ---- settings (/wp/v2/settings)

/** /wp/v2/settings (context edit). Keys seen on a real WP 7.1 site; plugins add more (e.g. wpfasty_currency). */
export type WpSettings = Record<string, unknown> & {
  title: string; description: string; language: string; timezone: string;
  site_logo: number | null; site_icon: number; show_on_front: string; page_on_front: number; page_for_posts: number;
  posts_per_page: number; default_comment_status: string;
};
/** Everything WordPress-only from /wp/v2/settings (url, email, date formats, ...) and the original empty values. */
export type WpSettingsSidecar = { rest: Record<string, unknown>; empty: Record<string, unknown> };

const SETTINGS_MAPPED = ["title", "description", "language", "timezone", "site_logo", "site_icon", "show_on_front", "page_on_front", "page_for_posts", "posts_per_page", "default_comment_status", "wpfasty_currency"];

/**
 * /wp/v2/settings -> core settings. `currency` comes from `wpfasty_currency` (wpfasty-types plugin) or `opts.currency`.
 * WP REST has no settings timestamps: `at` (default epoch) fills created_at/updated_at.
 */
export function fromWpSettings(w: WpSettings, opts: WpOptions & { at?: string; currency?: string; id?: string } = {}): { settings: SettingsV04; sidecar: WpSettingsSidecar } {
  const id = opts.idFor ?? defId;
  const at = opts.at ?? "1970-01-01T00:00:00Z";
  const empty: Record<string, unknown> = {};
  const rest = Object.fromEntries(Object.entries(w).filter(([k]) => !SETTINGS_MAPPED.includes(k)));
  const language = (w.language || "en_US").replace(/_/g, "-");
  if (!w.language) empty.language = w.language;
  const s: SettingsV04 = { id: opts.id ?? "site", locale: opts.locale ?? language.split("-")[0], title: w.title, language, version: 1, created_at: at, updated_at: at, origin: [{ system: WP_SYSTEM, id: "settings" }] };
  if (w.description) s.description = w.description; else empty.description = w.description;
  if (w.timezone) s.timezone = w.timezone; else empty.timezone = w.timezone;
  if (w.site_logo) s.logo_media_id = id("media", w.site_logo); else empty.site_logo = w.site_logo;
  if (w.site_icon) s.icon_media_id = id("media", w.site_icon); else empty.site_icon = w.site_icon;
  if (w.show_on_front === "page" && w.page_on_front) s.front_page_id = id("page", w.page_on_front);
  else { empty.show_on_front = w.show_on_front; empty.page_on_front = w.page_on_front; }
  if (w.show_on_front === "page" && s.front_page_id === undefined) empty.show_on_front = w.show_on_front;
  if (w.page_for_posts) s.posts_page_id = id("page", w.page_for_posts); else empty.page_for_posts = w.page_for_posts;
  if (w.posts_per_page) s.posts_per_page = w.posts_per_page;
  if (w.default_comment_status !== undefined) s.comments_open = w.default_comment_status === "open";
  const currency = (w.wpfasty_currency as string | undefined) ?? opts.currency;
  if (currency) s.currency = currency;
  if (w.wpfasty_currency === undefined) empty.wpfasty_currency = undefined;
  return { settings: s, sidecar: { rest, empty } };
}

/** Core settings (+ sidecar) -> /wp/v2/settings shape. */
export function toWpSettings(s: SettingsV04, sidecar: WpSettingsSidecar = { rest: {}, empty: {} }, opts: WpOptions = {}): WpSettings {
  const wp = opts.wpId ?? defWpId;
  const e = sidecar.empty;
  const out: Record<string, unknown> = { ...sidecar.rest };
  out.title = s.title;
  out.description = s.description ?? ("description" in e ? e.description : "");
  out.language = "language" in e ? e.language : s.language.replace(/-/g, "_");
  out.timezone = s.timezone ?? ("timezone" in e ? e.timezone : "");
  out.site_logo = s.logo_media_id ? wp(s.logo_media_id) : ("site_logo" in e ? e.site_logo : null);
  out.site_icon = s.icon_media_id ? wp(s.icon_media_id) : ("site_icon" in e ? e.site_icon : 0);
  out.show_on_front = s.front_page_id ? "page" : ("show_on_front" in e ? e.show_on_front : "posts");
  out.page_on_front = s.front_page_id ? wp(s.front_page_id) : ("page_on_front" in e ? e.page_on_front : 0);
  out.page_for_posts = s.posts_page_id ? wp(s.posts_page_id) : ("page_for_posts" in e ? e.page_for_posts : 0);
  if (s.posts_per_page !== undefined) out.posts_per_page = s.posts_per_page;
  if (s.comments_open !== undefined) out.default_comment_status = s.comments_open ? "open" : "closed";
  if (s.currency && !("wpfasty_currency" in e)) out.wpfasty_currency = s.currency;
  return out as WpSettings;
}
