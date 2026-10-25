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

- **Money**: a field with the rule `fastygo.codex/money` holds **integer minor units** (cents, kopecks: `1250` = 12.50) and needs an ISO 4217 currency: the entry's own metadata field (`currency`, or the rule arg `currency_field`; declare it in the manifest) or the default `currency` of a `settings` record in the collection, or `{ currency }` in the options. Otherwise error `manifest.currency_missing` (one per entry). An entry has one currency: money inside nested `collection` / `object` fields (order lines) uses it too. Amounts must be safe integers (|n| ≤ 2^53 − 1, so JS, Go and PHP read them exactly); zero and negative amounts (refunds, discounts) are valid; floats and numeric strings are not.
- Metadata keys equal to a core entry field (`status`, `excerpt`, `kind`, …) give the warning `core.metadata_key_shadowed`, with or without a manifest.

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

## Issue codes

`validateCollectionV04` returns `IssueV04[]` = `{ code, path, message, severity? }`. Errors have no `severity`; warnings carry `severity: "warning"` and never make a record invalid. The registry is `ISSUE_CODES_V04` (code → meaning) with `WARNING_CODES_V04`; a test proves every emitted code is registered and listed here. Match on `code`, never on `message` (messages may be reworded in any release).

Grammar: `<layer>.<scope>.<problem>`, or `<layer>.<field>_<problem>` for fields every record type shares. Layers: `decode` (not an object / unknown field), `core` (rules of the neutral core), `manifest` (metadata against a manifest, only when one is passed). Problems: `_required` (absent or blank), `_invalid` (type, enum, format), `_duplicated` (uniqueness), `_missing` (reference to a record not in the collection), `_unknown` (not declared), `_cycle`, `_self`, `_order`, `_shadowed`, `_incomplete`.

