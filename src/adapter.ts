// Adapter pattern: one pure function per kind that turns a Codex Entry into an app view model.
// The package ships the mechanism only; apps own their adapters.
import type { Entry } from "./codex.js";
import type { Library } from "./library.js";

export type AdapterContext = { library?: Library; locale?: string };
export type Adapter<K extends string, VM> = {
  readonly kind: K;
  (entry: Entry, ctx?: AdapterContext): VM;
};

export class KindMismatchError extends Error {
  constructor(readonly expected: string, readonly actual: string, readonly id: string) {
    super(`adapter for kind "${expected}" got entry "${id}" of kind "${actual}"`);
  }
}

/** Wraps `fn` so it rejects entries of another kind and carries its `kind`. */
export function defineAdapter<K extends string, VM>(kind: K, fn: (entry: Entry, ctx: AdapterContext) => VM): Adapter<K, VM> {
  const adapter = ((entry: Entry, ctx: AdapterContext = {}) => {
    if (entry.kind !== kind) throw new KindMismatchError(kind, entry.kind, entry.id);
    return fn(entry, ctx);
  }) as Adapter<K, VM>;
  Object.defineProperty(adapter, "kind", { value: kind, enumerable: true });
  return adapter;
}

/** Applies `adapter` to every entry of its kind in the library. */
export function adaptAll<K extends string, VM>(library: Library, adapter: Adapter<K, VM>, ctx: Omit<AdapterContext, "library"> = {}): VM[] {
  return library.byKind(adapter.kind).map((e) => adapter(e, { ...ctx, library }));
}
