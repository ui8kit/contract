---
name: ui8kit-spacing-ui8px
description: Set up the 8+4 spacing check with ui8px for organisms and blocks (not screens or apps). Use when adding or tuning lint:px, .ui8px policy files or the ui8px gate.
---

# 8+4 spacing check with ui8px (organisms and blocks)

Scope: the intermediate prototype layer, **organisms and blocks** only. Screens and applications are brand taste and
style; do not point ui8px at them. Rule: `.cursor/rules/03-style-8-4-tokens.mdc`.

Facts below are from `ui8px` 0.2.5 (`npx ui8px --help`, its README and `docs/cli-api.md`, repo
`github.com/ui8kit/ui8px-cli`) and `codegen-x/ui8kit:packages/tooling/bin/ui8px-gate.mjs`, `ui8px-extract.mjs`,
`.ui8px/`.

## 1. Install and init

```sh
bun add -d ui8px            # upstream pins an exact version (codegen-x: 0.2.4)
npx ui8px init              # .ui8px/policy/{allowed,denied,scopes,groups,patterns}.json
npx ui8px init --preset go  # Go/templ libraries
```

## 2. Scopes

`.ui8px/policy/scopes.json`: `defaultScope` plus `scopes[{ name, files[globs], spacing }]`; `spacing` names a scale
in `allowed.json` (`spacing.layout`: even steps, 8px; `spacing.control`: adds odd steps, 4px).

- `controls` (`spacing: "control"`): the control recipes of the blocks layer: button, input, select, textarea,
  checkbox, radio, switch, badge, icon badge (upstream lists them file by file).
- `layout` (`spacing: "layout"`): every other organism and block.
- Do not list screens or app folders. Keep them out of the scan paths and `--ignore` them if a path overlaps.

## 3. What ui8px can read

`ui8px lint` reads static `class="..."` in `.html` and `.templ`, `@apply` in `.css`, and class strings in `.go`. It
does not read `.svelte`, `.tsx`, `.vue` or JSON specs. For those, mirror the class sets into `.html` first, as
upstream does: `ui8px-extract.mjs` writes `.ui8px/extract/specs/<dir>/<spec>.html` (one
`<i data-src="$.json.path" class="...">` per class set, with a nested `.gitignore`). Adapt its source folder
(upstream: `packages/compose-gen/specs`) to your organisms/blocks.

## 4. Gate

```sh
npx ui8px lint <organisms/blocks paths> --json      # exit 0 clean, 1 findings, 2 usage/runtime error
npx ui8px lint <paths> --ignore <screens> <apps>
```

Rules: `UI8PX001` spacing off the scope's grid, `UI8PX002` not in allowed policy, `UI8PX003` denied, `UI8PX004`
conflict, `UI8PX005` unknown `ui-*` class. Upstream blocks on `UI8PX001`, `UI8PX003`, `UI8PX005` and its own
`GRID` check (spacing-like tokens, including `[..]` values, against the scope's scale) and only reports `UI8PX002`,
`UI8PX004`. Copy `ui8px-gate.mjs` and add `.ui8px/gate.json`:

```json
{ "max": 0, "blocking": ["UI8PX001", "UI8PX003", "UI8PX005", "GRID"], "why": "8+4 for organisms and blocks" }
```

Script: `"lint:px": "node packages/tooling/bin/ui8px-gate.mjs"` (it runs the extract, writes
`.ui8px/reports/lint.json`, fails over `max`; `UI8PX_MAX=<n>` overrides one run). New projects keep `max: 0`.
`--learn` (telemetry, proposals) and `validate patterns` are for review, not the gate.

## Done

`bun run lint:px` green with `max: 0`, run in CI next to `verify`.
