// Source of the session profile buildy:v1 (JSON Schema draft 2020-12). `bun run gen` writes schemas/session.schema.json
// and its public/ copy. Constants come from src/session-v1.ts; pages and their provenance are page-spec/v1 $defs.
// The schema stays inside the keyword subset of buildytech/chat `page-contract/src/json-schema.ts` (no `format`,
// no `patternProperties`), so the browser validates it without Ajv.
import {
  SESSION_PREFS_LAYOUT_FLAGS_V1, SESSION_PREFS_LAYOUT_SIZES_V1, SESSION_PREFS_MAX_SIZE_V1,
  SESSION_COMMIT_PATTERN_V1, SESSION_SKIN_PATTERN_V1, SESSION_FORMAT_V1, SESSION_HOSTS_V1, SESSION_ID_PATTERN_V1, SESSION_LIMITS_V1,
  SESSION_MODES_V1, SESSION_OPEN_RECORDS_V1, SESSION_PROGRAM_CHECKS_V1, SESSION_PROPOSAL_STATUSES_V1,
  SESSION_REVISION_CAUSES_V1, SESSION_ROLES_V1, SESSION_SCHEMA_URL_V1, SESSION_VERSION_V1,
} from "../src/session-v1.ts";
import { COLLECTION_DIGEST_PATTERN_V1, COLLECTION_ID_PATTERN_V1, COLLECTION_LIMITS_V1, COLLECTION_SCHEMA_URL_V1 } from "../src/collection-v1.ts";
import { PAGE_DATETIME_PATTERN_V1, PAGE_LIMITS_V1, PAGE_SCENARIOS_V1, PAGE_SPEC_SCHEMA_URL_V1 } from "../src/page-spec-v1.ts";

const L = SESSION_LIMITS_V1;
const str = (max: number, description?: string) => ({ type: "string", maxLength: max, ...(description ? { description } : {}) });
const short = str(L.maxShortLength);
const list = { type: "array", maxItems: L.maxListItems, items: short };
/** Human-readable notes of the program (warnings, missing parts): sentences, not ids. */
const notes = { type: "array", maxItems: L.maxListItems, items: str(L.maxNoteLength) };
const closed = (properties: Record<string, unknown>, required: string[] = [], description?: string) => ({
  type: "object", additionalProperties: false, ...(required.length ? { required } : {}), ...(description ? { description } : {}), properties,
});
const open = (description: string) => ({ type: "object", description: `${description} Host record, copied as it is (open object).` });
const ref = (def: string) => ({ $ref: `#/$defs/${def}` });
const orNull = (s: unknown) => ({ anyOf: [s, { type: "null" }] });

const datetime = { type: "string", pattern: PAGE_DATETIME_PATTERN_V1, maxLength: PAGE_LIMITS_V1.maxDatetimeLength, description: "UTC ISO 8601 with Z (Date.prototype.toISOString)." };
const id = { type: "string", pattern: SESSION_ID_PATTERN_V1, description: "Host id of a chat or a message (e.g. session-<uuid>, msg-<uuid>)." };
const commit = { type: "string", pattern: SESSION_COMMIT_PATTERN_V1, description: "Git commit (7 to 40 lowercase hex)." };
const mode = { enum: [...SESSION_MODES_V1], description: "Ask reads the catalog and answers; Build changes the page." };
const revision = { type: ["integer", "null"], minimum: 0, description: "Revision of the applied page of the chat (null: no applied page). Equals page.revision (program check page_revision_mismatch)." };

const proposal = closed({
  applied: { type: "boolean" },
  status: { enum: [...SESSION_PROPOSAL_STATUSES_V1] },
  source: short,
  liveModel: { type: "boolean" },
  assembler: short,
  warnings: notes,
  missing: notes,
  title: str(PAGE_LIMITS_V1.maxTitleLength * 4),
  screenId: orNull(short),
  locale: str(PAGE_LIMITS_V1.maxLocaleLength),
  demoData: { type: "boolean" },
  catalogRefs: open("Catalog refs the program recomputed from the pinned Stock catalog (catalogDigest, pinnedCommit, screen, blocks)."),
  origin: { const: "ask-card", description: "Made by Apply variant on an Ask block card (no model call)." },
  changes: closed({ added: list, kept: list, removed: list }, ["added", "kept", "removed"], "Block kinds added, kept and removed versus the base page of a follow-up turn."),
}, ["applied"], "A page proposal of a Build turn. The page itself is the record's candidate / lastProposed.");

