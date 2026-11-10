# Changelog

## Unreleased

- Added (session 1.4.0, additive): optional `plan` on a message (`$defs/plan`, `planOp`, `planItem`): an Ask page plan, page-patch/v1 ops (`SESSION_PLAN_OPS_V1`: set_variant, set, set_items, add, replace, remove, move) on blocks of the chat's page with the host's check (`valid`, `issue` with `allowed`) and, once run by Apply in Build, each op's `result` and the plan `status` (`SESSION_PLAN_STATUSES_V1`: proposed, executed, partial, failed). `proposal.origin` takes `ask-plan` next to `ask-card` (`SESSION_PROPOSAL_ORIGINS_V1`); `proposal.changes` lists block ids (older hosts wrote kinds). Every 1.0.0 to 1.3.0 file validates unchanged (buildytech/chat ADR 0020).

- Added (session 1.3.0, additive): optional `collection` on a chat (`$defs/collection`: `id`, `title`, `importedAt`, `assetsDigest`, `items`, `missing`; items by `$ref` to `collection.schema.json#/$defs/item`), the Stock collection the chat was opened from (docs/collection-intake.md section 4). Every 1.0.0 to 1.2.0 file validates unchanged.
- Added: collection format `buildy-collection:v1` (collection 1.0.0): `schemas/collection.schema.json` (+ `public/`, published at `https://schema.buildy.tw/collection.schema.json`), `src/collection-v1.ts` (constants, limits, program checks, `collectionAssetIdV1`, `collectionProgramIssuesV1`, `splitCollectionV1`, TS types), `scripts/schemas-collection-v1.ts`, `fixtures/collection/`, `test/collection-v1.test.ts` and the chat intake spec `docs/collection-intake.md`. Stock screens and block variants a person picks on Stock and hands to BuildY. Additive change: no existing schema is affected.
- Added (session 1.2.0, additive): optional root `prefs.layout`, the user's shell layout (pane sizes in integer CSS px, collapsed states, `focus` preview-only mode; `buildy:v1:prefs`). Hosts clamp sizes to their own ranges. Every 1.0.0 / 1.1.0 file validates unchanged.
- Added (session 1.1.0, additive): optional `skin` on a session (skin id of the registry item `theme-<skin>`, pattern `SESSION_SKIN_PATTERN_V1`, or null for the default theme). Every 1.0.0 file validates unchanged.
- Docs: the page store blob is described under its current key `buildy:v1:pages` (migrated once from `buildytech-creator-pages-v1`).
- Added: session format `buildy:v1` (session 1.0.0): `schemas/session.schema.json` (+ `public/`, published at `https://schema.buildy.tw/session.schema.json`), `src/session-v1.ts` (constants, limits, program checks, TS types), `scripts/schemas-session-v1.ts`, `fixtures/session/` (a real file exported by buildytech/chat, a minimal file) and `test/session-v1.test.ts`. Chats, messages, Ask / Build mode, the page-spec/v1 record by `$ref`, `pageRevision` and revision history, catalog pins (Stock content commit, registry source commit), `exportedAt` and the app version. Additive change: no existing schema is affected.
- Added (page-spec 1.1.0, additive): optional block fields `catalogBlock` (Stock catalog block asset, `block.<name>`) and `variant` (one of its catalog variants), copy keys `icon` (Lucide name) and `href` (link of `action`), slots `features: action, href` and `feature: icon`, row field `icon`, patch op `set_variant` and `variant` on `add` / `replace`. Hosts reject unknown catalog blocks, variants and icons against their pinned catalog and registry snapshot. Every 1.0.0 page and patch validates unchanged. Conformance cases for the new fields (`invalid_catalog_block`, `invalid_variant`, `invalid_icon`, `invalid_href`).
- Added: page spec profile `page-spec/v1` and edit operations `page-patch/v1`: `schemas/page-spec.schema.json`, `schemas/page-patch.schema.json` (+ `public/`), `src/page-spec-v1.ts` (constants, slots `PAGE_SLOTS_V1` / `PAGE_ITEM_SLOTS_V1`, program checks, TS types), `fixtures/page-spec/` (real assembled pages, store blob, `parsePage` conformance cases), `fixtures/page-patch/` and `test/page-spec-v1.test.ts`. The page root is the buildytech/chat Page DTO (layout.version 1) unchanged. Additive change: no existing schema is affected.

## 0.3.0 (2026-11-03)

