// Record id rule (draft v0.4, agreed norm; the entry schema is NOT tightened until v0.5):
// - id is ASCII, matches CODEX_ID_PATTERN: ^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$;
// - a record that comes from an integer primary key MUST get the id `<kind>-<n>` (post-4, media-20, user-1);
// - the id never changes and is kept on import; the platform id lives in origin[] {system, id}.
// canonicalize() (src/canonical.ts) and the platform adapters use these helpers.

/** Pattern every record id must match (codex-entry/v1 rejects other ids with canonical.invalid_id). */
export const CODEX_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** True when `id` is a string matching CODEX_ID_PATTERN. */
export function isCodexId(id: unknown): id is string {
  return typeof id === "string" && CODEX_ID_PATTERN.test(id);
}

/** Throws when `id` does not match CODEX_ID_PATTERN; returns it otherwise. `what` names the value in the message. */
export function assertCodexId(id: unknown, what = "id"): string {
  if (!isCodexId(id)) throw new Error(`${what} ${JSON.stringify(id)} must match ${CODEX_ID_PATTERN.source}`);
  return id;
}

/** `<kind>-<n>` for a record with an integer primary key `n` (n >= 0, safe integer). Throws if the result is not a valid id. */
export function codexIdForInt(kind: string, n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`integer primary key expected for ${kind}, got ${JSON.stringify(n)}`);
  return assertCodexId(`${kind}-${n}`);
}
