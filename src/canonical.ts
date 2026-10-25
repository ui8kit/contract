// Canonical form and digest of a Codex v0.4 entry, profile codex-entry/v1 (draft v0.4, see docs/canonical.md).
// Input is the raw JSON TEXT: the own strict parser rejects duplicate keys and integer literals outside the
// safe range before JSON.parse could lose them. Output is RFC 8785 (JCS) of the public projection.
// No runtime dependencies (own SHA-256 and UTF-8), so it runs in Node, Bun, Deno and browsers.
import { KEYS_V04 } from "./validate-v04.js";
import { REQUIRED_V04 } from "./v04.js";
import { CODEX_ID_PATTERN, isCodexId } from "./id.js";

export const CANONICAL_ENTRY_PROFILE = "codex-entry/v1";

export const CANONICAL_ERROR_CODES = [
  "canonical.invalid_json",
  "canonical.duplicate_key",
  "canonical.unsafe_integer",
  "canonical.invalid_number",
  "canonical.invalid_string",
  "canonical.invalid_type",
  "canonical.unknown_field",
  "canonical.missing_field",
  "canonical.invalid_id",
  "canonical.invalid_date",
  "canonical.fractional_seconds",
] as const;
export type CanonicalErrorCode = (typeof CANONICAL_ERROR_CODES)[number];

export class CanonicalError extends Error {
  readonly code: CanonicalErrorCode;
  /** JSON path of the offending value ("$" = document root), or the text offset for parse errors. */
  readonly path: string;
  constructor(code: CanonicalErrorCode, path: string, message: string) {
    super(`${code}: ${message} (at ${path})`);
    this.name = "CanonicalError";
    this.code = code;
    this.path = path;
  }
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };
const isObj = (v: Json | undefined): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

// ---------- strict JSON parser (RFC 8259) ----------

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function parse(text: string): Json {
  let i = 0;
  const fail = (code: CanonicalErrorCode, msg: string, at = i): never => { throw new CanonicalError(code, `@${at}`, msg); };
  const ws = () => { for (let c = text.charCodeAt(i); c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d; c = text.charCodeAt(++i)); };
  const lit = (word: string, v: Json): Json => { if (text.startsWith(word, i)) { i += word.length; return v; } return fail("canonical.invalid_json", "unexpected token"); };

  const str = (): string => {
    const start = i++;
    let out = "";
    for (;;) {
      if (i >= text.length) fail("canonical.invalid_json", "unterminated string", start);
      const c = text.charCodeAt(i);
      if (c === 0x22) { i++; break; }
      if (c < 0x20) fail("canonical.invalid_json", "raw control character in string");
      if (c !== 0x5c) { out += text[i++]; continue; }
      const e = text[i + 1];
      i += 2;
      switch (e) {
        case '"': out += '"'; break;
        case "\\": out += "\\"; break;
        case "/": out += "/"; break;
        case "b": out += "\b"; break;
        case "f": out += "\f"; break;
        case "n": out += "\n"; break;
        case "r": out += "\r"; break;
        case "t": out += "\t"; break;
        case "u": {
          const h = text.slice(i, i + 4);
          if (!/^[0-9A-Fa-f]{4}$/.test(h)) fail("canonical.invalid_json", "bad \\u escape");
          out += String.fromCharCode(parseInt(h, 16));
          i += 4;
          break;
        }
        default: fail("canonical.invalid_json", "bad escape", i - 2);
      }
    }
    // Lone surrogates have no UTF-8 form: reject them instead of hashing replacement characters.
    for (let k = 0; k < out.length; k++) {
      const c = out.charCodeAt(k);
      if (c >= 0xd800 && c <= 0xdbff) { const d = out.charCodeAt(k + 1); if (d >= 0xdc00 && d <= 0xdfff) { k++; continue; } }
      if (c >= 0xd800 && c <= 0xdfff) fail("canonical.invalid_string", "lone surrogate in string", start);
    }
    return out;
  };

  const num = (): number => {
    const m = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(text.slice(i));
    if (!m) return fail("canonical.invalid_json", "bad number");
    const tok = m[0];
    const at = i;
    i += tok.length;
    // Integer literal (no fraction, no exponent): checked exactly, before conversion to a double.
    if (m[2] === undefined && m[3] === undefined) {
      const b = BigInt(tok);
      if (b > MAX_SAFE || b < -MAX_SAFE) fail("canonical.unsafe_integer", `integer ${tok} is outside ±(2^53-1)`, at);
    }
    const n = Number(tok);
    if (!Number.isFinite(n)) fail("canonical.invalid_number", `number ${tok} is not finite`, at);
    // A fraction/exponent literal that is an integer above 2^53-1 (e.g. 9007199254740993.0) is also rejected.
    if (Number.isInteger(n) && Math.abs(n) > Number.MAX_SAFE_INTEGER && !/[eE]/.test(tok)) fail("canonical.unsafe_integer", `integer ${tok} is outside ±(2^53-1)`, at);
    return n;
  };

  const value = (depth: number): Json => {
    if (depth > 512) fail("canonical.invalid_json", "nesting too deep");
    ws();
    const c = text[i];
    if (c === "{") {
      i++;
      const o: Obj = Object.create(null);
      ws();
      if (text[i] === "}") { i++; return o; }
      for (;;) {
        ws();
        if (text[i] !== '"') fail("canonical.invalid_json", "expected a key");
        const kAt = i;
        const k = str();
        if (own(o, k)) fail("canonical.duplicate_key", `duplicate key ${JSON.stringify(k)}`, kAt);
        ws();
        if (text[i] !== ":") fail("canonical.invalid_json", "expected ':'");
        i++;
        o[k] = value(depth + 1);
        ws();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "}") { i++; return o; }
        fail("canonical.invalid_json", "expected ',' or '}'");
      }
    }
    if (c === "[") {
      i++;
      const a: Json[] = [];
      ws();
      if (text[i] === "]") { i++; return a; }
      for (;;) {
        a.push(value(depth + 1));
        ws();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "]") { i++; return a; }
        fail("canonical.invalid_json", "expected ',' or ']'");
      }
    }
    if (c === '"') return str();
    if (c === "t") return lit("true", true);
    if (c === "f") return lit("false", false);
    if (c === "n") return lit("null", null);
    if (c === "-" || (c !== undefined && c >= "0" && c <= "9")) return num();
    return fail("canonical.invalid_json", c === undefined ? "unexpected end of input" : "unexpected token");
  };

  const v = value(0);
  ws();
  if (i !== text.length) fail("canonical.invalid_json", "trailing data after the JSON value");
  return v;
}