- Added: view profile `view/v1`: `schemas/view.schema.json` (+ `public/`), `src/view-v1.ts` (constants, `FIELD_TYPE_VIEW_V1` Manifest field-type → view mapping, TS types), `fixtures/view/` (19 page types) and `test/view-v1.test.ts`. The profile projects v0.4 records via `$ref` and adds the primitives link, image, trustedHtml, pagination, menuTree, head and shell. Additive change: no existing schema is affected.

The npm release 0.2.0 (2026-10-17) predates the canonical digests and everything below; the next publish is 0.3.0. Codex stays `0.4.0` (draft v0.4: schemas are overwritten in place until v0.5).

Features:

- Settings contact block (owner decision 2026-10-28), all optional and platform-neutral, on `SettingsV04` next to `currency` and `timezone`: `contact: { phone?, email?, address?, links? }` (`phone` E.164; `email` a string with UI hint `email`, schema keyword `x-ui-hint`, not a type; `address` localized = one per settings record / locale; `links: [{ network, handle }]`, source order kept), `hours: [{ days, open, close }]` (weekdays `WEEKDAYS_V04`, `HH:MM` in `settings.timezone`, close up to `24:00`, close < open = past midnight) and `hours_exceptions: [{ date, closed: true } | { date, open, close }]`, `map: { provider?, lat?, lng? }`. New types `ContactV04`, `ContactLinkV04`, `HoursRuleV04`, `HoursExceptionV04`, `MapV04`, `WeekdayV04`; constants `WEEKDAYS_V04`, `LOCALE_NEUTRAL_SETTINGS_V04`, `E164_PATTERN`, `EMAIL_PATTERN`, `HANDLE_PATTERN`, `TIME_PATTERN`, `CLOSE_PATTERN`, `DATE_PATTERN`; `KEYS_V04.contact|contactLink|hoursRule|hoursException|map`, `REQUIRED_V04.contactLink|hoursRule|hoursException`.
- Validator: `core.settings.phone_invalid`, `email_invalid`, `link_invalid`, `hours_invalid`, `hours_exception_invalid`, `hours_exception_duplicated`, `map_invalid`; nested empty values are `core.settings.type_invalid` (omit the key); warning `core.settings.locale_neutral_mismatch` when phone, email, links, hours, exceptions or map differ between locales of one settings id.
- `codex-settings/v1` (profile name and rules unchanged): closed key sets of the nested contact objects (`canonical.unknown_field`, `canonical.invalid_type`); vectors `fixtures/vectors/settings.json`: full record with the block, links order changes the digest, empty top-level block fields dropped, unsafe integer inside `map`, unknown field inside `contact`.
- WordPress adapter: `WP_CONTACT_OPTIONS` (`wpfasty_contact_phone`, `wpfasty_contact_email`, `wpfasty_contact_address`, `wpfasty_contact_links`, `wpfasty_hours`, `wpfasty_hours_exceptions`, `wpfasty_map` of the wpfasty-types plugin) ↔ `contact.*`, `hours`, `hours_exceptions`, `map`; unset options stay in the sidecar; lossless round trip.
- Tests: `test/settings-contact.test.ts` (E.164 valid and invalid, hours and exceptions, links order, localized address, schema ↔ validator agreement, adapter); vector-count limit of the term/settings suites raised to 12.

## 0.2.0 (unreleased)

Hardening:

- Issue code registry `ISSUE_CODES_V04` / `WARNING_CODES_V04` / `IssueCodeV04`, documented in the README with the code grammar; a test keeps the registry, the validator and the README in sync.
- Single source: `REQUIRED_V04`, `VISIBILITIES_V04`, `TAXONOMY_MODES_V04` in `src/v04.ts` feed the JSON Schemas; `KEYS_V04` is `as const`. `test/agreement.test.ts` checks types ↔ keys ↔ required lists at compile time and schemas ↔ validator verdicts at run time (generated schemas are byte-identical).
- New checks: `core.entry.parent_cycle` (per locale), `core.term.parent_cycle` (per taxonomy and locale), `core.menu.parent_cycle`.
- Money: amounts must be safe integers; one currency per entry, shared by money in nested collections / objects (order lines), resolved from any money rule's `currency_field`.
- WordPress adapter fix: a scheduled (future) post keeps `modified_gmt` on the round trip (core `created_at` = modified, WP date in `published_at`).
- `test/edge.test.ts`: statuses (pending, private, sticky, draft with null `date_gmt`, future, trash round trips), null dates, nested pages and terms, six locales, dictionaries, money edge cases, nested menus, comments.
- README: extension points, public API and the 0.x semver policy.

