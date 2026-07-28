#!/usr/bin/env node
// graphrefly-react dashboard generator (lightweight, self-contained).
// plan/slices.jsonl (single source of truth) + repo scan -> consistency check
// -> dashboard/dashboard.html (the 监工 / oversight page).
//
//   node dashboard/build.mjs          writes dashboard/dashboard.html
//   node dashboard/build.mjs --check  report only; non-zero exit on broken state
//
// Sized for a young repo: one file, inline CSS, no separate css/js. When this
// grows, graduate to the data/presentation split that ~/src/graphrefly uses.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

const esc = (x) =>
	String(x).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

function loadJsonl(rel) {
	const p = join(ROOT, rel);
	if (!existsSync(p)) return [];
	return readFileSync(p, "utf8")
		.split("\n")
		.filter((l) => l.trim())
		.map((l, i) => {
			try {
				return JSON.parse(l);
			} catch (e) {
				throw new Error(`${rel}:${i + 1} invalid JSON: ${e.message}`);
			}
		});
}

const slices = loadJsonl("plan/slices.jsonl");

// ---- repo scan ----
const srcDir = join(ROOT, "src");
const srcFiles = existsSync(srcDir)
	? readdirSync(srcDir).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
	: [];
let scannedTests = 0;
for (const f of srcFiles.filter((f) => f.includes(".test."))) {
	scannedTests += (readFileSync(join(srcDir, f), "utf8").match(/\bit\(/g) ?? []).length;
}

// ---- consistency checks ----
const broken = [];
const warnings = [];
for (const s of slices) {
	if (s.status === "done") {
		if (!s.file) broken.push(`slice ${s.id} is done but declares no file`);
		else if (!existsSync(join(ROOT, s.file)))
			broken.push(`slice ${s.id} done but file missing: ${s.file}`);
		if (!s.test || s.test <= 0) warnings.push(`slice ${s.id} done but declares no tests`);
	}
}
const claimedTests = slices.reduce((n, s) => n + (s.test ?? 0), 0);
if (claimedTests !== scannedTests)
	warnings.push(`slice test counts sum to ${claimedTests} but repo has ${scannedTests} it() blocks`);

// ---- model / gaps ----
const done = slices.filter((s) => s.status === "done");
const pending = slices.filter((s) => s.status !== "done");
const gaps = {
	parked: slices.filter((s) => s.status === "parked" || s.when === "post-1.0").map((s) => s.id),
	design: slices.filter((s) => s.status === "design").map((s) => s.id),
	now: slices.filter((s) => s.when === "now" && s.status !== "done").map((s) => s.id),
};

// ---- report ----
console.log("=== graphrefly-react dashboard ===");
console.log(
	`slices: ${done.length}/${slices.length} done · tests: ${scannedTests} it() · src files: ${srcFiles.length}`,
);
console.log(`gaps: parked=${gaps.parked.length} design=${gaps.design.length} now-open=${gaps.now.length}`);
if (broken.length) console.error(`BROKEN:\n  ${broken.join("\n  ")}`);
if (warnings.length) console.warn(`warnings:\n  ${warnings.join("\n  ")}`);

if (checkOnly) process.exit(broken.length ? 1 : 0);

// ---- emit self-contained html ----
const builtAt = new Date().toISOString();
const pct = slices.length ? Math.round((done.length / slices.length) * 100) : 0;
const gateOk = broken.length === 0;
const chip = (s) => `<span class="chip ${s}">${s}</span>`;

const rows = slices
	.map(
		(s) => `      <tr class="r-${s.status}">
        <td class="id">${s.id}</td>
        <td>${esc(s.title)}</td>
        <td>${chip(s.status)}</td>
        <td>${esc(s.kind ?? "")}</td>
        <td class="num">${s.test ?? "—"}</td>
        <td>${esc(s.when ?? "")}</td>
        <td class="file">${s.file ? esc(s.file) : "—"}</td>
        <td class="note">${esc(s.note ?? "")}</td>
      </tr>`,
	)
	.join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>graphrefly-react · 监工</title>
<style>
:root{--bg:#0f1115;--card:#171a21;--fg:#e6e9ef;--mut:#8b93a3;--done:#3fb950;--todo:#d29922;--design:#a371f7;--parked:#6e7681;--bad:#f85149;--line:#262b36}
*{box-sizing:border-box}body{margin:0 auto;max-width:1120px;padding:32px;font:14px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--fg)}
h1{font-size:20px;margin:0 0 4px}.sub{color:var(--mut);margin:0 0 8px}
.gate{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:600;font-size:12px;vertical-align:middle}
.gate.pass{background:rgba(63,185,80,.15);color:var(--done)}.gate.fail{background:rgba(248,81,73,.15);color:var(--bad)}
.cards{display:flex;gap:16px;margin:20px 0 8px;flex-wrap:wrap}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 20px;flex:1;min-width:170px}
.card .big{font-size:28px;font-weight:700}.card .lbl{color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.bar{height:10px;background:var(--line);border-radius:999px;overflow:hidden;margin-top:10px}.bar>i{display:block;height:100%;background:var(--done)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:8px 0 8px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
tr:last-child td{border-bottom:0}td.id{font-family:ui-monospace,monospace;color:var(--mut)}td.num{text-align:right}
td.file,td.note{color:var(--mut);font-size:13px}tr.r-done td.id{color:var(--done)}
.chip{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase}
.chip.done{background:rgba(63,185,80,.15);color:var(--done)}.chip.todo{background:rgba(210,153,34,.15);color:var(--todo)}
.chip.design{background:rgba(163,113,247,.15);color:var(--design)}.chip.parked{background:rgba(110,118,129,.2);color:var(--parked)}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin:26px 0 8px}
ul{margin:0;padding-left:18px}li{margin:2px 0}.files{columns:2;font-family:ui-monospace,monospace;font-size:13px;color:var(--mut)}
.broken{color:var(--bad)}.warn{color:var(--todo)}
footer{color:var(--mut);font-size:12px;margin-top:30px;border-top:1px solid var(--line);padding-top:12px}
code{font-family:ui-monospace,monospace;color:var(--fg)}
</style>
</head>
<body>
  <h1>graphrefly-react · 监工 <span class="gate ${gateOk ? "pass" : "fail"}">${gateOk ? "gate pass" : "gate fail"}</span></h1>
  <p class="sub">@graphrefly/react — binding + presentation SDK · validated binding-core spike (parked until graphrefly 1.0)</p>
  <div class="cards">
    <div class="card"><div class="lbl">slices done</div><div class="big">${done.length}/${slices.length}</div><div class="bar"><i style="width:${pct}%"></i></div></div>
    <div class="card"><div class="lbl">tests (it blocks)</div><div class="big">${scannedTests}</div></div>
    <div class="card"><div class="lbl">src files</div><div class="big">${srcFiles.length}</div></div>
    <div class="card"><div class="lbl">parked → post-1.0</div><div class="big">${gaps.parked.length}</div></div>
  </div>
  <h2>slices</h2>
  <table>
    <thead><tr><th>id</th><th>slice</th><th>status</th><th>kind</th><th>tests</th><th>when</th><th>file</th><th>note</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  ${broken.length ? `<h2 class="broken">broken (${broken.length})</h2><ul class="broken">${broken.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
  ${warnings.length ? `<h2 class="warn">warnings (${warnings.length})</h2><ul class="warn">${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
  <h2>next — parked until graphrefly 1.0</h2>
  <ul>${pending.map((s) => `<li>${s.id} — ${esc(s.title)} ${chip(s.status)}</li>`).join("")}</ul>
  <h2>src</h2>
  <ul class="files">${srcFiles.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
  <footer>single source <code>plan/slices.jsonl</code> · regenerate <code>pnpm dashboard</code> · gate <code>pnpm dashboard:check</code> · built ${builtAt}</footer>
</body>
</html>`;

writeFileSync(join(ROOT, "dashboard", "dashboard.html"), html);
console.log("wrote dashboard/dashboard.html");
