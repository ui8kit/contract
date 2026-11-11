// Session profile buildy:v1: a portable BuildY session file (chats with their messages, the Ask / Build mode, the page
// spec record of each chat with its revision and revision history, and the catalog pins it was made with). The
// Browser host exports it (`window.buildy.export()`), every host imports it, Lab opens it for review. It is NOT a Codex
// v0.4 entry and it holds no credential: provider keys and Basic Auth never live in a session.
// Shape source: buildytech/chat `chat-core/types.ts` (ChatSession, ChatMessage) and the browser stores under
// `buildy:v1:*` keys. Pages are page-spec/v1 records (`page-spec.schema.json#/$defs/record`).
// Schema: scripts/schemas-session-v1.ts -> schemas/session.schema.json. Objects are closed except the host records
// named in SESSION_OPEN_RECORDS_V1 (usage, catalog refs), which hosts copy as they are.
import { SCHEMA_BASE_URL } from "./codex.js";

export const SESSION_FORMAT_V1 = "buildy:v1";
export const SESSION_VERSION_V1 = "1.7.0";
export const SESSION_SCHEMA_URL_V1 = `${SCHEMA_BASE_URL}/session.schema.json`;

/** Composer mode of a chat (ADR 0011 of buildytech/chat): Ask reads the catalog, Build changes the page. */
export const SESSION_MODES_V1 = ["ask", "build"] as const;
export type SessionModeV1 = (typeof SESSION_MODES_V1)[number];

export const SESSION_ROLES_V1 = ["user", "assistant"] as const;
export type SessionRoleV1 = (typeof SESSION_ROLES_V1)[number];

/** Hosts that write a session file. */
export const SESSION_HOSTS_V1 = ["browser", "desktop", "wordpress"] as const;
export type SessionHostV1 = (typeof SESSION_HOSTS_V1)[number];

export const SESSION_PROPOSAL_STATUSES_V1 = ["pending", "applied", "discarded", "superseded"] as const;

/** What made a proposal without a model call: an Ask block card (ask-card) or an Ask page plan (ask-plan, 1.4.0). */
export const SESSION_PROPOSAL_ORIGINS_V1 = ["ask-card", "ask-plan"] as const;

/** Ops of an Ask page plan (1.4.0): page-patch/v1 ops on blocks of the chat's page. */
export const SESSION_PLAN_OPS_V1 = ["set_variant", "set", "set_items", "add", "replace", "remove", "move"] as const;
/** proposed: not run yet; executed: every ticked op applied; partial: some; failed: none. */
export const SESSION_PLAN_STATUSES_V1 = ["proposed", "executed", "partial", "failed"] as const;

/**
 * What made a page revision. apply: a chat proposal became the page; edit: one committed inspector edit (typing in
 * one field is one edit) or block operation; undo / redo: an inspector undo or redo step. An import keeps the
 * revisions of the file.
 */
export const SESSION_REVISION_CAUSES_V1 = ["apply", "edit", "undo", "redo"] as const;
export type SessionRevisionCauseV1 = (typeof SESSION_REVISION_CAUSES_V1)[number];
/**
 * What a revision did (1.6.0, optional): set_field (one field written, `path` names it), set_variant, add, move,
 * remove, insert (a duplicate or a new list row), replace (a block or a list swapped, a reset to the Stock sample);
 * 1.7.0: set_family (the page's screen family changed, derived or pinned; its own step, undo reverts it).
 */
export const SESSION_REVISION_OPS_V1 = ["set_field", "set_variant", "add", "move", "remove", "insert", "replace", "set_family"] as const;
export type SessionRevisionOpV1 = (typeof SESSION_REVISION_OPS_V1)[number];

/** Host records copied as they are (objects without a closed key set in this profile). */
export const SESSION_OPEN_RECORDS_V1 = ["usage", "run.usage", "proposal.catalogRefs"] as const;

export const SESSION_ID_PATTERN_V1 = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$";
/** Skin id (registry item `theme-<id>` of registry.buildy.tw, from the CodeGen-X skins index). */
export const SESSION_SKIN_PATTERN_V1 = "^[a-z0-9][a-z0-9-]{0,62}$";
export const SESSION_COMMIT_PATTERN_V1 = "^[0-9a-f]{7,40}$";

export const SESSION_LIMITS_V1 = {
  maxSessions: 500, maxMessages: 2000, maxHistory: 500, maxTextLength: 200_000, maxTitleLength: 160,
  maxListItems: 200, maxShortLength: 200, maxNoteLength: 4000,
} as const;