| Code | Severity | Meaning |
|---|---|---|
| `decode.invalid` | error | the value is not an object of the expected record type |
| `decode.unknown_field` | error | a field the record type does not have (records are closed) |
| `core.id_required` | error | id is absent or blank |
| `core.locale_invalid` | error | locale is not a BCP 47 tag |
| `core.version_required` | error | version is not an integer >= 1 |
| `core.timestamps_required` | error | created_at / updated_at are not RFC 3339 |
| `core.timestamps_order` | error | updated_at precedes created_at |
| `core.origin_invalid` | error | origin is not an array of {system, id} |
| `core.metadata_invalid` | error | metadata is not an object of {value, private?} |
| `core.metadata_key_required` | error | a metadata key is blank |
| `core.metadata_key_shadowed` | warning | a metadata key equals a core entry field (status, excerpt, ...) |
| `core.entry.type_invalid` | error | an optional entry field has the wrong type |
| `core.entry.kind_invalid` | error | kind is not an identifier (^[a-z][a-z0-9_-]{0,62}$) |
| `core.entry.status_invalid` | error | status is not one of ENTRY_STATUSES_V04 |
| `core.entry.visibility_invalid` | error | visibility is not public \| private |
| `core.entry.slug_required` | error | slug is blank |
| `core.entry.title_required` | error | title is not a string |
| `core.entry.time_invalid` | error | published_at / deleted_at is not RFC 3339 |
| `core.entry.published_at_required` | error | status scheduled without published_at |
| `core.entry.deleted_at_required` | error | status trashed without deleted_at |
| `core.entry.terms_invalid` | error | terms is not an array of {taxonomy, term_id} |
| `core.entry.key_duplicated` | error | (id, locale) is not unique among entries |
| `core.entry.slug_duplicated` | error | slug is not unique within (kind, locale, parent_id) |
| `core.entry.parent_missing` | error | parent_id names no entry of the collection |
| `core.entry.parent_self` | error | parent_id equals the entry's own id |
| `core.entry.parent_kind_invalid` | error | the parent entry has another kind |
| `core.entry.parent_cycle` | error | the parent chain loops back to the entry (per locale) |
| `core.term_ref.incomplete` | error | a term reference lacks taxonomy or term_id |
| `core.term_ref.duplicated` | error | the same term is referenced twice by one entry |
| `core.term_ref.missing` | error | a term reference names no term of the collection |
| `core.term.type_invalid` | error | an optional term field has the wrong type |
| `core.term.taxonomy_invalid` | error | taxonomy_id is not an identifier |
| `core.term.name_required` | error | name is blank |
| `core.term.slug_required` | error | slug is blank |
| `core.term.key_duplicated` | error | (id, locale) is not unique among terms |
| `core.term.slug_duplicated` | error | slug is not unique within (taxonomy_id, locale, parent_id) |
| `core.term.parent_missing` | error | parent_id names no term of the taxonomy |
| `core.term.parent_self` | error | parent_id equals the term's own id |
| `core.term.parent_cycle` | error | the parent chain loops back to the term (per taxonomy and locale) |
| `core.comment.entry_required` | error | entry_id is blank |
| `core.comment.content_required` | error | content is not a string |
| `core.comment.status_invalid` | error | status is not one of COMMENT_STATUSES_V04 |
| `core.comment.key_duplicated` | error | (id, locale) is not unique among comments |
| `core.comment.entry_missing` | error | entry_id names no entry of the collection |
| `core.menu.location_required` | error | location is blank |
| `core.menu.items_required` | error | items is not an array |
| `core.menu.item_incomplete` | error | a menu item lacks id, label or url |
| `core.menu.item_duplicated` | error | two items of one menu share an id |
| `core.menu.parent_missing` | error | an item's parent_id names no item of the menu |
| `core.menu.parent_cycle` | error | a menu item is its own ancestor |
| `core.menu.target_invalid` | error | target is not {kind, id} |
| `core.menu.key_duplicated` | error | (id, locale) is not unique among menus |
| `core.dictionary.messages_required` | error | messages is not an object |
| `core.dictionary.value_invalid` | error | a message is not a string |
| `core.settings.type_invalid` | error | an optional settings field has the wrong type |
| `core.settings.title_required` | error | title is blank |
| `core.settings.language_invalid` | error | language is not a BCP 47 tag |
| `core.settings.timezone_invalid` | error | timezone is not an IANA zone name |
| `core.settings.currency_invalid` | error | currency is not ISO 4217 (three capital letters) |
| `core.settings.key_duplicated` | error | (id, locale) is not unique among settings |
| `manifest.invalid` | error | the manifest is not {name, version, resources[]} |
| `manifest.kind_unknown` | warning | no resource of the manifest describes the entry's kind |
| `manifest.metadata_unknown` | warning | a metadata key the resource does not declare |
| `manifest.field_required` | error | a required manifest field is absent from metadata |
| `manifest.field_invalid` | error | a metadata value does not match its manifest field type or rule (integer and money: safe integers) |
| `manifest.currency_missing` | error | a money field without a currency (entry, settings or options) |
| `manifest.currency_invalid` | error | the currency of a money field is not ISO 4217 |

## Extension points

The core is closed: records reject unknown fields, and the core never grows platform fields. It is extended in four places, none of which touch the core:

1. **New entity = new `kind`.** A review, lead, deal, product or media item is an `EntryV04` with its own `kind` and typed `metadata`. Describe it as a manifest resource (`record.id` = kind, `fields`, `relations`) and pass `{ manifest }` to the validator. An undeclared kind is only a warning, so data can arrive before its manifest.
2. **Field rules.** `fastygo.codex/integer`, `fastygo.codex/uri`, `fastygo.codex/money` (args: `currency_field`). Unknown rule names are ignored by this validator, so other tools may add their own.
3. **Adapters live outside the core.** An adapter maps a platform record to core records plus a *sidecar* with whatever the core does not carry (passwords, local dates, original key sets), so platform → core → platform is lossless. The WordPress adapter (`@ui8kit/contract/adapters/wordpress`) is the reference: it is not exported from the package index, and the core never imports it. Write new adapters the same way (`fromX(record) → { entry, sidecar }`, `toX(entry, sidecar) → record`) and test them with a real-data round trip.
4. **Translations** are records with the same `id` and another `locale`; short UI strings go to dictionaries. No localized objects.

