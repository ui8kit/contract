# @ui8kit/contract

The [Codex](https://github.com/fastygo/codex) wire contract for TypeScript, framework-neutral. The current contract is the **Codex v0.4 core** (draft, agreed in [`docs/core-draft.md`](docs/core-draft.md)); the v0.3 types and validator stay in the package as legacy.

## Codex v0.4 core

One neutral shape for every platform (WordPress, Slim/Flight, GoCMS/GoCRM, Svelte/React/Vue apps, codegen-x fixtures). No platform fields in the contract.

- Texts (`title`, `slug`, `content`, `excerpt`, menu labels) are **plain strings** in one `locale`. The record key is **`(id, locale)`**: a translation is another record with the same `id` and another `locale`. Short UI strings live in dictionaries (`{ locale, source_locale?, messages }`).
- Entry: `id, locale, kind, status, visibility, slug, title` + optional `content, excerpt, author_id, parent_id, featured_media_id, template, terms, order, pinned, format, discussion{comments,pings}, origin[{system,id}], metadata{k:{value,private?}}, published_at, deleted_at`, and `version, created_at, updated_at`.
- Entry status: `draft | pending | scheduled | published | archived | trashed`. New entities (review, lead, deal, media, user, settings) are a `kind` with typed fields in `metadata`, never a status.
- Settings: `{ id, locale, title, language, description?, timezone?, logo_media_id?, icon_media_id?, front_page_id?, posts_page_id?, posts_per_page?, comments_open?, currency? }` + `version, created_at, updated_at` (validated in `settings: [...]` of the collection; unique `(id, locale)`).
- Term: same `(id, locale)` key, `taxonomy_id, name, slug, description?, parent_id?`. Comment statuses: `approved | hold | spam | trash`. Menu: `{ id, location, locale, items[{ id, label, url, parent_id?, order?, target?{kind,id} }] }`.

```ts
import { validateCollectionV04, type EntryV04 } from "@ui8kit/contract";

const issues = validateCollectionV04({ entries: [{ file: "post-4.json", data }], terms, comments, menus, dictionaries });
```

Pass a manifest to check entry `metadata` against the resource of the entry's kind: `validateCollectionV04(collection, { manifest })`.

- Field types are the manifest's own (`manifest.schema.json`, unchanged): `string/text/textarea/richtext/markdown` → string, `number` → finite number (`fastygo.codex/integer` rule → integer), `boolean`, `datetime` → RFC 3339, `select` → one of `options`, `collection` → array (each item checked against `items`), `object` → nested `fields`, `relation` → id (one-to-one) or id array, which must exist and have the relation's `target` kind. `json`, `computed`, `encrypted` and unknown types accept any value.
- `required` fields missing, empty or null → error `manifest.field_required`; wrong type → error `manifest.field_invalid`.
- Kind not in the manifest → **warning** `manifest.kind_unknown` (metadata not checked): new kinds can appear before their manifest. Metadata key not declared for the kind → **warning** `manifest.metadata_unknown`. Warnings carry `severity: "warning"`; errors have no `severity`.
- Manifest fields whose id is a core entry key (`title`, `slug`, …) describe the core field and are not looked up in metadata.
- Without a manifest, metadata is not checked at all.

- **Money**: a field with the rule `fastygo.codex/money` holds **integer minor units** (cents, kopecks: `1250` = 12.50) and needs an ISO 4217 currency: the entry's own metadata field (`currency`, or the rule arg `currency_field`; declare it in the manifest) or the default `currency` of a `settings` record in the collection, or `{ currency }` in the options. Otherwise error `manifest.currency_missing` (one per entry).
- Metadata keys equal to a core entry field (`status`, `excerpt`, `kind`, …) give the warning `core.metadata.core_key`, with or without a manifest.

The WordPress adapter exports `wpManifest()` (post/page with the `footnotes` meta seen on the sample site; pass `extraFields` for more registered meta).

The validator checks each record's shape (strict keys) and the set rules: `(id, locale)` unique; entry `slug` unique within `(kind, locale, parent_id)`; term `slug` unique within `(taxonomy_id, locale, parent_id)`; parent / term / comment references.

Schemas (draft 2020-12), stable unversioned URLs (no consumers yet; versioned URLs start at v0.5):

| Schema | URL |
|---|---|
| entry | `https://schema.buildy.tw/entry.schema.json` |
| term | `https://schema.buildy.tw/term.schema.json` |
| taxonomy | `https://schema.buildy.tw/taxonomy.schema.json` |
| comment | `https://schema.buildy.tw/comment.schema.json` |
| menu | `https://schema.buildy.tw/menu.schema.json` |
| dictionary | `https://schema.buildy.tw/dictionary.schema.json` |
| settings | `https://schema.buildy.tw/settings.schema.json` |
| manifest | `https://schema.buildy.tw/manifest.schema.json` (shape unchanged from v0.3) |
| revision | `https://schema.buildy.tw/revision.schema.json` |

The old `/v0.3/…` and `/latest/…` paths are removed.

## WordPress adapter (outside the core)

```ts
import { fromWpPost, toWpPost, fromWpTerm, toWpTerm } from "@ui8kit/contract/adapters/wordpress";

const { entry, sidecar } = fromWpPost(wpPost, { locale: "en" }); // REST v2 post/page, context=edit
const back = toWpPost(entry, sidecar);                            // equal to wpPost minus computed fields
```

- Not exported from the package index. Mapping: `type→kind`, `status` (`publish→published`, `future→scheduled`, `pending→pending`, `private→published + visibility:private`, `trash→trashed`), `*.raw→title/content/excerpt`, `sticky→pinned`, `menu_order→order`, `comment_status/ping_status→discussion`, `categories/tags→terms` (`category`, `post_tag`), `meta→metadata` (keys with `_` are private), WP id → `origin[{system:"wordpress"}]`. Default core ids are `${kind}-${wpId}` (`post-4`, `user-1`, `media-20`, `category-2`); override with `idFor`/`wpId`.
- **All taxonomies** of a type become `terms` (`categories`→`category`, `tags`→`post_tag`, `project_type`, `product_cat`, …): by default every top-level array of integers is a taxonomy named after its REST field; pass `taxonomies: { restField: taxonomy }` to set them explicitly (from `/wp/v2/types/<type>`).
- `metaPrefix` strips a meta prefix (`_shop_price` → `price`); typed REST meta stays typed; meta that is `null` in REST (not set) is left out of the core record.
- The **sidecar** keeps WordPress-only values outside the contract: `password`, local `date`/`modified`, whether `date_gmt` was null, the original key set (so `toWpPost` writes back only keys the object had: a `project` gets no `author`/`comment_status`), the taxonomy fields, meta key names and null meta.
- `fromWpSettings` / `toWpSettings`: `/wp/v2/settings` ↔ core `settings` (`language` en_US ↔ en-US, `site_logo`/`site_icon` → media ids, `show_on_front`+`page_on_front` → `front_page_id`, `default_comment_status` → `comments_open`, `wpfasty_currency` or `{ currency }` → `currency`). URL, admin email, date formats etc. stay in the sidecar.
- Dropped computed fields: `link`, `guid`, `*.rendered`, `*.protected`, `content.block_version`, `class_list`, `generated_slug`, `permalink_template`, term `count`, `_links`, `_embedded`.
- Not covered by WP REST: the site locale (pass `locale`), term timestamps (pass `at`), trash time (`deleted_at` = `modified_gmt`).
- `fixtures/wordpress/*.json` are real `context=edit` responses from local WordPress sites (hosts replaced with `http://localhost…`): posts, pages, categories, tags, settings (latte-press), projects + project_type (latte-folio), products + product_cat with typed meta in cents (latte-shop, wpfasty-types plugin). The tests run WP → v0.4 → WP on each of them and validate the converted records with ajv and the validator.

## Legacy v0.3

The v0.3 API is still exported:

- types for `Entry`, `Manifest` (`Resource`, `RecordType`, `Field`, `Relation`), taxonomy (`TaxonomyDefinition`, `Term`, `TaxonomyAssignment`) and `Revision`, with the wire (snake_case) field names;
- JSON Schemas (draft 2020-12) for entry, manifest, taxonomy and revision;
- a strict validator, a TypeScript port of the Codex and `fastygo/modules/content-json` checks, with issue codes that follow the Go names;
- a snapshot loader (`Library`), readers (`pick`, `localized`, `meta`, `termIds`) and the adapter pattern (`defineAdapter`).

The package has no runtime dependencies. It ships no app-specific adapters.

## Install

```sh
npm i @ui8kit/contract     # or: bun add @ui8kit/contract
```

## Usage

```ts
import { loadOrError, defineAdapter, pick, meta, SnapshotError } from "@ui8kit/contract";

const lib = loadOrError(manifestJson, files /* [{ file, data }] */);
if (lib instanceof SnapshotError) throw lib; // lib.issues: [{ code, path, message }]

const toCard = defineAdapter("page", (e, { locale }) => ({ id: e.id, title: pick(e.title, locale) }));
const cards = lib.byKind("page").map((e) => toCard(e, { locale: "en" }));
```

```ts
import { validateSnapshot, validateTaxonomy, validateRevision } from "@ui8kit/contract/validate";

validateSnapshot(manifest, files);                  // Go-loader parity
validateSnapshot(manifest, files, { extra: true }); // + extra.* checks (stricter than Go)
```

Schemas are importable or fetchable:

```ts
import entrySchema from "@ui8kit/contract/schemas/entry.schema.json" with { type: "json" };
```

```json
{ "$schema": "https://schema.buildy.tw/entry.schema.json" }
```

### Schemas and the validator

The JSON Schemas check structure only: keys, types, enums, identifier patterns and RFC 3339 timestamps. They reject unknown keys, as the Go strict decoder does. The semantic rules are in `validateSnapshot`, not in the schemas:

- field placement (a localized field goes to `locales[*].data`, any other field to `metadata`);
- select options and `fastygo.codex/*` rules;
- relations, parents, taxonomy assignment, duplicate ids;
- timestamp order.

A document can pass ajv and still fail the validator. Use both.

### `extra.*` checks

`{ extra: true }` turns on two checks that the Go loader does not run:

- `author_id` must point to a `user` entry;
- each `terms[]` item must point to a `term` entry of the taxonomy it names.

They are off by default.

## Versioning

- The package uses its own semver; `0.x` means the API can still change in a minor release.
- `CODEX_VERSION` / `package.json#codex` = `0.4.0`. v0.3 JSON Schemas are no longer published (in-memory legacy copies in `scripts/schemas.ts` keep testing the v0.3 fixtures).
- The static site is `public/` (Vercel, `vercel.json` sets CORS and `application/schema+json` on `*.schema.json`). From v0.5 schemas get versioned paths.

## Develop

```sh
bun install
bun run gen        # writes schemas/ and public/ from scripts/schemas-v04.ts
bun run check      # typecheck + tests + broken-snapshot self-test + build
```

The tests check three things:

- the generated files are up to date;
- the schema properties match the validator's strict key lists, which mirror the Go struct tags;
- the Codex conformance fixtures and the snapshot suite pass both ajv and the TS validator.

## Sources and gaps

- Types and fixtures come from `fastygo/codex` v0.3.0 (`content`, `schema`, `taxonomy`, `revision`, `conformance/fixtures`). Codex publishes no JSON Schema; these schemas are derived here.
- The validator is ported from `ui8kit/spline-svelte` (`packages/content`). In that repo, 15 broken snapshots were checked against `fastygo/modules/content-json` v0.1.0. The Go comparison has not been re-run in this repo.
- Not ported:
  - canonicalization and the manifest digest (`codex-manifest/v1:sha256:…`);
  - `Resource.PublicProjection`;
  - `fastygo.codex/*` rules other than `integer` and `uri`;
  - the full Codex locale grammar (here a locale only has to be lower-case and trimmed).
- `taxonomy.Assignment` has a type and a `$defs` entry but no validator.
- Integers above 2^53 (e.g. `source_sequence` in the fixture) lose precision in `JSON.parse`.
- `fixtures/snapshot` is the CMS demo snapshot from spline-svelte. `fixtures/codex` is copied from Codex (MIT, see `fixtures/codex/LICENSE`).

## License

MIT
