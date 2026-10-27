---
name: ui8kit-new-block
description: Create a new UI8Kit block by contract - Codex data and dictionary first, then a Block-rooted composition of primitives with tag retag and static ARIA, identical on all runtimes, checks green. Use whenever a block, organism or section is added.
---

# Create a new block by contract

Rules: `.cursor/rules/00-ui8kit-core.mdc` to `05-checks-baselines.mdc`. Reference walkthrough:
`codegen-x/ui8kit:docs/specs-guide.md` §11 (organism `KeyFigure`).

## 0. Layer

Decide the layer first (rule 00, three layers): a **prototype** (block, organism: spec + generated runtimes) or a
**layout** (app structure in the layouts package, texts via props, data from the search engine package). Both follow
every step below, 8+4 included. An **app** only assembles layouts, data, routes and the brand theme: no new structure
there, and still no bare tags.

## 1. Contract first

1. Data: which Codex v0.4 records feed the block (`EntryV04` of a `kind`, terms, menus, settings). A new entity is
   a new `kind` with typed `metadata`, declared as a manifest resource; never a platform field in the core.
2. Add a fixture entry and the manifest fields; run `codex:validate` (`validateCollectionV04(collection, { manifest })`
   from `@ui8kit/contract/validate`) until it is clean.
3. Words: add dictionary keys for every visible or announced text (titles, labels, empty state, `aria-label`).
   In codegen-x: `packages/compose-gen/content/ui/en.json`, then
   `bun packages/compose-gen/screens/tools/author-block-texts.ts` for block names and variant labels.
4. Register the block's data binding where the project keeps it (codegen-x: `bun run codex:blocks` writes
   `packages/compose-gen/schema/codex/blocks.json`; a new block starts as `todo`).

## 2. Markup

1. Root: one `Block` with a semantic `tag` (`section`, `aside`, `header`, `article`, ...). Name the landmark from
   content: `aria-label` from a prop or `aria-labelledby` pointing at the heading.
2. Inside: compositions over primitives only (`Container`, `Stack`, `Group`, `Grid`, `Card`, `Title as={2}`,
   `Text`, `Button`, `List`, the kit's Lucide icon). No bare tags, no `{@html}`/`v-html`, no dynamic tag.
3. A nested or repeated region that needs its own landmark (`nav`, `figure`, `article`) is its own file rooted on
   `Block` (codegen-x: `NavBlock`, `FigureBlock`, `ArticleBlock`). No `Block` in a loop or inside `Block`.
4. ARIA static; state only through primitive props (`pressed`, `selected`).
5. Spacing 8+4 (even steps; odd steps only in controls), colors via tokens, no inline `style`, no `[..]` values.
6. Texts only from props / dictionary / records.

In codegen-x the block is a spec + builder (`packages/compose-gen/screens/src/authoring/blocks/*.ts`, registered in
`authoring/blocks/organisms.ts`, defined in `authoring/gallery/*.ts`), generated for all 8 runtimes by
`bun run build`; never hand-edit generated files.

## 3. Zones and checks

1. The block's directory is in `composition` and `blockRoot` of the package's `ui8kit` field; refresh
   `rules/zones.json` (`bun run rules:baseline`) and confirm the new file records 0 everywhere.
2. Verify (codegen-x): `bun run check`, `UI8KIT_REQUIRE_ALL_RUNTIMES=1 bun run test` (DOM parity on svelte, react,
   vue, solid, templ, twig, latte, jinja2), `bun run lint:px`, `bun run codex:validate`; when touching blocks or
   screens also `bun run build:hosts` and `bun run e2e`. Elsewhere: the project's verify, `codex:validate`, tests.

## Done

All checks green, zero new baseline entries, the same DOM, tokens and ARIA on every runtime.