## Public API and semver

Stable surface of 0.2 (changes are listed in CHANGELOG.md):

- `@ui8kit/contract`: v0.4 types (`EntryV04`, `TermV04`, `TaxonomyDefinitionV04`, `CommentV04`, `MenuV04`, `MenuItemV04`, `DictionaryV04`, `RevisionV04`, `SettingsV04`), constants (`CODEX_V04_VERSION`, `ENTRY_STATUSES_V04`, `COMMENT_STATUSES_V04`, `VISIBILITIES_V04`, `TAXONOMY_MODES_V04`, `REQUIRED_V04`, `KEYS_V04`, `ISSUE_CODES_V04`, `WARNING_CODES_V04`, `schemaUrlV04`), the validator (`validateCollectionV04`, `check*V04`) and its types (`IssueV04`, `IssueCodeV04`, `ValidateV04Options`, `CollectionV04`, `RecordFile`).
- `@ui8kit/contract/adapters/wordpress`: `fromWpPost`/`toWpPost`, `fromWpTerm`/`toWpTerm`, `fromWpSettings`/`toWpSettings`, `stripWpComputed`, `WP_COMPUTED`, `wpManifest` and their types.
- JSON Schemas at `https://schema.buildy.tw/<name>.schema.json` and `schemas/*.schema.json` in the package.
- Issue `code` values (not messages).

Single source: `src/v04.ts` holds the types, enums and required lists; `scripts/schemas-v04.ts` builds the JSON Schemas from them; `src/validate-v04.ts` holds the strict key lists. `test/agreement.test.ts` proves at compile time that the types have exactly `KEYS_V04` / `REQUIRED_V04`, and at run time that the schemas have the same keys, required fields and enums, and that ajv and the validator give the same verdict on the minimal record, on each missing required field and on unknown fields.

Policy:

- The package is **0.x until Codex v0.5**. While on 0.x, a **minor** release (0.2 → 0.3) may change the public surface, rename issue codes or tighten a schema; every such change is listed under "Breaking" in CHANGELOG.md. A **patch** release only fixes bugs and adds tests, docs or new optional exports.
- Schema URLs are **unversioned** and are overwritten in place until v0.5 (there are no outside consumers yet). From v0.5 schemas are published at versioned paths, and the package moves to 1.0 with normal semver: breaking changes only in a major.
- Everything not listed above (`scripts/`, test helpers, the legacy v0.3 API, `docs/`) is internal.

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

- The package uses its own semver (see "Public API and semver" above).
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
  - the manifest digest (`codex-manifest/v1:sha256:…`; v2 = SHA-256 of JCS is agreed, see `docs/canonical.md`). Entry canonicalization is ported as a draft: `canonicalize` / `digest` (profile `codex-entry/v1`, `src/canonical.ts`, vectors in `fixtures/vectors/canonical.json`);
  - `Resource.PublicProjection`;
  - `fastygo.codex/*` rules other than `integer` and `uri`;
  - the full Codex locale grammar (here a locale only has to be lower-case and trimmed).
- `taxonomy.Assignment` has a type and a `$defs` entry but no validator.
- Integers above 2^53 (e.g. `source_sequence` in the fixture) lose precision in `JSON.parse` (the validator); `canonicalize` reads the raw text and rejects them with `canonical.unsafe_integer`.
- `fixtures/snapshot` is the CMS demo snapshot from spline-svelte. `fixtures/codex` is copied from Codex (MIT, see `fixtures/codex/LICENSE`).

## License

MIT