Breaking (vs earlier 0.2.0 snapshots): `core.entry.type` / `core.term.type` / `core.settings.type` → `*.type_invalid`; `core.entry.parent_kind` → `core.entry.parent_kind_invalid`; `core.metadata.core_key` → `core.metadata_key_shadowed`.

Features:

- Codex v0.4 core (docs/core-draft.md): `EntryV04`, `TermV04`, `CommentV04`, `MenuV04`, `DictionaryV04`, `RevisionV04`; `validateCollectionV04` with (id, locale), slug and term-slug uniqueness.
- JSON Schemas for v0.4 at stable unversioned URLs (`https://schema.buildy.tw/<name>.schema.json`); `/v0.3/` and `/latest/` removed.
- WordPress adapter at `@ui8kit/contract/adapters/wordpress` (`fromWpPost`/`toWpPost`, `fromWpTerm`/`toWpTerm`, sidecar for password and local dates), with real REST fixtures and round-trip tests.
- `validateCollectionV04(c, { manifest })` checks entry metadata against the manifest (required, types, select options, collections, objects, relations); unknown kind / unknown metadata key are warnings.
- `wpManifest()` in the WordPress adapter.
- `fastygo.codex/money`: integer minor units + ISO 4217 currency (entry field or settings default); `settings` schema (`https://schema.buildy.tw/settings.schema.json`), `checkSettingsV04`, `settings` in collections; warning `core.metadata_key_shadowed`.
- WordPress adapter: all taxonomies of a type → terms (`taxonomies` option), original key set kept (no foreign keys written back), `metaPrefix`, null meta, `fromWpSettings`/`toWpSettings`; real fixtures for projects, products, settings.
- v0.3 types/validator kept as legacy.
- Id rule (draft v0.4): `CODEX_ID_PATTERN`, `isCodexId`, `assertCodexId`, `codexIdForInt` (`src/id.ts`), used by `canonicalize` (same behaviour) and by the WordPress adapter, which now throws on an invalid id. `entry.schema.json` unchanged.
- WordPress adapter: `fromWpMedia` (`/wp/v2/media` → kind `media`) and `fromWpUser` (`/wp/v2/users` → kind `user`, non-public data only as `private:true`).
- `fromWpMedia`: WP `post` → `metadata.attached_to` (`<kind>-<n>` reference, same id maker as posts) via `resolveKind` / `parentKind` options; `metadata.post` is no longer written; `parent_id` stays hierarchy within one kind.
- Term and settings digests (draft v0.4): `canonicalizeTerm` / `termDigest` (profile `codex-term/v1`; computed `count` is accepted and dropped) and `canonicalizeSettings` / `settingsDigest` (profile `codex-settings/v1`), codex-entry/v1 rules and error codes, shared code in `src/canonical.ts`; vectors `fixtures/vectors/term.json`, `settings.json`.
- `fromWpUser` always drops WP user meta `persisted_preferences` (editor settings), with or without `personal`. Docs: export media/users from `context=edit`; `context=view` gives an incomplete record (media without `title`).
- Manifest digest (draft v0.4): `manifestDigest` / `canonicalizeManifest`, profile `codex-manifest/v2` = `sha256` of RFC 8785 of the full manifest (codex-entry/v1 rules, array order kept), vectors `fixtures/vectors/manifest.json`; `docs/canonical.md` lists the digest prefixes (`codex-term/v1`, `codex-settings/v1` not implemented yet). `codex-manifest/v1` fixture unchanged.
- Live WordPress REST fixtures `fixtures/wordpress/{media,users}.{edit,view}.json` (test accounts on example.com); media/user tests use them (edit = main path, view = converts without edit fields); the earlier synthetic fixtures `media.synthetic.json` and `users.synthetic.json` are removed.

## 0.1.0 (unreleased)

- Types for the Codex v0.3.0 wire contract: Entry, Manifest, Taxonomy, Revision.
- JSON Schemas (draft 2020-12) at `schemas/*.schema.json`; public site in `public/` (`/v0.3/`, `/latest/`).
- `validateSnapshot` (port from ui8kit/spline-svelte, `extra.*` checks opt-in), `validateTaxonomy`, `validateRevision`.
- `Library`, `loadLibrary`, `loadOrError`, `pick`, `localized`, `meta`, `termIds`, `defineAdapter`, `adaptAll`.
- Fixtures: Codex conformance fixtures and the 16-case broken-snapshot suite.