const run = closed({
  requestedModelId: short, modelId: short, modelLabel: short, live: { type: "boolean" },
  policyVersion: short, modelCatalogVersion: short, trialPolicyVersion: short, catalogDigest: short,
  path: short, tools: list, runId: short,
  usage: open("Token usage of the run as the provider reported it (status, steps, token counts, cost availability)."),
}, ["modelId"], "The model run that produced an assistant message. Never holds prompts, keys or provider payloads.");

const artifact = closed({
  kind: { const: "saved_page" }, pageId: short, slug: short, revision: { type: "integer", minimum: 0 }, files: list,
}, ["kind", "pageId", "slug", "revision", "files"]);

const message = closed({
  id: ref("id"),
  role: { enum: [...SESSION_ROLES_V1] },
  text: str(L.maxTextLength, "Message text. Assistant text answers are the model's Markdown (rendered as safe Markdown, never as HTML)."),
  createdAt: ref("datetime"),
  mode: ref("mode"),
  selectedModelId: short,
  modelText: str(L.maxTextLength, "Build proposals: the model's own words next to the proposal summary (Markdown)."),
  answer: closed({ blocks: list }, ["blocks"], "A text answer with no proposal: the catalog block specs the model read; cards are rebuilt from the host catalog."),
  artifacts: { type: "array", maxItems: L.maxListItems, items: ref("artifact") },
  proposal: ref("proposal"),
  run: ref("run"),
}, ["id", "role", "text", "createdAt"]);

const revisionEntry = closed({
  revision: { type: "integer", minimum: 0 },
  at: ref("datetime"),
  cause: { enum: [...SESSION_REVISION_CAUSES_V1], description: "apply: a proposal became the page; edit: one committed inspector edit or block operation (typing in one field is one edit); undo / redo: an inspector step. An import keeps the revisions of the file." },
  pageId: short,
  blockId: short,
}, ["revision", "at", "cause"], "One page revision: every committed change of the applied page adds one entry; an unchanged value adds none.");

const collectionItems = (description: string) => ({ type: "array", maxItems: COLLECTION_LIMITS_V1.maxItems, items: { $ref: `${COLLECTION_SCHEMA_URL_V1}#/$defs/item` }, description });
const collection = closed({
  id: { type: "string", pattern: COLLECTION_ID_PATTERN_V1, description: "id of the buildy-collection:v1 document." },
  title: { type: "string", minLength: 1, maxLength: COLLECTION_LIMITS_V1.maxTitleLength },
  importedAt: ref("datetime"),
  assetsDigest: { type: "string", pattern: COLLECTION_DIGEST_PATTERN_V1, description: "pins.stock.assetsDigest of the collection (the Stock asset index it was picked from)." },
  items: collectionItems("Items found in the host's catalog snapshot, in collection order (collection.schema.json items). They bound Build: block items are required, block items and the blocks of screen items are the allowed set."),
  missing: collectionItems("Items the host's snapshot does not have: skipped and named in a note, never substituted."),
}, ["id", "title", "items"], "Collection the chat was opened from (1.3.0, additive): a Stock collection buildy-collection:v1 (docs/collection-intake.md).");

