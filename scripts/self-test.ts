// Breaks a copy of a valid snapshot (fixtures/snapshot) in 16 ways; every break must be reported.
// 15 of these cases were cross-checked against the Go loader github.com/fastygo/modules/content-json v0.1.0 in
// ui8kit/spline-svelte (apps/cms/docs/FIXTURES.md); "duplicate id" was added there afterwards.
import fs from "node:fs";
import path from "node:path";
import { validateSnapshot } from "../src/validate.ts";

const dir = path.resolve(import.meta.dir, "../fixtures/snapshot");
type Snap = Record<string, any>;
export const CASES: [string, (m: any, e: Snap) => void][] = [
  ["unknown entry field", (m, e) => { e["page-home"].bogus = 1; }],
  ["kind not in manifest", (m, e) => { e["page-home"].kind = "ghost"; }],
  ["parent missing", (m, e) => { e["page-home"].parent_id = "nope"; }],
  ["relation points to a wrong kind", (m, e) => { e["comment-oleg"].metadata.comment_post.value = "page-home"; }],
  ["relation target missing", (m, e) => { e["comment-oleg"].metadata.comment_post.value = "nope"; }],
  ["taxonomy not assigned to the kind", (m, e) => { e["page-home"].terms = [{ taxonomy: "tag", term_id: "term-tag-design" }]; }],
  ["localized field in metadata", (m, e) => { e["media-dish-1-jpg"].metadata.alt = { value: "x" }; }],
  ["select value not in options", (m, e) => { e["user-smarty-cab"].metadata.role.value = "king"; }],
  ["non-integer in an integer field", (m, e) => { e["media-dish-1-jpg"].metadata.size.value = 1.5; }],
  ["required field missing", (m, e) => { delete e["user-smarty-cab"].metadata.email; }],
  ["bad locale key", (m, e) => { e["page-home"].title = { EN: "x" }; }],
  ["updated_at before created_at", (m, e) => { e["page-home"].updated_at = "2000-01-01T00:00:00Z"; }],
  ["scheduled without published_at", (m, e) => { const x = e["page-home"]; x.status = "scheduled"; delete x.published_at; }],
  ["unknown manifest field", (m) => { m.resources[0].record.bogus = 1; }],
  ["chrome field declared not localized", (m) => { m.resources[0].record.fields[0].id = "title"; delete m.resources[0].record.fields[0].localized; }],
  ["duplicate id", (m, e) => { e["page-about"] = { ...e["page-home"] }; }],
];

export const loadSnapshot = () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  const entries: Snap = {};
  for (const f of fs.readdirSync(path.join(dir, "entries")).filter((f) => f.endsWith(".json")).sort())
    entries[f.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(path.join(dir, "entries", f), "utf8"));
  return { manifest, entries };
};
export const run = (m: unknown, e: Snap, extra = false) =>
  validateSnapshot(m, Object.entries(e).map(([id, data]) => ({ file: `entries/${id}.json`, data })), { extra });

if (import.meta.main) {
  let bad = 0;
  const s0 = loadSnapshot();
  for (const extra of [false, true]) {
    const base = run(s0.manifest, s0.entries, extra);
    console.log(`${base.length ? "FAIL" : "PASS"} untouched snapshot has no issues (extra=${extra}, ${base.length})`); if (base.length) bad++;
  }
  for (const [name, mutate] of CASES) {
    const { manifest, entries } = loadSnapshot();
    mutate(manifest, entries);
    const found = run(manifest, entries).filter((i) => !i.code.startsWith("extra."));
    console.log(`${found.length ? "PASS" : "FAIL"} ${name}${found[0] ? `  -> ${found[0].code}` : ""}`); if (!found.length) bad++;
  }
  process.exit(bad ? 1 : 0);
}
