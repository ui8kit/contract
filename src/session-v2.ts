// Session profile buildy:v2 (2.0.0, new major next to buildy:v1): the portable BuildY session file of the simple line
// (buildytech/chat ADR 0059). The same file as buildy:v1 without what only the Stock catalog and older hosts needed:
// a session is a project (page-spec/v2 record, skin, revision history, extensions); the chat lives in `ext.chat` only;
// Ask is read-only, so no Ask proposals, plans or block cards; pins name the registry and the prototypes, not Stock.
// Removed against buildy:v1: session mode / scenarioId / screenId / selectedModelId / usage / messages (flat chat keys),
// collection, page-spec/v1 records; message artifacts and plan; proposal assembler / screenId / demoData / catalogRefs /
// origin / page / changes; history op set_family; pins.stock; prefs.layout chatWidth / chatCollapsed.
// Schema: scripts/schemas-session-v2.ts -> schemas/session-v2.schema.json. It holds no credential.
import { SCHEMA_BASE_URL } from "./codex.js";
import { SESSION_LIMITS_V1, type SessionModeV1, type SessionRevisionCauseV1 } from "./session-v1.js";

export const SESSION_FORMAT_V2 = "buildy:v2";
export const SESSION_VERSION_V2 = "2.0.0";
export const SESSION_SCHEMA_URL_V2 = `${SCHEMA_BASE_URL}/session-v2.schema.json`;

/** What a revision did (optional): set_field (one field, `path` names it), set_variant, add, move, remove, insert (a duplicate or a new list row), replace. */
export const SESSION_REVISION_OPS_V2 = ["set_field", "set_variant", "add", "move", "remove", "insert", "replace"] as const;
export type SessionRevisionOpV2 = (typeof SESSION_REVISION_OPS_V2)[number];

/** Host records copied as they are (objects without a closed key set in this profile). */
export const SESSION_OPEN_RECORDS_V2 = ["ext.chat.usage", "run.usage", "run.rejected"] as const;

/** Program checks an importer runs after the schema (the same as buildy:v1). */
export const SESSION_PROGRAM_CHECKS_V2 = [
  "duplicate_session_id", "page_revision_mismatch", "history_not_monotonic", "selected_session_unknown", "duplicate_project_page",
] as const;
export type SessionProgramCheckV2 = (typeof SESSION_PROGRAM_CHECKS_V2)[number];

export const SESSION_LIMITS_V2 = { ...SESSION_LIMITS_V1 } as const;

/** Pane sizes of the shell (CSS px) and collapsed states; `focus` is the preview-only mode. */
export const SESSION_PREFS_LAYOUT_SIZES_V2 = ["navWidth", "sideWidth", "inspectorWidth", "layersHeight", "treeWidth"] as const;
export const SESSION_PREFS_LAYOUT_FLAGS_V2 = ["navCollapsed", "sideCollapsed", "inspectorCollapsed", "layersCollapsed", "treeCollapsed", "focus"] as const;

export type SessionRevisionEntryV2 = {
  revision: number;
  at: string;
  cause: SessionRevisionCauseV1;
  pageId?: string;
  blockId?: string;
  op?: SessionRevisionOpV2;
  /** JSON Pointer of the field or row in the block's props; never a value. */
  path?: string;
};

/** Catalog pins of the host: the registry build and the prototypes the catalog was made from, and the catalog digest. */
export type SessionPinsV2 = {
  registry: { url: string; sourceCommit: string };
  prototypes: { repo: string; commit: string };
  catalogDigest?: string;
};

/** The chat extension of a session (`ext.chat`): mode, model, usage and messages. */
export type SessionExtChatV2 = {
  mode?: SessionModeV1;
  selectedModelId?: string;
  usage?: Record<string, unknown>;
  messages?: Record<string, unknown>[];
};

/** One session: a project (page-spec/v2 record, skin, revision history) with its extensions; `ext.chat` is the chat. */
export type SessionChatV2 = {
  id: string;
  projectId?: string;
  title: string;
  createdAt?: string;
  updatedAt: string;
  pageId?: string;
  pageBound?: boolean;
  pageRevision?: number | null;
  skin?: string | null;
  page?: Record<string, unknown> | null;
  history?: SessionRevisionEntryV2[];
  ext?: { chat?: SessionExtChatV2 } & Record<string, Record<string, unknown> | undefined>;
};

export type SessionFileV2 = {
  $schema?: string;
  format: typeof SESSION_FORMAT_V2;
  exportedAt: string;
  app: { name: string; version: string; host: "browser" | "desktop" | "wordpress"; commit?: string };
  pins: SessionPinsV2;
  selectedSessionId?: string | null;
  sessions: SessionChatV2[];
  settings?: { theme?: "light" | "dark"; selectedModelId?: string; previewHideServiceLabels?: boolean };
  prefs?: { layout?: Partial<Record<(typeof SESSION_PREFS_LAYOUT_SIZES_V2)[number], number> & Record<(typeof SESSION_PREFS_LAYOUT_FLAGS_V2)[number], boolean>> };
};
