// Source of the session profile buildy:v2 (JSON Schema draft 2020-12). `bun run gen` writes schemas/session-v2.schema.json
// and its public/ copy. Constants come from src/session-v2.ts (and the unchanged ones from src/session-v1.ts); pages are
// page-spec/v2 records. The schema stays inside the keyword subset of buildytech/chat `page-contract/src/json-schema.ts`
// (no `format`, no `patternProperties`), so the browser validates it without Ajv.
import {
  SESSION_COMMIT_PATTERN_V1, SESSION_DIFF_CHANGES_V1, SESSION_HOSTS_V1, SESSION_ID_PATTERN_V1, SESSION_MODES_V1,
  SESSION_PREFS_MAX_SIZE_V1, SESSION_PROPOSAL_STATUSES_V1, SESSION_REVISION_CAUSES_V1, SESSION_ROLES_V1, SESSION_SKIN_PATTERN_V1,
} from "../src/session-v1.ts";
import {
  SESSION_FORMAT_V2, SESSION_LIMITS_V2, SESSION_OPEN_RECORDS_V2, SESSION_PREFS_LAYOUT_FLAGS_V2, SESSION_PREFS_LAYOUT_SIZES_V2,
  SESSION_PROGRAM_CHECKS_V2, SESSION_REVISION_OPS_V2, SESSION_SCHEMA_URL_V2, SESSION_VERSION_V2,
} from "../src/session-v2.ts";
import { PAGE_DATETIME_PATTERN_V1, PAGE_LIMITS_V1 } from "../src/page-spec-v1.ts";
import { PAGE_SPEC_SCHEMA_URL_V2 } from "../src/page-spec-v2.ts";

const L = SESSION_LIMITS_V2;
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
const id = { type: "string", pattern: SESSION_ID_PATTERN_V1, description: "Host id of a session or a message (e.g. session-<uuid>, msg-<uuid>)." };
const commit = { type: "string", pattern: SESSION_COMMIT_PATTERN_V1, description: "Git commit (7 to 40 lowercase hex)." };
const mode = { enum: [...SESSION_MODES_V1], description: "Ask reads the page and the catalog and answers (read-only); Build changes the page." };
const revision = { type: ["integer", "null"], minimum: 0, description: "Revision of the applied page (null: no applied page). Equals page.revision (program check page_revision_mismatch)." };

const diffEntry = closed({
  scope: { enum: ["page", "block"], description: "page: a page field (title, slug, locale, seo); block: a section." },
  change: { enum: [...SESSION_DIFF_CHANGES_V1] },
  id: short,
  item: short,
  variant: short,
  from: { type: "integer", minimum: 0 },
  to: { type: "integer", minimum: 0 },
  paths: { type: "array", maxItems: 200, items: str(200), description: "changed: JSON Pointers (page fields, or props of the block) that differ." },
}, ["scope", "change"], "One change of a page proposal: what a write_page proposal does to the base page, per block and per page field. Never a value.");

const proposal = closed({
  applied: { type: "boolean" },
  status: { enum: [...SESSION_PROPOSAL_STATUSES_V1] },
  source: short,
  liveModel: { type: "boolean" },
  warnings: notes,
  missing: notes,
  title: str(PAGE_LIMITS_V1.maxTitleLength * 4),
  locale: str(PAGE_LIMITS_V1.maxLocaleLength),
  baseRevision: { type: "integer", minimum: 0, description: "The page revision the proposal was made for." },
  diff: { type: "array", maxItems: 200, items: ref("diffEntry"), description: "The proposal as a diff against the base page (per block: added, removed, moved, changed)." },
}, ["applied"], "The page proposal of a Build turn. The page itself is the record's candidate / lastProposed; Ask makes none.");

const run = closed({
  requestedModelId: short, modelId: short, modelLabel: short, live: { type: "boolean" },
  policyVersion: short, modelCatalogVersion: short, trialPolicyVersion: short, catalogDigest: short,
  path: short, tools: list, runId: short,
  usage: open("Token usage of the run as the provider reported it (status, steps, token counts, cost availability)."),
  rejected: open("The last write the host rejected in a turn that ended without an accepted write: the first issues ({ path, code, expected, got }) and the rejected document (or, when it is large, the block the first issue points at), for diagnosis. Small; no prompts, keys or provider payloads."),
}, ["modelId"], "The model run that produced an assistant message. Never holds prompts, keys or provider payloads.");

const message = closed({
  id: ref("id"),
  role: { enum: [...SESSION_ROLES_V1] },
  text: str(L.maxTextLength, "Message text. Assistant text answers are the model's Markdown (rendered as safe Markdown, never as HTML)."),
  createdAt: ref("datetime"),
  mode: ref("mode"),
  selectedModelId: short,
  modelText: str(L.maxTextLength, "Build proposals: the model's own words next to the proposal summary (Markdown)."),
  answer: closed({ blocks: list }, ["blocks"], "A text answer: the catalog blocks the model read."),
  proposal: ref("proposal"),
  run: ref("run"),
}, ["id", "role", "text", "createdAt"]);

const revisionEntry = closed({
  revision: { type: "integer", minimum: 0 },
  at: ref("datetime"),
  cause: { enum: [...SESSION_REVISION_CAUSES_V1], description: "apply: a proposal became the page; edit: one committed inspector edit or block operation (typing in one field is one edit); undo / redo: an inspector step. An import keeps the revisions of the file." },
  pageId: short,
  blockId: short,
  op: { enum: [...SESSION_REVISION_OPS_V2], description: "Optional: what the revision did. set_field: one field written (path names it); set_variant; add; move; remove; insert: a duplicate or a new list row; replace: a block or a list swapped, or a reset to the sample props." },
  path: { type: "string", maxLength: 200, pattern: "^(?:/[A-Za-z0-9_~.-]{1,48}){0,12}$", description: "Optional: JSON Pointer of the field or row in the block's props (/title, /members/2). Never a value." },
}, ["revision", "at", "cause"], "One page revision: every committed change of the applied page adds one entry; an unchanged value adds none.");

