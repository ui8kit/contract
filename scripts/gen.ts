// Writes schemas/*.schema.json and the static schema site in public/ (served by Vercel as-is).
// Only the Codex v0.4 core is published, at stable unversioned URLs: https://schema.buildy.tw/<name>.schema.json.
// Versioned URLs start at v0.5.
import fs from "node:fs";
import path from "node:path";
import { ALL_V04 } from "./schemas-v04.ts";
import { SCHEMA_BASE_URL } from "../src/codex.ts";
import { CODEX_V04_VERSION } from "../src/v04.ts";

const root = path.resolve(import.meta.dir, "..");
const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
const write = (p: string, s: string) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

export function render(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, schema] of Object.entries(ALL_V04)) {
    const body = json(schema);
    out[`schemas/${name}.schema.json`] = body;
    out[`public/${name}.schema.json`] = body;
  }
  const rows = Object.keys(ALL_V04).map((n) => `      <tr><td>${n}</td><td><a href="/${n}.schema.json">${SCHEMA_BASE_URL}/${n}.schema.json</a></td></tr>`).join("\n");
  out["public/index.html"] = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>@ui8kit/contract schemas</title>
  <style>body{font:16px/1.5 system-ui,sans-serif;max-width:52rem;margin:3rem auto;padding:0 1rem}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:.4rem;text-align:left}code{background:#f4f4f4;padding:0 .2rem}</style>
</head>
<body>
  <h1>@ui8kit/contract</h1>
  <p>JSON Schemas (draft 2020-12) of the <a href="https://github.com/fastygo/codex">Codex</a> v${CODEX_V04_VERSION} core (draft). Source: <a href="https://github.com/ui8kit/contract">github.com/ui8kit/contract</a>.</p>
  <table>
    <thead><tr><th>Schema</th><th>URL</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <p>URLs are stable and unversioned while there are no consumers; versioned URLs start at v0.5.</p>
</body>
</html>
`;
  return out;
}

if (import.meta.main) {
  for (const [rel, body] of Object.entries(render())) write(path.join(root, rel), body);
  console.log("gen: schemas/ and public/ written");
}
