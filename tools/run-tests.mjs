// Test runner: finds the tests by file name, so a new test only needs a file in tests/ (no package.json edit).
//
//   node tools/run-tests.mjs [group] [--jobs N] [--no-retry] [--base REF] [--list] [name ...]
//
// groups   unit    node --test tests/unit*.mjs
//          smoke   tests/smoke.mjs and tests/gunart.mjs (browser, quick)
//          browser every other browser test in tests/ (see EXCLUDED)
//          quick   unit + smoke + the browser tests that match `git diff REF --name-only` (see tools/test-map.mjs)
//          all     unit + smoke + browser (default)
//          ci      unit + smoke (what `npm test` runs)
// name     run just these browser tests, e.g. `node tools/run-tests.mjs gundeck heat`
//
// File naming convention (nothing to register):
//   tests/unit*.mjs          unit tests, run by `node --test`
//   tests/<name>.mjs         browser test; takes the page URL as argv[2], exits non-zero on failure
//   tests/<name>-perf.mjs    benchmarks and screenshot tools: not run by default (run them by hand or by name)
//
// --jobs N runs N browser tests at once. Every worker owns a static server on its own port and passes
// that URL to the test; the servers are closed when the run ends. A failed test is re-run once, alone;
// passing the second time is reported as flaky ("重跑後通過") and does not fail the run.
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createReadStream, readdirSync, statSync } from "node:fs";
import { cpus } from "node:os";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { browserTestsFor } from "./test-map.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TESTS = join(ROOT, "tests");
const SMOKE = ["smoke", "gunart"];
// Not run by default: perf benchmarks and screenshot / page dump tools. Everything else in tests/ is a browser test.
const EXCLUDED = [/^unit/, /-perf$/, /^art-(perf|shots|page)$/];
// Roughly the slowest browser tests, slowest last (measured: scale-extremes 270s, phase1b 250s, ports 115s ...). Only an ordering hint.
const SLOW = ["feedback", "campaign", "ports", "phase1b", "scale-extremes"];
const TIMEOUT_MS = 8 * 60 * 1000;

export function discover() {
  const all = readdirSync(TESTS).filter(f => f.endsWith(".mjs")).map(f => f.slice(0, -4)).sort();
  const unit = all.filter(n => /^unit/.test(n));
  const browser = all.filter(n => !EXCLUDED.some(re => re.test(n)) && !SMOKE.includes(n));
  return { all, unit, browser };
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".md": "text/plain; charset=utf-8", ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".ogg": "audio/ogg" };
// Static server for the repo root on a free port. Returns { url, close }.
function serve() {
  const server = createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const file = normalize(join(ROOT, p));
    let st;
    try { st = statSync(file); } catch { st = null; }
    if (!file.startsWith(ROOT) || !st || !st.isFile()) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-store", "content-length": st.size });
    if (req.method === "HEAD") res.end(); else createReadStream(file).pipe(res);
  });
  // Not port 0: the OS can hand out a port Chrome refuses to open (ERR_UNSAFE_PORT: 6665-6669, 6000, 4045 ... all below 10080).
  // So pick from 20000-59999 and try the next on EADDRINUSE.
  const close = () => new Promise(r => { server.closeAllConnections?.(); server.close(r); });
  return new Promise((ok, fail) => {
    let tries = 0;
    const attempt = () => {
      const port = 20000 + Math.floor(Math.random() * 40000);
      server.once("error", e => (e.code === "EADDRINUSE" && ++tries < 50 ? attempt() : fail(e)));
      server.listen({ port, host: "127.0.0.1", backlog: 511 }, () => { server.removeAllListeners("error"); ok({ url: `http://127.0.0.1:${port}/index.html`, close }); });
    };
    attempt();
  });
}

function run(args, label) {
  const t0 = Date.now();
  return new Promise(done => {
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const add = d => { out += d; };
    child.stdout.on("data", add); child.stderr.on("data", add);
    const timer = setTimeout(() => { out += `\n[run-tests] ${label} killed after ${TIMEOUT_MS / 1000}s\n`; child.kill("SIGKILL"); }, TIMEOUT_MS);
    child.on("close", code => { clearTimeout(timer); done({ ok: code === 0, secs: (Date.now() - t0) / 1000, out }); });
  });
}

const fmt = s => `${s.toFixed(1)}s`;
const tail = (out, n = 40) => out.trimEnd().split("\n").slice(-n).join("\n");