// ---------- RFC 8785 (JCS) serializer ----------

const ESC: Record<number, string> = { 0x08: "\\b", 0x09: "\\t", 0x0a: "\\n", 0x0c: "\\f", 0x0d: "\\r", 0x22: '\\"', 0x5c: "\\\\" };
function jcsString(s: string): string {
  let out = '"';
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    const e = ESC[c];
    if (e) out += e;
    else if (c < 0x20) out += "\\u" + c.toString(16).padStart(4, "0");
    else out += s[k];
  }
  return out + '"';
}
/** Keys are compared as UTF-16 code unit sequences, which is what the default JS string comparison does. */
const byUtf16 = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function jcs(v: Json): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  // ECMAScript Number::toString; -0 prints as "0".
  if (typeof v === "number") return Object.is(v, -0) ? "0" : String(v);
  if (typeof v === "string") return jcsString(v);
  if (Array.isArray(v)) return "[" + v.map(jcs).join(",") + "]";
  return "{" + Object.keys(v).sort(byUtf16).map((k) => jcsString(k) + ":" + jcs(v[k])).join(",") + "}";
}

// ---------- codex-entry/v1 projection ----------

const DATE_FIELDS = new Set(["created_at", "updated_at", "published_at", "deleted_at"]);
const ENTRY_KEYS: readonly string[] = KEYS_V04.entry;
const REQUIRED: readonly string[] = REQUIRED_V04.entry;
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|([+-])(\d{2}):(\d{2}))$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
function normalizeDate(v: Json, path: string): string {
  if (typeof v !== "string") throw new CanonicalError("canonical.invalid_date", path, "date-time must be a string");
  if (DATE_ONLY.test(v)) throw new CanonicalError("canonical.invalid_date", path, `date without time: ${v}`);
  const m = RFC3339.exec(v);
  if (!m) throw new CanonicalError("canonical.invalid_date", path, `not an RFC 3339 date-time: ${v}`);
  if (m[7] !== undefined && /[1-9]/.test(m[7])) throw new CanonicalError("canonical.fractional_seconds", path, `fractional seconds are not allowed: ${v}`);
  const [Y, M, D, h, mi, s] = [1, 2, 3, 4, 5, 6].map((k) => Number(m[k]));
  const oh = m[10] !== undefined ? Number(m[10]) : 0, om = m[11] !== undefined ? Number(m[11]) : 0;
  const dim = new Date(Date.UTC(2000, M, 0)).getUTCDate(); // days in month M (leap year 2000 gives 29 for Feb)
  const leap = (Y % 4 === 0 && Y % 100 !== 0) || Y % 400 === 0;
  if (M < 1 || M > 12 || D < 1 || D > (M === 2 && !leap ? 28 : dim) || h > 23 || mi > 59 || s > 59 || oh > 23 || om > 59)
    throw new CanonicalError("canonical.invalid_date", path, `date-time out of range: ${v}`);
  const d = new Date(0);
  d.setUTCFullYear(Y, M - 1, D);
  d.setUTCHours(h, mi, s, 0);
  const off = (oh * 60 + om) * 60000;
  const t = d.getTime() + (m[9] === "+" ? -off : m[9] === "-" ? off : 0);
  const u = new Date(t);
  const y = u.getUTCFullYear();
  if (y < 0 || y > 9999) throw new CanonicalError("canonical.invalid_date", path, `year out of range after UTC conversion: ${v}`);
  return `${pad(y, 4)}-${pad(u.getUTCMonth() + 1)}-${pad(u.getUTCDate())}T${pad(u.getUTCHours())}:${pad(u.getUTCMinutes())}:${pad(u.getUTCSeconds())}Z`;
}

