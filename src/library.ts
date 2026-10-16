// The loaded content snapshot: manifest + entries, validated with the Codex checks.
// Read-only. The app keeps user changes in a separate layer.
// The package does not know where the files are: the app reads its content/ (fs, fetch, Vite import.meta.glob) and passes the raw JSON in.
import type { Entry, Manifest, Resource } from "./codex.js";
import { validateSnapshot, type Issue, type ValidateOptions } from "./validate.js";

export class SnapshotError extends Error {
  constructor(readonly issues: Issue[]) { super(`Invalid content snapshot: ${issues.length} issue(s), first: ${issues[0]?.path} ${issues[0]?.code}`); }
}

export class Library {
  private index: Map<string, Entry>;
  constructor(readonly manifest: Manifest, readonly entries: Entry[]) { this.index = new Map(entries.map((e) => [e.id, e])); }
  get(id: string) { return this.index.get(id); }
  byKind(kind: string) { return this.entries.filter((e) => e.kind === kind); }
  resource(kind: string): Resource | undefined { return this.manifest.resources.find((r) => r.record.id === kind); }
  /** option values of a select field, in manifest order */
  options(kind: string, field: string): string[] { return this.resource(kind)?.record.fields?.find((f) => f.id === field)?.options?.map((o) => o.value) ?? []; }
}

export function loadLibrary(manifest: unknown, files: { file: string; data: unknown }[], options?: ValidateOptions): Library {
  const issues = validateSnapshot(manifest, files, options);
  if (issues.length) throw new SnapshotError(issues);
  const entries = files.map((f) => f.data as Entry).sort((a, b) => (a.id < b.id ? -1 : 1));
  return new Library(manifest as Manifest, entries);
}

/**
 * The snapshot of an app, or the error that explains why it is invalid (shown by the app instead of a blank page).
 * `files` are the raw entry files: `{ file: "content/entries/<id>.json", data }`.
 */
export function loadOrError(manifest: unknown, files: { file: string; data: unknown }[], options?: ValidateOptions): Library | SnapshotError {
  try { return loadLibrary(manifest, files, options); }
  catch (e) { return e instanceof SnapshotError ? e : new SnapshotError([{ code: "load.failed", path: "content", message: String(e) }]); }
}