const session = closed({
  id: ref("id"),
  title: str(L.maxTitleLength),
  createdAt: ref("datetime"),
  updatedAt: ref("datetime"),
  mode: ref("mode"),
  scenarioId: { enum: [...PAGE_SCENARIOS_V1, null] },
  screenId: orNull(short),
  selectedModelId: short,
  pageId: short,
  pageBound: { type: "boolean" },
  pageRevision: revision,
  skin: { anyOf: [{ type: "string", pattern: SESSION_SKIN_PATTERN_V1 }, { type: "null" }], description: "Skin of the page (1.1.0, additive): the id of the registry item theme-<skin> (npx ui8kit add theme-<skin> writes styles/skins/<skin>.css; the page wears it with data-skin=\"<skin>\"). Null or absent: the default theme. A host that does not have the skin keeps the value and shows the default theme." },
  collection: ref("collection"),
  usage: open("Usage summed over the runs of the chat."),
  messages: { type: "array", maxItems: L.maxMessages, items: ref("message") },
  page: { anyOf: [{ $ref: `${PAGE_SPEC_SCHEMA_URL_V1}#/$defs/record` }, { type: "null" }], description: "The chat's pages: a page-spec/v1 record (applied page, pending candidate, last proposal, their provenance, revision)." },
  history: { type: "array", maxItems: L.maxHistory, items: ref("revisionEntry"), description: `Revision history of the applied page, oldest first (the last ${L.maxHistory} entries).` },
}, ["id", "title", "updatedAt", "messages"], "One chat.");

const app = closed({
  name: short,
  version: short,
  host: { enum: [...SESSION_HOSTS_V1] },
  commit,
}, ["name", "version", "host"], "The app that wrote the file.");

const pins = closed({
  stock: closed({ repo: short, contentCommit: ref("commit") }, ["repo", "contentCommit"], "Stock content the chats were built from (codegen-x)."),
  registry: closed({ url: short, sourceCommit: ref("commit") }, ["url", "sourceCommit"], "The commit the UI8Kit registry build was made from."),
  catalogDigest: short,
}, ["stock", "registry"], "Catalog pins of the host when the file was written. An importer with other pins still opens the file; it re-validates pages against its own catalog.");

const settings = closed({
  theme: { enum: ["light", "dark"] },
  selectedModelId: short,
  previewHideServiceLabels: { type: "boolean" },
}, [], "Non-secret preferences of the host.");

const layoutProps: Record<string, unknown> = {};
for (const key of SESSION_PREFS_LAYOUT_SIZES_V1) layoutProps[key] = { type: "integer", minimum: 0, maximum: SESSION_PREFS_MAX_SIZE_V1 };
for (const key of SESSION_PREFS_LAYOUT_FLAGS_V1) layoutProps[key] = { type: "boolean" };
const prefs = closed({
  layout: closed(layoutProps, [], "Shell layout: pane sizes (CSS px) and collapsed states. A host clamps sizes to its own ranges and ignores what it does not show."),
}, [], "Layout preferences of the user (1.2.0): the host's buildy:v1:prefs. Optional; a file without it keeps the importer's layout.");

export const sessionSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": SESSION_SCHEMA_URL_V1,
  "title": "BuildY session buildy:v1 — portable chats, modes, pages, revisions and catalog pins",
  "x-session-format": SESSION_FORMAT_V1,
  "x-session-version": SESSION_VERSION_V1,
  "description": "A portable BuildY session file. A host exports it, any BuildY host imports it (Browser, Desktop, WordPress) and Lab opens it for review: chats with their messages and Ask / Build mode, each chat's page-spec/v1 record with its revision and revision history, and the catalog pins (Stock content commit, registry source commit). Holds no credential. After the schema, importers run x-program-checks. Objects are closed except the host records in x-open-records.",
  "x-program-checks": [...SESSION_PROGRAM_CHECKS_V1],
  "x-open-records": [...SESSION_OPEN_RECORDS_V1],
  "x-limits": { ...L },
  "type": "object",
  "additionalProperties": false,
  "required": ["format", "exportedAt", "app", "pins", "sessions"],
  "properties": {
    "$schema": { type: "string", maxLength: L.maxShortLength },
    format: { const: SESSION_FORMAT_V1 },
    exportedAt: ref("datetime"),
    app: ref("app"),
    pins: ref("pins"),
    selectedSessionId: orNull(ref("id")),
    sessions: { type: "array", maxItems: L.maxSessions, items: ref("session") },
    settings: ref("settings"),
    prefs: ref("prefs"),
  },
  "$defs": { datetime, id, commit, mode, revision, proposal, run, artifact, message, revisionEntry, collection, session, app, pins, settings, prefs },
};