const isEmpty = (v: Json) => v === null || v === "" || (Array.isArray(v) && v.length === 0) || (isObj(v) && Object.keys(v).length === 0);
const closed = (o: Obj, keys: readonly string[], path: string) => {
  for (const k of Object.keys(o)) if (!keys.includes(k)) throw new CanonicalError("canonical.unknown_field", `${path}.${k}`, `unknown field ${JSON.stringify(k)}`);
};
/** Code point order (not UTF-16): iterate by code points. */
function byCodePoint(a: string, b: string): number {
  const x = Array.from(a, (c) => c.codePointAt(0)!), y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let k = 0; k < Math.min(x.length, y.length); k++) if (x[k] !== y[k]) return x[k] - y[k];
  return x.length - y.length;
}

function project(doc: Json): Obj {
  if (!isObj(doc)) throw new CanonicalError("canonical.invalid_type", "$", "entry must be a JSON object");
  closed(doc, ENTRY_KEYS, "$");
  for (const k of REQUIRED) if (!own(doc, k) || doc[k] === null) throw new CanonicalError("canonical.missing_field", `$.${k}`, `required field ${k} is missing`);
  if (!isCodexId(doc.id)) throw new CanonicalError("canonical.invalid_id", "$.id", `id must match ${CODEX_ID_PATTERN.source}`);

  const out: Obj = Object.create(null);
  for (const k of Object.keys(doc)) {
    let v = doc[k];
    const required = REQUIRED.includes(k);
    if (!required && isEmpty(v)) continue;
    const path = `$.${k}`;
    if (DATE_FIELDS.has(k)) v = normalizeDate(v, path);
    else if (k === "metadata") {
      if (!isObj(v)) throw new CanonicalError("canonical.invalid_type", path, "metadata must be an object");
      const md: Obj = Object.create(null);
      for (const mk of Object.keys(v)) {
        const mv = v[mk];
        if (!isObj(mv) || !own(mv, "value")) throw new CanonicalError("canonical.invalid_type", `${path}.${mk}`, "metadata item must be {value, private?}");
        closed(mv, KEYS_V04.metadata, `${path}.${mk}`);
        if (own(mv, "private") && typeof mv.private !== "boolean") throw new CanonicalError("canonical.invalid_type", `${path}.${mk}.private`, "private must be boolean");
        if (mv.private === true) continue; // not part of the public projection
        md[mk] = { value: mv.value } as Obj; // value is kept as is ("", null, [], {} included); private:false is dropped
      }
      if (Object.keys(md).length === 0) continue;
      v = md;
    } else if (k === "terms") {
      if (!Array.isArray(v)) throw new CanonicalError("canonical.invalid_type", path, "terms must be an array");
      v.forEach((t, n) => {
        if (!isObj(t) || typeof t.taxonomy !== "string" || typeof t.term_id !== "string") throw new CanonicalError("canonical.invalid_type", `${path}[${n}]`, "term must be {taxonomy, term_id} strings");
        closed(t, KEYS_V04.termRef, `${path}[${n}]`);
      });
      v = [...(v as Obj[])].sort((a, b) => byCodePoint(a.taxonomy as string, b.taxonomy as string) || byCodePoint(a.term_id as string, b.term_id as string));
    } else if (k === "origin") {
      if (!Array.isArray(v)) throw new CanonicalError("canonical.invalid_type", path, "origin must be an array");
      v.forEach((o, n) => { if (!isObj(o)) throw new CanonicalError("canonical.invalid_type", `${path}[${n}]`, "origin item must be {system, id}"); closed(o, KEYS_V04.origin, `${path}[${n}]`); });
    } else if (k === "discussion" && isObj(v)) closed(v, KEYS_V04.discussion, path);
    out[k] = v;
  }
  return out;
}

