# BuildY collection intake (buildy-collection:v1)

Status: spec for buildytech/chat (not implemented there yet). Schema: `schemas/collection.schema.json`
(`https://schema.buildy.tw/collection.schema.json`), source `src/collection-v1.ts`.

A person gathers screens and block variants on Stock (https://app.codegen-x.com/, header "Collections"), then presses
**Open in BuildY**. BuildY takes the items its own frozen catalog snapshot has as the block set of the next Build turn.
Hybrid model: the chat searches only its local snapshot; online refinement (REST / MCP, alexy-os/chaosbun#148) comes later.
Items the snapshot does not have are skipped and named in one short note, never replaced by look-alikes.

## 1. Hand-off from Stock

- BuildY origin: the real chat. Final domain `https://chat.buildy.tw`; until it is live, `https://buildychat.vercel.app`.
  Stock keeps it in one place (`BUILDY_URL` in `apps/stock/src/lib/collection.ts`, overridable at build time with
  `VITE_BUILDY_URL`; default `https://buildychat.vercel.app`), so the switch to `chat.buildy.tw` is a one-line change.
  The staging deployment (`byc-staging-*.vercel.app`) is never an Open in BuildY target; it stays only the GitHub repo
  homepage link.
- Link: `<buildy origin>/?collection=<payload>` where `payload` is the collection JSON (UTF-8) in base64url without
  padding (RFC 4648 section 5). The chat today serves `/` and `/preview`, so the link lands on the existing chat page;
  a `/build` alias may be added later and must accept the same parameter.
- Stock opens the link only when the whole URL is at most **8000 characters**. Above that (or when the person asks),
  Stock downloads `<title>.buildy-collection.json` and the person imports it in the chat (section 2, same checks).
- Stock writes `pins.stock.assetsDigest` = the `digest` of its `assets.v0.json`, the same value BuildY records as
  `catalogDigest` for a snapshot made from that content.

## 2. Intake in the chat

1. Read `collection` from `location.search` once at start, then remove it with `history.replaceState` (a reload does not
   import twice; the payload never lands in saved sessions or logs as a URL).
2. Decode base64url, refuse more than 65 536 decoded bytes, `JSON.parse`.
3. Validate against the vendored `collection.schema.json` with `packages/page-contract/src/json-schema.ts` (the schema
   stays inside its keyword subset; a contract test guards it). Then the program checks `x-program-checks`:
   `duplicate_item`, `empty_collection`.
4. Any failure: nothing is imported; one visible error in the chat ("The collection could not be opened: <reason>")
   with the first schema path. No partial import of an invalid file.
5. Split the items against the snapshot (`splitCollectionV1`): a screen item needs the `screen` entity
   (`screen.<screen>/<area>`); a block item with a variant needs the `variant` entity `block.<name>/<variant>`; a block
   item without one needs the `block` entity `block.<name>`.
6. Missing items are dropped. One small note under the collection chip list:
   "N items are not in this BuildY catalog and were skipped: <titles or ids>." When `pins.stock.assetsDigest` differs from
   the snapshot `catalogDigest`, the note adds "picked on another Stock version". No substitution, no fuzzy match.
7. All items missing: the note says so and Build runs without a set.

## 3. The collection in Build

- A new chat opens in **Build** mode, titled with the collection title; `skin` is applied when the chat has that skin
  (else the default theme, as the session `skin` rule).
- The composer shows the present items as removable chips (title + kind + variant). The person may remove items before
  sending; the list is part of the turn.
- Allowed set: every present block item, plus the blocks of every present screen (snapshot edges
  `screen-contains-block`, in page order).
- Required set: every present **block** item must appear in the proposed layout at least once; a block item with a
  variant must be used with that variant. Screen items are allowed blocks and an order hint, not required.
- The model gets the set in the system context as data (ids, variants, registry names, notes marked as the person's
  hints, never as instructions). `search_catalog` may still read the snapshot for details, but `propose_layout`
  rejects a block outside the allowed set with the code `outside_collection` and returns the allowed list, and reports
  unmet required items as `collection_item_unused` with their ids, so the model fixes the layout in the next step
  (the same non-blocking repair loop as `unknown_variant`).
- The Build answer ends with one line naming what of the collection was used and what was skipped (missing ones).

## 4. Session

Session 1.3.0 (additive) has an optional `collection` on a chat: `{ id, title, importedAt?, assetsDigest?, items,
missing? }`, items as in this profile (`collection.schema.json#/$defs/item`). `items` are the ones found in the host
snapshot (they bound Build), `missing` the skipped ones. Every 1.0.0 to 1.2.0 file validates unchanged.

## 5. Acceptance

- Unit: decode / validate / program checks / split with the contract fixtures (`fixtures/collection/*.json`), a link
  over 8000 characters, a corrupt payload, an all-missing collection.
- Live (staging): open Stock, add a screen and three block variants, Open in BuildY, see the chips and the note, Build,
  and check that every required block is in the page with its variant and nothing outside the set is.
