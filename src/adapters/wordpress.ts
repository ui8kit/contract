// WordPress REST v2 <-> Codex v0.4 core. Lives OUTSIDE the core: import from "@ui8kit/contract/adapters/wordpress".
// Field names come from real /wp/v2/{posts,pages,categories,tags}?context=edit responses (fixtures/wordpress).
// Platform-only fields (password, local dates) go to an adapter-side sidecar so WP -> core -> WP is lossless;
// computed fields (link, guid, *.rendered, *.protected, block_version, class_list, generated_slug,
// permalink_template, count, _links, _embedded) are dropped and not restored.
import type { EntryStatusV04, EntryV04, MetaValueV04, TermV04 } from "../v04.js";
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
  author: number; featured_media: number;
  comment_status: string; ping_status: string;
  template: string;
  meta: Record<string, unknown> | unknown[];
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
export type WpPostSidecar = { password: string; date: string | null; date_gmt_null: boolean; modified: string };

export type WpOptions = {
  /** Locale of the site's texts (WP REST does not report it). Default "en". */
  locale?: string;
  /** Core id for a WP object. Default `${kind}-${wpId}` (e.g. post-4, user-1, media-20, category-2). Must be reversible with `wpId`. */
  idFor?: (kind: string, wpId: number) => string;
  /** WP id from a core id. Default: the number after the last "-". */
  wpId?: (coreId: string) => number;
};

const REST_TERM_FIELD: Record<string, string> = { categories: "category", tags: "post_tag" };
const STATUS_IN: Record<string, EntryStatusV04> = { publish: "published", future: "scheduled", draft: "draft", pending: "pending", private: "published", trash: "trashed" };

const defId = (kind: string, n: number) => `${kind}-${n}`;
const defWpId = (id: string) => Number(id.slice(id.lastIndexOf("-") + 1));
const utc = (gmt: string) => (/[zZ]|[+-]\d\d:\d\d$/.test(gmt) ? gmt : `${gmt}Z`);
const gmtOut = (t: string) => t.replace(/(\.\d+)?(Z|[+-]00:00)$/, "");

function metaIn(meta: WpPost["meta"]): Record<string, MetaValueV04> | undefined {
  if (Array.isArray(meta) || !meta || !Object.keys(meta).length) return undefined;
  return Object.fromEntries(Object.entries(meta).map(([k, value]) => [k, k.startsWith("_") ? { value, private: true } : { value }]));
}
// PHP encodes an empty associative array as [], so WP sends [] when there is no meta.
const metaOut = (m: Record<string, MetaValueV04> | undefined) => (m && Object.keys(m).length ? Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.value])) : []);

export function fromWpPost(p: WpPost, opts: WpOptions = {}): { entry: EntryV04; sidecar: WpPostSidecar } {
  const id = opts.idFor ?? defId;
  const created = utc(p.date_gmt ?? p.modified_gmt);
  const updated = utc(p.modified_gmt);
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
    updated_at: updated < created ? created : updated,
  };
  if (p.content.raw) e.content = p.content.raw;
  if (p.excerpt.raw) e.excerpt = p.excerpt.raw;
  if (p.author) e.author_id = id("user", p.author);
  if (p.parent) e.parent_id = id(p.type, p.parent);
  if (p.featured_media) e.featured_media_id = id("media", p.featured_media);
  if (p.template) e.template = p.template;
  const terms = Object.entries(REST_TERM_FIELD).flatMap(([field, tax]) => ((p[field] as number[] | undefined) ?? []).map((n) => ({ taxonomy: tax, term_id: id(tax, n) })));
  if (terms.length) e.terms = terms;
  if (p.menu_order !== undefined) e.order = p.menu_order;
  if (p.sticky !== undefined) e.pinned = p.sticky;
  if (p.format !== undefined) e.format = p.format;
  e.discussion = { comments: p.comment_status === "open", pings: p.ping_status === "open" };
  const metadata = metaIn(p.meta);
  if (metadata) e.metadata = metadata;
  if (status === "published" || status === "scheduled") e.published_at = created;
  if (status === "trashed") e.deleted_at = updated; // WP REST has no trash time; modified is the closest
  return { entry: e, sidecar: { password: p.password, date: p.date, date_gmt_null: p.date_gmt === null, modified: p.modified } };
}

const STATUS_OUT: Record<EntryStatusV04, string> = { published: "publish", scheduled: "future", draft: "draft", pending: "pending", archived: "draft", trashed: "trash" };

/** Core entry (+ sidecar from fromWpPost) -> WP REST write/edit shape. Without a sidecar: empty password, local dates = GMT (not verified against a site timezone). */
export function toWpPost(e: EntryV04, sidecar?: WpPostSidecar, opts: WpOptions = {}): WpPost {
  const wp = opts.wpId ?? defWpId;
  const origin = e.origin?.find((o) => o.system === WP_SYSTEM);
  const p: WpPost = {
    id: origin ? Number(origin.id) : wp(e.id),
    type: e.kind,
    slug: e.slug,
    status: e.visibility === "private" && e.status === "published" ? "private" : STATUS_OUT[e.status],
    date: sidecar ? sidecar.date : gmtOut(e.created_at),
    date_gmt: sidecar?.date_gmt_null ? null : gmtOut(e.created_at),
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
    meta: metaOut(e.metadata),
  };
  if (e.pinned !== undefined) p.sticky = e.pinned;
  if (e.format !== undefined) p.format = e.format;
  for (const [field, tax] of Object.entries(REST_TERM_FIELD)) {
    const ids = (e.terms ?? []).filter((t) => t.taxonomy === tax).map((t) => wp(t.term_id));
    if (ids.length || e.kind === "post") p[field] = ids;
  }
  if (e.order !== undefined) p.menu_order = e.order;
  if (e.parent_id !== undefined || e.order !== undefined) p.parent = e.parent_id ? wp(e.parent_id) : 0;
  return p;
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
  const metadata = metaIn(t.meta);
  if (metadata) term.metadata = metadata;
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