/** Canonical text (codex-entry/v1) of one Codex v0.4 entry given as JSON text. Throws CanonicalError. */
export function canonicalize(inputText: string): string {
  return jcs(project(parse(inputText)));
}

/** `codex-entry/v1:sha256:<hex>` of the UTF-8 bytes of canonicalize(inputText). Throws CanonicalError. */
export function digest(inputText: string): string {
  return `${CANONICAL_ENTRY_PROFILE}:sha256:${sha256Hex(utf8(canonicalize(inputText)))}`;
}

// ---------- codex-manifest/v2 (full manifest, same profile rules as codex-entry/v1) ----------

export const CANONICAL_MANIFEST_PROFILE = "codex-manifest/v2";

/** Key sets of schemas/manifest.schema.json (test/canonical-manifest.test.ts keeps them in sync with the schema). */
export const MANIFEST_SHAPE = {
  manifest: { keys: ["name", "version", "resources"], required: ["name", "version", "resources"] },
  resource: { keys: ["record", "taxonomies"], required: ["record"] },
  record: { keys: ["id", "label", "description", "schema_version", "owner_module", "scope", "fields", "relations", "capabilities", "visibility"], required: ["id", "label", "scope"] },
  field: {
    keys: ["id", "label", "type", "namespace", "owner_module", "description", "required", "localized", "default_value", "options", "rules", "items", "fields", "searchable", "indexed", "unique", "sensitive", "encrypted", "ui_hint", "storage_hint"],
    required: ["id", "label", "type"],
  },
  option: { keys: ["value", "label"], required: ["value", "label"] },
  rule: { keys: ["name", "message", "args", "severity"], required: ["name"] },
  relation: { keys: ["id", "label", "source", "target", "cardinality", "inverse_name", "cross_workspace_policy", "policy", "delete_behavior"], required: ["id", "source", "target", "cardinality"] },
  policy: { keys: ["cross_workspace_mode", "allowed_targets", "capability", "read_only"], required: [] },
} as const satisfies Record<string, { keys: readonly string[]; required: readonly string[] }>;
type Shape = keyof typeof MANIFEST_SHAPE;

