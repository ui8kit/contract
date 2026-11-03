// View profile view/v1: the data a view (template, SSG, front-end) renders a page from, for any backend that speaks
// Codex v0.4. A view context is a PROJECTION of Codex records (settings, dictionary, menu, entry of any kind, term,
// comment, manifest) plus a closed set of render-time primitives (link, image, trustedHtml, pagination, menuTree,
// head, date, shell). No new entity types. Arbitrary kinds and fields: entry `kind` + `fields` typed by Manifest
// Field types (FIELD_TYPE_VIEW_V1). Schema: scripts/schemas-view-v1.ts -> schemas/view.schema.json (bun run gen).
// Versioning: view/v1 is additive-only in minor versions; objects stay open.
import { SCHEMA_BASE_URL } from "./codex.js";

export const VIEW_PROFILE_V1 = "view/v1";
export const VIEW_VERSION_V1 = "1.0.0";
export const VIEW_SCHEMA_URL_V1 = `${SCHEMA_BASE_URL}/view.schema.json`;

/** The closed set of render-time primitives the view layer adds on top of Codex records. */
export const VIEW_PRIMITIVES_V1 = ["link", "image", "trustedHtml", "pagination", "menuTree", "head", "date", "shell"] as const;
export type ViewPrimitiveV1 = (typeof VIEW_PRIMITIVES_V1)[number];

/** request.pageType: which view a generator renders. */
export const VIEW_PAGE_TYPES_V1 = ["front", "home", "single", "page", "attachment", "archive", "category", "tag", "taxonomy", "author", "date", "post_type", "search", "404"] as const;
export type ViewPageTypeV1 = (typeof VIEW_PAGE_TYPES_V1)[number];

/** archive.type of a list context. */
export const VIEW_ARCHIVE_TYPES_V1 = ["search", "category", "tag", "author", "date", "post_type", "taxonomy", "home", "archive"] as const;
export type ViewArchiveTypeV1 = (typeof VIEW_ARCHIVE_TYPES_V1)[number];

/** View value of a Manifest Field by Field.type (manifest.schema.json $defs/Field). Unknown types: any JSON value. */
export const FIELD_TYPE_VIEW_V1 = {
  text: "string (plain text)",
  string: "string (plain text)",
  textarea: "string (plain text)",
  select: "string (the option value; its label via Field.options)",
  computed: "string",
  richtext: "trustedHtml (rendered)",
  markdown: "trustedHtml (rendered)",
  number: "number or numeric string",
  boolean: "boolean (or '1' / '' from string backends)",
  datetime: "date {display, iso} or an ISO 8601 string",
  relation: "link, entry view, or a list of them",
  collection: "array of field values",
  json: "object",
  object: "object",
  encrypted: "never sent to views",
} as const;
export type ManifestFieldTypeV1 = keyof typeof FIELD_TYPE_VIEW_V1;

export type TrustedHtmlV1 = string;
export type UrlV1 = string;
export interface DateV1 { display: string; iso: string }
export interface LinkV1 { title: string; url: UrlV1; current?: boolean; rel?: string; target?: string }
export interface ImageV1 { url: UrlV1; width: string | number; height: string | number; alt: string; srcset?: string; sizes?: string; mediaId?: string }
export interface TermViewV1 { name: string; slug: string; url: UrlV1; description?: string; count?: number; taxonomy?: string; current?: boolean }
export interface AuthorViewV1 { name: string; url: UrlV1; id?: number | string; avatar?: ImageV1 | null; bio?: string }
export type FieldValueV1 = string | number | boolean | null | DateV1 | LinkV1 | unknown[] | Record<string, unknown>;
export interface EntryViewV1 {
  id: number | string; title: string; slug: string; url: UrlV1;
  kind?: string; excerpt?: string; content?: TrustedHtmlV1; status?: string; locale?: string;
  date?: DateV1; modified?: DateV1; featuredImage?: ImageV1 | null; thumbnail?: ImageV1 | null;
  categories?: TermViewV1[]; tags?: TermViewV1[]; terms?: Record<string, TermViewV1[]> | [];
  author?: AuthorViewV1 | null; fields?: Record<string, FieldValueV1> | [];
  linkPages?: TrustedHtmlV1; pages?: { current: number; total: number; links?: LinkV1[] };
  prev?: LinkV1 | null; next?: LinkV1 | null; related?: EntryViewV1[]; readingTime?: number; protected?: boolean;
  commentsOpen?: boolean; commentCount?: number; isAttachment?: boolean; mimeType?: string; attachmentUrl?: UrlV1;
  [extra: string]: unknown;
}
export interface MenuItemViewV1 { id: number | string; title: string; url: UrlV1; current: boolean; ancestor?: boolean; target?: string; rel?: string; children: MenuItemViewV1[] }
export interface MenuTreeV1 { items: MenuItemViewV1[]; name?: string }
export type PaginationV1 = null | { current: number; total: number; prevUrl: string | null; nextUrl: string | null; url: string; firstUrl: string; perPage?: number; found?: number };
export interface HeadV1 { title?: string; description?: string; canonical?: UrlV1; robots?: string; og?: Record<string, string>; twitter?: Record<string, string>; jsonLd?: Record<string, unknown>[]; alternates?: { hreflang: string; url: UrlV1 }[] }
export interface RequestV1 { pageType?: ViewPageTypeV1; kind?: string; paged?: number; query?: string; loggedIn?: boolean; canEdit?: boolean; editUrl?: UrlV1; consent?: Record<string, boolean> }
export interface SiteViewV1 { title: string; url: UrlV1; lang: string; description?: string; dir?: "ltr" | "rtl"; charset?: string; locale?: string; year?: string; logo?: ImageV1 | null; currency?: string; [extra: string]: unknown }
export interface ShellV1 {
  profile?: typeof VIEW_PROFILE_V1; site: SiteViewV1; menu: Record<string, MenuTreeV1>;
  labels?: Record<string, string>; search?: Record<string, string>; widgets?: Record<string, TrustedHtmlV1>;
  head?: HeadV1; request?: RequestV1; breadcrumbs?: LinkV1[]; slots?: Record<string, unknown>;
  [extra: string]: unknown;
}
export interface CommentViewV1 { id: number | string; author: AuthorViewV1; content: TrustedHtmlV1; date: DateV1; status?: string; children?: CommentViewV1[] }
export interface PageContextV1 extends ShellV1 { page: EntryViewV1 | null; comments?: TrustedHtmlV1; commentsView?: { open?: boolean; count?: number; items?: CommentViewV1[]; pagination?: PaginationV1; form?: TrustedHtmlV1 }; posts?: EntryViewV1[] }
export interface ArchiveContextV1 extends ShellV1 {
  archive: { title: string; type: ViewArchiveTypeV1; description?: string; searchQuery?: string | null; kind?: string; taxonomy?: string; term?: TermViewV1; author?: AuthorViewV1; date?: { year?: number; month?: number; day?: number }; found?: number };
  posts: EntryViewV1[]; pagination: PaginationV1;
}
export interface ErrorContextV1 extends ShellV1 { error: { code: number; title: string; message: string; homeUrl?: UrlV1; homeLabel?: string } }
export type ViewContextV1 = PageContextV1 | ArchiveContextV1 | ErrorContextV1;
/** A fixture / example file: the root def it validates against + the context. */
export interface ViewExampleV1 { kind: "page" | "archive" | "error"; context: ViewContextV1 }
