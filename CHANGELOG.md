# Changelog

## 0.1.0 (unreleased)

- Types for the Codex v0.3.0 wire contract: Entry, Manifest, Taxonomy, Revision.
- JSON Schemas (draft 2020-12) at `schemas/*.schema.json`; public site in `public/` (`/v0.3/`, `/latest/`).
- `validateSnapshot` (port from ui8kit/spline-svelte, `extra.*` checks opt-in), `validateTaxonomy`, `validateRevision`.
- `Library`, `loadLibrary`, `loadOrError`, `pick`, `localized`, `meta`, `termIds`, `defineAdapter`, `adaptAll`.
- Fixtures: Codex conformance fixtures and the 16-case broken-snapshot suite.
