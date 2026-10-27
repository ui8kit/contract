---
name: ui8kit-rule-checks
description: Wire the UI8Kit rule checks (zones, the six detectors, zero baselines, ui-gates, codex:validate, CI gate) into a project. Use when setting up or extending checks in a repo that renders UI8Kit blocks.
---

# Wire UI8Kit rule checks into a project

The checks live today in `codegen-x/ui8kit` (commit `0156f73`): `packages/tooling` (`@codegen-x/tooling`, private)
and `packages/ui-gates` (`@codegen-x/ui-gates`, private). They are not a standalone npm package yet, so a consumer
copies them (MIT) or runs inside that monorepo. Rules: `.cursor/rules/05-checks-baselines.mdc`.

## 1. Bring the tooling

Copy from `codegen-x/ui8kit`, keeping the paths (the gate resolves the repo root as `packages/tooling/rules/../../..`
and reads `workspaces` of the root `package.json`):

- `packages/tooling/rules/**` (rules gate, detectors, adapters for 8 runtimes, style groups);
- `packages/tooling/package.json` deps: `svelte`, `@vue/compiler-sfc`, `typescript`; dev: `@babel/core`,
  `@babel/preset-typescript`, `babel-preset-solid`, `solid-js`;
- `rules/fixtures/<runtime>/<detector>.{ok,bad}.<ext>` (+ the `block-root.{branches.ok,siblings.bad,nested.bad,loop.bad}`
  cases): the gate self-tests every detector on every runtime and fails when a fixture is missing;
- `packages/ui-gates/**` (deps `html-validate`, `axe-core`, `jsdom`) and `rules/html-validate.json`.

Then edit `STYLE_PACKAGES` in `packages/tooling/rules/src/style-zones.ts`: it is a hard-coded list (`magazine`,
`stock` upstream). Put your hand-written app packages there or empty it. By layer (rule 05, zones by layer): a layouts package gets all
four groups; an app gets `corners`, `shadows`, `hardcode` but not `spacing` (upstream applies all four to every listed
package today, so this needs a per-package group list).

## 2. Declare zones (on by default)

In every package with components, add the `ui8kit` field to its `package.json`:

```json
"ui8kit": { "runtime": "react", "kit": ["src/ui", "src/utils"], "composition": ["src/blocks", "src/components", "src/screens"], "blockRoot": ["src/blocks", "src/screens"] }
```

Target policy: every component directory is in `composition`; a directory left out gets a written reason (README
or a comment next to the field). Today the gate only scans packages that declare the field. For apps the whole source
is composition (app screens included: no bare tags in any layer), only the kit list is left out; a layouts package is
composition with a zero baseline.

## 3. Scripts (root `package.json`)

Same names as upstream:

```json
"rules": "bun packages/tooling/rules/rules.ts",
"rules:baseline": "bun packages/tooling/rules/rules.ts --write",
"gates:source": "node packages/ui-gates/bin/ui-gates.mjs source <composition dirs...>",
"check": "... && bun run gates:source && bun packages/tooling/rules/rules.ts --gate",
"verify": "bun run check && bun run codex:validate && bun run typecheck && bun run test"
```

- `rules` counts findings per package (`--list` prints each); `--gate [dir]` fails on a new finding or a stale
  baseline; `--write` writes `rules/zones.json` and the baselines.
- `ui-gates source <dir|file>... [--allow tag,tag] [--allow-tag tag,tag] [--exclude dir]`: raw tag where a primitive
  exists, `Box`/`Text` tag allowlist. `ui-gates html <cases.json>`: `[{ "id", "html" }]` through html-validate and
  axe-core (for rendered cases of blocks).
- `codex:validate`: validate the project's fixtures with `validateCollectionV04` from `@ui8kit/contract/validate`
  against its manifest (pattern: `codegen-x/ui8kit:packages/compose-gen/schema/src/codex-validate.ts`).

## 4. Baselines: zero for new code

```sh
bun run rules:baseline   # writes rules/zones.json, rules/baselines/*.json, rules/style-baselines/*.json
bun run rules            # every count of a new project must be 0
```

A new project commits all-zero baselines. Legacy code may record its current counts once; after that they only go
down. Never re-record to hide a new finding.

## 5. CI gate

Run `bun run verify` (and `bun run lint:px` from skill `ui8kit-spacing-ui8px` where organisms/blocks exist) on every
push and PR; a non-zero exit fails the job. For a multi-runtime repo, also run the template engines' tests
(upstream sets `UI8KIT_REQUIRE_ALL_RUNTIMES=1`).

## Done

`bun run verify` green, `rules/zones.json` committed and current, baselines zero for new packages.