function shapeObj(v: Json | undefined, shape: Shape, path: string): Obj {
  if (!isObj(v)) throw new CanonicalError("canonical.invalid_type", path, `${shape} must be a JSON object`);
  const { keys, required } = MANIFEST_SHAPE[shape];
  closed(v, keys, path);
  for (const k of required) if (!own(v, k) || v[k] === null) throw new CanonicalError("canonical.missing_field", `${path}.${k}`, `required field ${k} is missing`);
  return v;
}
function shapeArr(v: Json, path: string, each?: (x: Json, p: string) => void): void {
  if (!Array.isArray(v)) throw new CanonicalError("canonical.invalid_type", path, "must be an array");
  if (each) v.forEach((x, n) => each(x, `${path}[${n}]`));
}
function checkField(f: Json, path: string): void {
  const o = shapeObj(f, "field", path);
  if (own(o, "options")) shapeArr(o.options, `${path}.options`, (x, p) => void shapeObj(x, "option", p));
  if (own(o, "rules")) shapeArr(o.rules, `${path}.rules`, (x, p) => { const r = shapeObj(x, "rule", p); if (own(r, "args") && !isObj(r.args)) throw new CanonicalError("canonical.invalid_type", `${p}.args`, "args must be an object"); });
  if (own(o, "items")) checkField(o.items, `${path}.items`);
  if (own(o, "fields")) shapeArr(o.fields, `${path}.fields`, checkField);
}

/**
 * Canonical() of a manifest for codex-manifest/v2: the FULL manifest (every field of schemas/manifest.schema.json),
 * with the codex-entry/v1 rules: strict parse (duplicate keys, unsafe integers, lone surrogates), closed key sets,
 * required fields, empty optional fields dropped only at the top level (the manifest has none), nested values kept
 * as is, array order kept (no array of the manifest is sorted), RFC 8785 output. Types are the validator's job.
 */
function projectManifest(doc: Json): Obj {
  const m = shapeObj(doc, "manifest", "$");
  shapeArr(m.resources, "$.resources", (x, p) => {
    const r = shapeObj(x, "resource", p);
    if (own(r, "taxonomies")) shapeArr(r.taxonomies, `${p}.taxonomies`);
    const rec = shapeObj(r.record, "record", `${p}.record`);
    if (own(rec, "fields")) shapeArr(rec.fields, `${p}.record.fields`, checkField);
    if (own(rec, "capabilities")) shapeArr(rec.capabilities, `${p}.record.capabilities`);
    if (own(rec, "relations")) shapeArr(rec.relations, `${p}.record.relations`, (y, q) => {
      const rel = shapeObj(y, "relation", q);
      if (own(rel, "policy")) { const pol = shapeObj(rel.policy, "policy", `${q}.policy`); if (own(pol, "allowed_targets")) shapeArr(pol.allowed_targets, `${q}.policy.allowed_targets`); }
    });
  });
  const required: readonly string[] = MANIFEST_SHAPE.manifest.required;
  const out: Obj = Object.create(null);
  for (const k of Object.keys(m)) if (required.includes(k) || !isEmpty(m[k])) out[k] = m[k];
  return out;
}

/** Turns an in-memory value into JSON text, rejecting what JSON.stringify would silently change (NaN, Infinity). */
function toText(v: unknown): string {
  return JSON.stringify(v, (_k, x) => {
    if (typeof x === "number" && !Number.isFinite(x)) throw new CanonicalError("canonical.invalid_number", "$", `number ${x} is not finite`);
    if (typeof x === "bigint") throw new CanonicalError("canonical.unsafe_integer", "$", "bigint is not a JSON number");
    return x;
  });
}

/** Canonical text (codex-manifest/v2) of a full manifest, given as JSON text (preferred: exact integer check) or as a value. */
export function canonicalizeManifest(manifest: string | object): string {
  return jcs(projectManifest(parse(typeof manifest === "string" ? manifest : toText(manifest))));
}

/** `codex-manifest/v2:sha256:<hex>` of the UTF-8 bytes of canonicalizeManifest(manifest). Throws CanonicalError. */
export function manifestDigest(manifest: string | object): string {
  return `${CANONICAL_MANIFEST_PROFILE}:sha256:${sha256Hex(utf8(canonicalizeManifest(manifest)))}`;
}

// ---------- UTF-8 + SHA-256 (FIPS 180-4), dependency-free ----------

function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

const K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** Hex SHA-256 of bytes (used by digest and manifestDigest; exported for tests). */
export function sha256Hex(bytes: Uint8Array): string {
  const len = bytes.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor(len / 0x20000000), false);
  view.setUint32(total - 4, (len << 3) >>> 0, false);
  const H = Uint32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let t = 0; t < 16; t++) W[t] = view.getUint32(off + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[t] + W[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, "0")).join("");
}
