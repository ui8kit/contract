# AGENTS.md — ui8kit/contract

## What this repo is

1. `@ui8kit/contract`: the Codex v0.4 core contract for TypeScript (types, JSON Schemas, strict validator, snapshot
   loader, canonical digests, WordPress adapter). Read `README.md` first.
2. **The one central place of UI8Kit rules** for humans and agents. No block can be created without a contract, so
   the rules live with the contract: `.cursor/rules/*.mdc` and `.cursor/skills/*/SKILL.md`. Consumer projects copy
   both folders as is.

## Rules summary

Full text: `.cursor/rules/00-ui8kit-core.mdc` (always on) and rules 01 to 05.

- Three layers (`codegen-x/ui8kit:.project/adr/0001-three-layers-prototypes-layouts-apps.md` (commit `8fa0643`)): **prototypes** (blocks, organisms: every rule, 8+4 via
  ui8px), **layouts** (the app structure package, proposed `packages/layouts`: structural detectors, 8+4, tokens, zero
  baseline; texts via props, data from the search engine package), **apps** (assemble layout + data + routes + brand
  theme; screens free in brand style, no 8+4, no spacing group).
- The retag rule holds in every layer, app screens and taste screens included: no bare HTML tags, only the framework's
  UI8Kit primitives with `tag`.
- End goal: a visitor gets the ready code of a screen with all its dependencies (primitives, organisms, layouts,
  styles and tokens).

- Contract first: Codex records and dictionary keys before markup; `codex:validate` green.
- Every block opens on `Block`; one `Block` per render path, never nested, looped or duplicated; a nested or
  repeated landmark is its own file.
- Retag via the `tag` prop; `Title` uses `as` (its native prop). No dynamic tags, no raw HTML injection.
- Only the framework's native UI8Kit primitives and block / stack / group compositions; no bare HTML tags, in every
  layer.
- Valid HTML5 and ARIA; ARIA state only through primitive props.
- Identical DOM, tokens and ARIA on svelte, react, vue, solid, templ, twig, latte, jinja2 (web components out of
  scope).
- Spacing 8+4 for prototypes (organisms, blocks) and layouts only (8px steps; 4px only inside controls; no half
  steps, no arbitrary px or `[..]`). App screens are brand taste and style: neither ui8px nor a spacing check scans them.
- Everywhere: colors via tokens, Lucide icons, no inline `style`, texts from content / dictionary.
- New code has a zero baseline; baselines are legacy only and never grow.
- Checks on by default for every component directory, explicit opt-out with a reason (target policy).
- Every step ends with green verify / check, `codex:validate` and tests.
- License holder: the GitHub org owning the repo (UI8Kit / CodeGen-X).

## Where things are

| What | Path |
| --- | --- |
| Cursor rules | `.cursor/rules/00-ui8kit-core.mdc`, `01-block-root`, `02-primitives-html-aria`, `03-style-8-4-tokens`, `04-text-from-content`, `05-checks-baselines`, `10-contract-package` (this package) |
| Skills | `.cursor/skills/ui8kit-rule-checks`, `ui8kit-spacing-ui8px`, `ui8kit-new-block` |
| Reference tooling | `codegen-x/ui8kit`: `packages/tooling/rules`, `packages/ui-gates`, `packages/tooling/bin/ui8px-gate.mjs`, `rules/`, `.ui8px/` |
| Contract source | `src/v04.ts` -> `scripts/schemas-v04.ts` -> `schemas/`, `public/`; `src/canonical.ts`; `docs/` |

## Enforced by tooling today vs policy only

Tooling = `codegen-x/ui8kit` (commit `0156f73`).

| Rule | Status |
| --- | --- |
| Block root, one per path, not nested / looped | enforced: rules gate `block-root` (declared zones) |
| No bare tags, raw HTML, dynamic tags | enforced: `raw-native-tag`, `raw-html`, `dynamic-tag`; `ui-gates source` (kit-compose packages) |
| Box/Text tag allowlist | enforced: `ui-gates source` (`tag-allowlist`) |
| Static ARIA | enforced: `reactive-aria` |
| Valid HTML5 / ARIA of rendered output | enforced for compositions and gallery blocks: html-validate + axe-core (kit-compose tests, `ui-gates html`, compose-gen e2e) |
| Literal text | enforced: `literal-text` (templates; script prose reviewed) |
| Same DOM on 8 runtimes | enforced for generated compositions: kit-compose parity tests (`UI8KIT_REQUIRE_ALL_RUNTIMES=1` in CI) |
| 8+4 spacing (organisms, blocks) | enforced: `lint:px` (ui8px gate, `max: 0`) on compose-gen specs; kit-compose recipe tests |
| 8+4 spacing (layouts) | not yet: the layouts package does not exist; ui8px reads only the specs extract |
| No 8+4 on app screens | not yet: the `spacing` style group still scans `apps/magazine`, `apps/stock` (`STYLE_PACKAGES`) |
| No bare tags in app screens (whole app) | partial: `raw-native-tag` covers only the declared composition dirs (`apps/magazine/src/theme` is outside); `apps/magazine` records 230 |
| Exportable screen with its dependencies | no tool: no per-screen dependency closure or bundle emitter |
| Colors via tokens | enforced: recipe test, `hardcode` (specs; style group in `magazine`, `stock`) |
| Lucide icons | partial: kit-compose organisms test (glyph only inside the Icon primitive) |
| No inline `style` | policy only (`rules/html-validate.json` sets `no-inline-style: off`) |
| Zero baseline for new code | enforced in effect: a new file has 0 recorded, any finding fails the gate |
| Baselines never grow | partial: the gate fails on growth, but `rules:baseline --write` can re-record upward (review) |
| Checks on by default | policy (target); zones are opt-in via the `ui8kit` field |
| Box never a wrapper, one `main` per page, frame tag | review only |
| License holder | policy only |

## Current state (audit, not rules)

- The style groups (`corners`, `shadows`, `hardcode`, `spacing`) of the rules gate scan only `apps/magazine` and
  `apps/stock` (`STYLE_PACKAGES` in `packages/tooling/rules/src/style-zones.ts`).
- `lint:px` scans only the class sets extracted from `packages/compose-gen/specs` (`ui8px-extract.mjs`), the
  organisms/blocks layer, which matches the 8+4 scope.
- `packages/taste-screens` holds 91 arbitrary `[..]` classes: app-level brand styling, outside the 8+4 scope.
- The rules tooling lives inside `codegen-x/ui8kit` (`@codegen-x/tooling`, `@codegen-x/ui-gates`, both private) and is
  not yet a standalone package. Whether `ui8px` or a new package should host it: not decided / not checked.
- `ui8px` 0.2.5 reads `.html`, `.templ`, `.css`, `.go` only; Svelte/React/Vue need the extract bridge.

- Layers (`codegen-x/ui8kit` at `8fa0643`): Magazine's structure (`apps/magazine/src/parts`, `src/feed`, `src/theme`) still
  lives in the app with `mg-*` classes from `src/magazine.css`; the migration into a layouts package is planned, not done.

## How to verify (this repo)

```sh
bun install
bun run check   # typecheck + bun test + self-test + build; must stay green
```

The repo has no `verify` script; `check` is the verify step. Docs-only changes (`.cursor/`, `AGENTS.md`) do not
touch `src`, exports or tests. `package.json` `files` ships `dist`, `schemas`, `fixtures`, `README.md`,
`CHANGELOG.md`, `LICENSE`, so `.cursor/` and `AGENTS.md` are not published. Never `npm publish` from an agent.
