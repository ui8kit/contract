# Changelog

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
- WordPress adapter: `fromWpMedia` (`/wp/v2/media` → kind `media`) and `fromWpUser` (`/wp/v2/users` → kind `user`, non-public data only as `private:true`), with synthetic fixtures after the documented REST shape.
- `fromWpMedia`: WP `post` → `metadata.attached_to` (`<kind>-<n>` reference, same id maker as posts) via `resolveKind` / `parentKind` options; `metadata.post` is no longer written; `parent_id` stays hierarchy within one kind.
- `fromWpUser` always drops WP user meta `persisted_preferences` (editor settings), with or without `personal`. Docs: export media/users from `context=edit`; `context=view` gives an incomplete record (media without `title`).
- Manifest digest (draft v0.4): `manifestDigest` / `canonicalizeManifest`, profile `codex-manifest/v2` = `sha256` of RFC 8785 of the full manifest (codex-entry/v1 rules, array order kept), vectors `fixtures/vectors/manifest.json`; `docs/canonical.md` lists the digest prefixes (`codex-term/v1`, `codex-settings/v1` not implemented yet). `codex-manifest/v1` fixture unchanged.
- Live WordPress REST fixtures `fixtures/wordpress/{media,users}.{edit,view}.json` (test accounts on example.com); media/user tests use them (edit = main path, view = converts without edit fields) instead of `*.synthetic.json`.

## 0.1.0 (unreleased)

- Types for the Codex v0.3.0 wire contract: Entry, Manifest, Taxonomy, Revision.
- JSON Schemas (draft 2020-12) at `schemas/*.schema.json`; public site in `public/` (`/v0.3/`, `/latest/`).
- `validateSnapshot` (port from ui8kit/spline-svelte, `extra.*` checks opt-in), `validateTaxonomy`, `validateRevision`.
- `Library`, `loadLibrary`, `loadOrError`, `pick`, `localized`, `meta`, `termIds`, `defineAdapter`, `adaptAll`.
- Fixtures: Codex conformance fixtures and the 16-case broken-snapshot suite.