const chatExt = closed({
  mode: ref("mode"),
  selectedModelId: short,
  usage: open("Usage summed over the runs of the chat."),
  messages: { type: "array", maxItems: L.maxMessages, items: ref("message") },
}, [], "The chat extension (ext.chat): what the chat keeps with a project.");

const session = closed({
  id: ref("id"),
  projectId: { ...ref("id"), description: "The project (the page record, skin and revision history) this session works on. Absent: the project id is `id`. The `page` record and the revision history belong to the project, so two sessions of one project must not both carry a `page` (program check duplicate_project_page)." },
  title: str(L.maxTitleLength),
  createdAt: ref("datetime"),
  updatedAt: ref("datetime"),
  pageId: short,
  pageBound: { type: "boolean" },
  pageRevision: revision,
  skin: { anyOf: [{ type: "string", pattern: SESSION_SKIN_PATTERN_V1 }, { type: "null" }], description: "Skin of the page: the id of the registry item theme-<skin> (npx ui8kit add theme-<skin> writes styles/skins/<skin>.css; the page wears it with data-skin=\"<skin>\"). Null or absent: the default theme. A host that does not have the skin keeps the value and shows the default theme." },
  page: { anyOf: [{ $ref: `${PAGE_SPEC_SCHEMA_URL_V2}#/$defs/record` }, { type: "null" }], description: "The project's page: a page-spec/v2 record (applied page, pending candidate, last proposal, their provenance, revision)." },
  history: { type: "array", maxItems: L.maxHistory, items: ref("revisionEntry"), description: `Revision history of the applied page, oldest first (the last ${L.maxHistory} entries).` },
  ext: { type: "object", maxProperties: 16, propertyNames: { pattern: "^[a-z][a-z0-9-]{0,31}$" }, properties: { chat: ref("chatExt") }, additionalProperties: { type: "object" }, description: "Extensions of the project by name; each is an object a module owns. ext.chat is the chat (mode, selectedModelId, usage, messages). A host keeps the extensions it does not know." },
}, ["id", "title", "updatedAt"], "One session: a project (page, skin, revision history) with its extensions; the chat is ext.chat.");

const app = closed({
  name: short,
  version: short,
  host: { enum: [...SESSION_HOSTS_V1] },
  commit,
}, ["name", "version", "host"], "The app that wrote the file.");

const pins = closed({
  registry: closed({ url: short, sourceCommit: ref("commit") }, ["url", "sourceCommit"], "The commit the UI8Kit registry build was made from."),
  prototypes: closed({ repo: short, commit: ref("commit") }, ["repo", "commit"], "The prototypes (block wireframes and contracts) the catalog was generated from."),
  catalogDigest: short,
}, ["registry", "prototypes"], "Catalog pins of the host when the file was written. An importer with other pins still opens the file; it re-validates pages against its own catalog.");

const settings = closed({
  theme: { enum: ["light", "dark"] },
  selectedModelId: short,
  previewHideServiceLabels: { type: "boolean" },
}, [], "Non-secret preferences of the host.");

const layoutProps: Record<string, unknown> = {};
for (const key of SESSION_PREFS_LAYOUT_SIZES_V2) layoutProps[key] = { type: "integer", minimum: 0, maximum: SESSION_PREFS_MAX_SIZE_V1 };
for (const key of SESSION_PREFS_LAYOUT_FLAGS_V2) layoutProps[key] = { type: "boolean" };
const prefs = closed({
  layout: closed(layoutProps, [], "Shell layout: pane sizes (CSS px) and collapsed states. A host clamps sizes to its own ranges and ignores what it does not show."),
}, [], "Layout preferences of the user. Optional; a file without it keeps the importer's layout.");

export const sessionSchemaV2 = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": SESSION_SCHEMA_URL_V2,
  "title": "BuildY session buildy:v2 — portable projects, chats, pages, revisions and catalog pins",
  "x-session-format": SESSION_FORMAT_V2,
  "x-session-version": SESSION_VERSION_V2,
  "description": "A portable BuildY session file of the simple line (buildytech/chat ADR 0059). A host exports it, any BuildY host imports it and Lab opens it for review: sessions: a project (page-spec/v2 record, skin, revision history) with its extensions (ext.chat: messages and Ask / Build mode), and the catalog pins (registry source commit, prototypes commit, catalog digest). Holds no credential. After the schema, importers run x-program-checks. Objects are closed except the host records in x-open-records. buildy:v1 files are a different profile (session.schema.json).",
  "x-program-checks": [...SESSION_PROGRAM_CHECKS_V2],
  "x-open-records": [...SESSION_OPEN_RECORDS_V2],
  "x-limits": { ...L },
  "type": "object",
  "additionalProperties": false,
  "required": ["format", "exportedAt", "app", "pins", "sessions"],
  "properties": {
    "$schema": { type: "string", maxLength: L.maxShortLength },
    format: { const: SESSION_FORMAT_V2 },
    exportedAt: ref("datetime"),
    app: ref("app"),
    pins: ref("pins"),
    selectedSessionId: orNull(ref("id")),
    sessions: { type: "array", maxItems: L.maxSessions, items: ref("session") },
    settings: ref("settings"),
    prefs: ref("prefs"),
  },
  "$defs": { datetime, id, commit, mode, revision, diffEntry, proposal, run, message, revisionEntry, chatExt, session, app, pins, settings, prefs },
};