export type SessionRevisionEntryV1 = {
  revision: number;
  at: string;
  cause: SessionRevisionCauseV1;
  pageId?: string;
  blockId?: string;
  /** 1.6.0: what the revision did. */
  op?: SessionRevisionOpV1;
  /** 1.6.0: JSON Pointer of the field or row in the block's render props (`/actions/cta`, `/content/features/2`); never a value. */
  path?: string;
};

export type SessionPinsV1 = {
  stock: { repo: string; contentCommit: string };
  registry: { url: string; sourceCommit: string };
  catalogDigest?: string;
};

export type SessionAppV1 = { name: string; version: string; host: SessionHostV1; commit?: string };

/** One chat. `page` is a page-spec/v1 record; `pageRevision` equals `page.revision`. */
export type SessionChatV1 = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt?: string;
  mode?: SessionModeV1;
  scenarioId?: "dashboard" | "landing" | "website" | null;
  screenId?: string | null;
  selectedModelId?: string;
  pageId?: string;
  pageBound?: boolean;
  pageRevision?: number | null;
  /** Skin of the chat's page (1.1.0): the registry item `theme-<skin>` (`npx ui8kit add theme-<skin>`); null or absent: the default theme. */
  skin?: string | null;
  /** Collection the chat was opened from (1.3.0, optional): the buildy-collection:v1 items found in the host snapshot and the ones it skipped. */
  collection?: SessionCollectionV1;
  usage?: Record<string, unknown>;
  messages: Record<string, unknown>[];
  page?: Record<string, unknown> | null;
  history?: SessionRevisionEntryV1[];
};

/**
 * A Stock collection (buildy-collection:v1) a chat was opened from (1.3.0). `items` are the items the host found in
 * its catalog snapshot (they bound Build: required and allowed blocks); `missing` the ones it skipped and named in a
 * note, never substituted. Items are collection.schema.json items unchanged.
 */
export type SessionCollectionV1 = {
  id: string;
  title: string;
  importedAt?: string;
  assetsDigest?: string;
  items: Record<string, unknown>[];
  missing?: Record<string, unknown>[];
};

export type SessionFileV1 = {
  format: typeof SESSION_FORMAT_V1;
  $schema?: string;
  exportedAt: string;
  app: SessionAppV1;
  pins: SessionPinsV1;
  selectedSessionId?: string | null;
  sessions: SessionChatV1[];
  settings?: { theme?: "light" | "dark"; selectedModelId?: string; previewHideServiceLabels?: boolean };
  /** Layout preferences of the user (1.2.0, optional): the host's `buildy:v1:prefs`. */
  prefs?: SessionPrefsV1;
};

/** Pane sizes in CSS px (integers); each host clamps them to its own ranges when it applies a file. */
export const SESSION_PREFS_LAYOUT_SIZES_V1 = ["navWidth", "chatWidth", "inspectorWidth", "layersHeight", "treeWidth"] as const;
/** Collapsed states of the side panels; `focus` is the preview-only mode (every side panel shown as a rail). */
export const SESSION_PREFS_LAYOUT_FLAGS_V1 = ["navCollapsed", "chatCollapsed", "inspectorCollapsed", "layersCollapsed", "treeCollapsed", "focus"] as const;
/** Upper bound of a stored pane size (px); a host's own maximum is lower. */
export const SESSION_PREFS_MAX_SIZE_V1 = 4096;

export type SessionPrefsLayoutV1 = Partial<
  Record<(typeof SESSION_PREFS_LAYOUT_SIZES_V1)[number], number> & Record<(typeof SESSION_PREFS_LAYOUT_FLAGS_V1)[number], boolean>
>;
export type SessionPrefsV1 = { layout?: SessionPrefsLayoutV1 };

/**
 * Checks a JSON Schema cannot express; every importer runs them after the schema: session ids unique in the file,
 * `pageRevision` equal to `page.revision`, history revisions never decreasing and never above the page revision
 * (revisions made before the history existed have no entry), `selectedSessionId` naming a session of the file.
 */
export const SESSION_PROGRAM_CHECKS_V1 = [
  "duplicate_session_id", "page_revision_mismatch", "history_not_monotonic", "selected_session_unknown",
] as const;
export type SessionProgramCheckV1 = (typeof SESSION_PROGRAM_CHECKS_V1)[number];
