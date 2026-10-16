# @ui8kit/contract

The [Codex](https://github.com/fastygo/codex) **v0.3.0** wire contract for TypeScript, framework-neutral:

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
{ "$schema": "https://contract.ui8kit.com/v0.3/entry.schema.json" }
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

## Schema URLs

| Path | Meaning |
|---|---|
| `/v0.3/<name>.schema.json` | Pinned to a Codex minor line. The `$id` always uses this URL. |
| `/latest/<name>.schema.json` | The same bytes as the newest line. It moves when the Codex line moves. |

`<name>` is one of `entry`, `manifest`, `taxonomy` and `revision`. The static site lives in `public/`, and `vercel.json` sets CORS (`*`) and `Content-Type: application/schema+json` on it.

> **Not configured yet:** `https://contract.ui8kit.com` is a placeholder. The domain is not set up and nothing is deployed. Every `$id` refers to it, and `SCHEMA_BASE_URL` in `src/codex.ts` holds it.

## Versioning

- The package uses its own semver. `0.x` means the API can still change in a minor release.
- The Codex version it follows is in `CODEX_VERSION`, in `package.json#codex` and in each schema's `x-codex-version`.
- A new Codex minor (`0.4`) adds a new `/v0.4/` schema directory, moves `/latest/` and bumps the package minor (major after 1.0). Old `/vX.Y/` paths stay published.
- A Codex patch that does not change the wire shape only bumps the package patch.

## Develop

```sh
bun install
bun run gen        # writes schemas/ and public/ from scripts/schemas.ts
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