function changedFiles(base) {
  const git = args => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).split("\n").map(s => s.trim()).filter(Boolean);
  let files = [];
  try { files = git(["diff", base, "--name-only"]); } catch { try { files = git(["diff", "HEAD~1", "--name-only"]); } catch { return null; } }
  try { files = files.concat(git(["ls-files", "-o", "--exclude-standard"])); } catch { /* not fatal */ }
  return [...new Set(files)];
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = { jobs: Math.min(4, Math.max(1, Math.floor(cpus().length / 2))), retry: true, base: "origin/main", list: false };
  const words = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--jobs") opt.jobs = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (a.startsWith("--jobs=")) opt.jobs = Math.max(1, parseInt(a.slice(7), 10) || 1);
    else if (a === "--no-retry") opt.retry = false;
    else if (a === "--base") opt.base = argv[++i];
    else if (a === "--list") opt.list = true;
    else if (a.startsWith("--")) { console.error(`unknown option ${a}`); process.exit(2); }
    else words.push(a);
  }
  const { all, unit, browser } = discover();
  const groups = ["unit", "smoke", "browser", "quick", "all", "ci"];
  const group = groups.includes(words[0]) ? words.shift() : (words.length ? "names" : "all");
  let doUnit = false, browserTests = [];
  if (group === "unit") doUnit = true;
  else if (group === "smoke") browserTests = SMOKE;
  else if (group === "browser") browserTests = browser;
  else if (group === "ci") { doUnit = true; browserTests = SMOKE; }
  else if (group === "all") { doUnit = true; browserTests = [...SMOKE, ...browser]; }
  else if (group === "quick") {
    doUnit = true;
    const files = changedFiles(opt.base);
    const picked = files ? browserTestsFor(files, { available: all }) : { tests: [], core: true, files: [] };
    browserTests = [...new Set([...SMOKE, ...picked.tests.filter(t => browser.includes(t) || SMOKE.includes(t))])];
    console.log(files ? `quick: ${files.length} changed file(s) vs ${opt.base} -> ${browserTests.join(", ")}${picked.core ? " (includes the core set: some change has no specific mapping)" : ""}`
      : "quick: git diff failed, running the core set");
  } else {
    for (const n of words) if (!all.includes(n)) { console.error(`no tests/${n}.mjs`); process.exit(2); }
    browserTests = words;
  }
  if (opt.list) { console.log([doUnit ? "unit" : "", ...browserTests].filter(Boolean).join("\n")); return; }

  const jobs = Math.min(opt.jobs, Math.max(1, browserTests.length));
  console.log(`run-tests: ${group}${doUnit ? ` (unit: ${unit.length} files)` : ""}, ${browserTests.length} browser test(s), jobs ${jobs}`);
  const t0 = Date.now();
  const results = [];
  const record = (name, r, tag = "") => {
    results.push({ name, ...r, tag });
    console.log(`${r.ok ? "通過" : "失敗"}  ${name.padEnd(16)} ${fmt(r.secs)}${tag}`);
    if (!r.ok) console.log(tail(r.out).split("\n").map(l => "    | " + l).join("\n"));
  };

  const servers = await Promise.all(Array.from({ length: jobs }, serve));
  const queue = [...browserTests].sort((a, b) => SLOW.indexOf(b) - SLOW.indexOf(a));   // longest first: the slow ones set the wall-clock floor
  const failed = [];
  const worker = async server => {
    for (let name; (name = queue.shift());) {
      const r = await run([`tests/${name}.mjs`, server.url], name);
      record(name, r);
      if (!r.ok) failed.push(name);
    }
  };
  const unitJob = doUnit ? run(["--test", ...unit.map(n => `tests/${n}.mjs`)], "unit").then(r => record("unit", r)) : Promise.resolve();
  await Promise.all([unitJob, ...servers.map(worker)]);

  // A failure under load is not always a real one: run each failed test again, alone, on a quiet machine.
  const flaky = [], hard = [];
  if (failed.length) console.log(`\n重跑 ${failed.length} 支失敗的測試（單獨、一次一支）...`);
  for (const name of failed) {
    if (!opt.retry) { hard.push(name); continue; }
    const r = await run([`tests/${name}.mjs`, servers[0].url], name);
    record(name, r, r.ok ? "  (重跑後通過)" : "  (重跑仍失敗)");
    (r.ok ? flaky : hard).push(name);
  }
  if (doUnit && results.some(r => r.name === "unit" && !r.ok)) hard.push("unit");
  await Promise.all(servers.map(s => s.close()));

  const total = (Date.now() - t0) / 1000, sum = results.reduce((a, r) => a + r.secs, 0);
  console.log(`\n=== 彙總 ===  ${fmt(total)} 牆鐘（各測試加總 ${fmt(sum)}），jobs ${jobs}`);
  const n = browserTests.length + (doUnit ? 1 : 0);
  console.log(`共 ${n} 項：通過 ${n - flaky.length - hard.length}，重跑後通過 ${flaky.length}${flaky.length ? " (" + flaky.join(", ") + ")" : ""}，失敗 ${hard.length}${hard.length ? " (" + hard.join(", ") + ")" : ""}`);
  process.exit(hard.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) main();
