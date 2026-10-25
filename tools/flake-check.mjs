// Runs a set of browser tests N times under the same load as a real run and prints a pass-rate table.
//   node tools/flake-check.mjs 5 art-hits shell gundeck [--jobs 4]
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const [n, ...rest] = process.argv.slice(2);
const rounds = parseInt(n, 10);
if (!rounds || !rest.length) { console.error("usage: node tools/flake-check.mjs ROUNDS name [name ...] [--jobs N]"); process.exit(2); }
const pass = {}, secs = {};
rmSync(root + ".review/flake", { recursive: true, force: true });
for (let i = 1; i <= rounds; i++) {
  const r = spawnSync(process.execPath, ["tools/run-tests.mjs", ...rest, "--no-retry"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
  for (const m of r.stdout.matchAll(/^(通過|失敗)  (\S+)\s+([\d.]+)s/gm)) {
    (pass[m[2]] ??= []).push(m[1] === "通過"); (secs[m[2]] ??= []).push(+m[3]);
  }
  // failure output of this round, so the reason is not lost
  mkdirSync(root + ".review/flake", { recursive: true });
  writeFileSync(`${root}.review/flake/round${i}.log`, r.stdout);
  console.log(`round ${i}/${rounds}: ${Object.entries(pass).map(([k, v]) => `${k}=${v[v.length - 1] ? "ok" : "FAIL"}`).join(" ")}`);
}
console.log("\n測試              通過/次數   平均耗時");
for (const [k, v] of Object.entries(pass)) console.log(`${k.padEnd(16)} ${v.filter(Boolean).length}/${v.length}      ${(secs[k].reduce((a, b) => a + b, 0) / v.length).toFixed(1)}s`);
