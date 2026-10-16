# Changelog

## 0.2.0 (unreleased)

- Codex v0.4 core (docs/core-draft.md): `EntryV04`, `TermV04`, `CommentV04`, `MenuV04`, `DictionaryV04`, `RevisionV04`; `validateCollectionV04` with (id, locale), slug and term-slug uniqueness.
- JSON Schemas for v0.4 at stable unversioned URLs (`https://schema.buildy.tw/<name>.schema.json`); `/v0.3/` and `/latest/` removed.
- WordPress adapter at `@ui8kit/contract/adapters/wordpress` (`fromWpPost`/`toWpPost`, `fromWpTerm`/`toWpTerm`, sidecar for password and local dates), with real REST fixtures and round-trip tests.
- v0.3 types/validator kept as legacy.

## 0.1.0 (unreleased)

- Types for the Codex v0.3.0 wire contract: Entry, Manifest, Taxonomy, Revision.
- JSON Schemas (draft 2020-12) at `schemas/*.schema.json`; public site in `public/` (`/v0.3/`, `/latest/`).
- `validateSnapshot` (port from ui8kit/spline-svelte, `extra.*` checks opt-in), `validateTaxonomy`, `validateRevision`.
- `Library`, `loadLibrary`, `loadOrError`, `pick`, `localized`, `meta`, `termIds`, `defineAdapter`, `adaptAll`.
- Fixtures: Codex conformance fixtures and the 16-case broken-snapshot suite.
