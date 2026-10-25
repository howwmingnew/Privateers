// Test runner: finds the tests by file name, so a new test only needs a file in tests/ (no package.json edit).
//
//   node tools/run-tests.mjs [group] [--jobs N] [--no-retry] [--base REF] [--list] [name ...]
//
// groups   unit    node --test tests/unit*.mjs
//          smoke   tests/smoke.mjs and tests/gunart.mjs (browser, quick)
//          browser every other browser test in tests/ (see EXCLUDED)
//          quick   unit + smoke + the browser tests that match `git diff $(git merge-base REF HEAD) --name-only` (see tools/test-map.mjs)
//          all     unit + smoke + browser (default)
//          ci      unit + smoke (what `npm test` runs)
// name     run just these browser tests, e.g. `node tools/run-tests.mjs gundeck heat` (or one shard: `scale-extremes@390x844`)
//
// File naming convention (nothing to register):
//   tests/unit*.mjs          unit tests, run by `node --test`
//   tests/<name>.mjs         browser test; takes the page URL as argv[2], exits non-zero on failure
//   tests/<name>-perf.mjs    benchmarks and screenshot tools: not run by default (run them by hand or by name)
//
// --jobs N runs N browser tests at once. Every worker owns a static server on its own port and passes
// that URL to the test; the servers are closed when the run ends. A failed test is re-run once, alone;
// passing the second time is reported as flaky ("重跑後通過") and does not fail the run.
//
// Longest first: every passing test's seconds go into .review/test-times.json and the next run starts the slowest ones first.
// Sharded: a test listed in SHARDS runs as one queue item per value of an env var it narrows itself with (scale-extremes@390x844).
// Phaser and the Google fonts: served from local copies (node_modules/.cache) instead of the CDNs, so the many browser contexts
// (each with its own HTTP cache) do not each download them again.
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createReadStream, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { browserTestsFor } from "./test-map.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TESTS = join(ROOT, "tests");
const SMOKE = ["smoke", "gunart"];
// Not run by default: perf benchmarks and screenshot / page dump tools. Everything else in tests/ is a browser test.
const EXCLUDED = [/^unit/, /-perf$/, /^art-(perf|shots|page)$/];
// Roughly the slowest browser tests, slowest last. Only the ordering when .review/test-times.json has no record yet.
const SLOW = ["feedback", "campaign", "ports", "phase1b", "scale-extremes"];
const TIMES = join(ROOT, ".review", "test-times.json");
// scale-extremes is 5 viewports x 8 slider combos in one Chrome; the viewports are independent, so each is its own queue item
// (the test narrows itself with VP=...). The values are read from the test's VIEWPORTS rows, so a new viewport is never left out.
const SHARDS = { "scale-extremes": { env: "VP", re: /^\s*\["(\d+x\d+)",/gm } };
const TIMEOUT_MS = 8 * 60 * 1000;

export function discover() {
  const all = readdirSync(TESTS).filter(f => f.endsWith(".mjs")).map(f => f.slice(0, -4)).sort();
  const unit = all.filter(n => /^unit/.test(n));
  const browser = all.filter(n => !EXCLUDED.some(re => re.test(n)) && !SMOKE.includes(n));
  return { all, unit, browser };
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".md": "text/plain; charset=utf-8", ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf" };
const CACHE = join(ROOT, "node_modules", ".cache", "privateers");
const keep = (file, buf) => {   // through a temp file and a rename: a concurrent run never reads half a file. Not kept: still used this run
  try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(`${file}.${process.pid}`, buf); renameSync(`${file}.${process.pid}`, file); }
  catch (e) { console.log(`run-tests: could not keep ${file} (${e.message})`); }
  return buf;
};

// The engine comes from cdnjs, and every Playwright context has its own HTTP cache, so each test boot downloaded it again.
// Keep one copy, checked against cdnjs' published hash, and point the pages at it. No copy and no network: pages keep the CDN URL.
const PHASER_CDN = "https://cdnjs.cloudflare.com/ajax/libs/phaser/3.80.1/phaser.min.js";
const PHASER_SRI = "sha512-zQK11u7QyhUWLmhK+Kyn4Oac0n2d5+AcuEiCagfm2YrGa2wMrdbj5EJammEmGU7bGnckmRoNTUT29Dl+DaRSlg==";
const PHASER_LOCAL = "/__vendor/phaser.min.js";
export async function vendorPhaser() {
  const file = join(CACHE, "phaser-3.80.1.min.js");
  const good = buf => "sha512-" + createHash("sha512").update(buf).digest("base64") === PHASER_SRI;
  if (!readFileSync(join(ROOT, "index.html"), "utf8").includes(PHASER_CDN)) console.log(`run-tests: index.html no longer loads ${PHASER_CDN}; update PHASER_CDN / PHASER_SRI in tools/run-tests.mjs`);
  try { const buf = readFileSync(file); if (good(buf)) return buf; } catch { /* not cached yet */ }
  try {
    const res = await fetch(PHASER_CDN, { signal: AbortSignal.timeout(30000) });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok || !good(buf)) throw new Error(`HTTP ${res.status}, ${buf.length} bytes, ${res.ok ? "hash mismatch" : "not ok"}`);
    return keep(file, buf);
  } catch (e) { console.log(`run-tests: no local Phaser (${e.message}); the tests load it from cdnjs`); return null; }
}

// Same for the fonts: js/fonts-link.js links a Google Fonts stylesheet whose font files are on fonts.gstatic.com. Both go through
// /__vendor/<host>/..., fetched on first use and kept (the stylesheet per user agent: Google words it per browser).
// A file it cannot fetch redirects to Google, so offline with nothing kept behaves as before.
const FONTS = /^\/__vendor\/(fonts\.googleapis\.com|fonts\.gstatic\.com)(\/.*)$/;
const fetching = new Map();   // several pages asking for the same file at once share one download
let fontNote = true;
function vendorFont(host, path, ua) {
  const css = host === "fonts.googleapis.com", file = join(CACHE, "fonts", createHash("sha1").update(css ? `${ua}\n${path}` : path).digest("hex"));
  try { return Promise.resolve(readFileSync(file)); } catch { /* not kept yet */ }
  if (!fetching.has(file)) fetching.set(file, (async () => {
    const res = await fetch(`https://${host}${path}`, { headers: { "user-agent": ua }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let buf = Buffer.from(await res.arrayBuffer());
    if (css) buf = Buffer.from(buf.toString("utf8").replaceAll("https://fonts.gstatic.com/", "/__vendor/fonts.gstatic.com/"));
    return keep(file, buf);
  })().finally(() => fetching.delete(file)));
  return fetching.get(file);
}
// The pages and the one script that name those URLs. index.html names Phaser twice (preload + script): both must point here.
const localize = (text, phaser) => (phaser ? text.replaceAll(PHASER_CDN, PHASER_LOCAL) : text).replaceAll("https://fonts.googleapis.com/", "/__vendor/fonts.googleapis.com/");
const LOCALIZED = p => p.endsWith(".html") || p === "/js/fonts-link.js";

// Static server for the repo root on a free port. Returns { url, close }. With `phaser`, pages load the engine from it.
export function serve(phaser) {
  const send = (req, res, type, body, cache) => {
    res.writeHead(200, { "content-type": type, "cache-control": cache, "content-length": body.length });
    res.end(req.method === "HEAD" ? undefined : body);
  };
  const server = createServer((req, res) => {
    const font = (req.url || "").match(FONTS);
    if (font) {
      const [, host, path] = font, type = host === "fonts.googleapis.com" ? MIME[".css"] : MIME[extname(path.split("?")[0])] || "application/octet-stream";
      vendorFont(host, path, req.headers["user-agent"] || "").then(buf => send(req, res, type, buf, "public, max-age=31536000, immutable"),
        e => { if (fontNote) console.log(`run-tests: could not keep a font file (${e.message}); pages get the fonts from Google`); fontNote = false; res.writeHead(302, { location: `https://${host}${path}` }).end(); });
      return;
    }
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    if (phaser && p === PHASER_LOCAL) { send(req, res, MIME[".js"], phaser, "public, max-age=31536000, immutable"); return; }   // cached like the CDN copy
    const file = normalize(join(ROOT, p));
    let st;
    try { st = statSync(file); } catch { st = null; }
    if (!file.startsWith(ROOT) || !st || !st.isFile()) { res.writeHead(404).end("not found"); return; }
    const type = MIME[extname(file)] || "application/octet-stream";
    if (LOCALIZED(p)) { send(req, res, type, Buffer.from(localize(readFileSync(file, "utf8"), phaser)), "no-store"); return; }
    res.writeHead(200, { "content-type": type, "cache-control": "no-store", "content-length": st.size });
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

function run(args, label, env = {}) {
  const t0 = Date.now();
  return new Promise(done => {
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
    let out = "";
    const add = d => { out += d; };
    child.stdout.on("data", add); child.stderr.on("data", add);
    const timer = setTimeout(() => { out += `\n[run-tests] ${label} killed after ${TIMEOUT_MS / 1000}s\n`; child.kill("SIGKILL"); }, TIMEOUT_MS);
    child.on("close", code => { clearTimeout(timer); done({ ok: code === 0, secs: (Date.now() - t0) / 1000, out }); });
  });
}

const fmt = s => `${s.toFixed(1)}s`;
const tail = (out, n = 40) => out.trimEnd().split("\n").slice(-n).join("\n");

// Files this branch changed (committed or not) plus untracked ones. Diffs against the merge-base, not REF itself: a branch that is
// behind main must not count main's newer commits as its own changes. No merge-base (shallow clone, unknown REF): REF, then HEAD~1.
function changedFiles(base) {
  const git = args => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).split("\n").map(s => s.trim()).filter(Boolean);
  let mb = null;
  try { mb = git(["merge-base", base, "HEAD"])[0]; } catch { /* falls back below */ }
  for (const [ref, from] of [[mb, `${base} (merge-base ${mb?.slice(0, 7)})`], [base, base], ["HEAD~1", "HEAD~1"]]) {
    if (!ref) continue;
    let files;
    try { files = git(["diff", ref, "--name-only"]); } catch { continue; }
    try { files = files.concat(git(["ls-files", "-o", "--exclude-standard"])); } catch { /* not fatal */ }
    return { files: [...new Set(files)], from };
  }
  return null;
}

// "scale-extremes" -> ["scale-extremes@1280x720", ...]. Left whole when the caller already narrowed it (VP=... set) or no values are found.
function expand(name) {
  const sh = SHARDS[name];
  if (!sh || name.includes("@") || process.env[sh.env]) return [name];
  const vals = [...readFileSync(join(TESTS, `${name}.mjs`), "utf8").matchAll(sh.re)].map(m => m[1]);
  return vals.length > 1 ? vals.map(v => `${name}@${v}`) : [name];
}
const testOf = item => item.split("@")[0];
const envOf = item => { const [name, val] = item.split("@"); return val ? { [SHARDS[name].env]: val } : {}; };

function readTimes() {
  try { return Object.fromEntries(Object.entries(JSON.parse(readFileSync(TIMES, "utf8"))).filter(([, s]) => typeof s === "number" && s > 0)); }
  catch (e) { if (e.code !== "ENOENT") console.log(`run-tests: ignoring ${TIMES} (${e.message})`); return {}; }
}
// Longest first (LPT): the slow ones set the wall-clock floor. A test with no record yet counts as the median one.
function order(items, times) {
  const known = Object.values(times).sort((a, b) => a - b);
  if (!known.length) return [...items].sort((a, b) => SLOW.indexOf(testOf(b)) - SLOW.indexOf(testOf(a)));
  const med = known[known.length >> 1], est = n => times[n] ?? med;
  return [...items].sort((a, b) => est(b) - est(a));
}
// Merged into the file, not written over it: a quick or single-test run only knows a few. Halfway to the new value, so one run
// under heavy load does not reorder everything.
function saveTimes(fresh) {
  if (!Object.keys(fresh).length) return;
  const times = readTimes();
  for (const [n, s] of Object.entries(fresh)) times[n] = Math.round((times[n] ? (times[n] + s) / 2 : s) * 10) / 10;
  try {
    mkdirSync(dirname(TIMES), { recursive: true });
    writeFileSync(`${TIMES}.${process.pid}`, JSON.stringify(times, null, 1)); renameSync(`${TIMES}.${process.pid}`, TIMES);
  } catch (e) { console.log(`run-tests: could not save ${TIMES} (${e.message})`); }
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
  // "smoke" is a group and a test: followed by more names it is a test name too ("smoke platform")
  const group = groups.includes(words[0]) && !(words.length > 1 && SMOKE.includes(words[0])) ? words.shift() : (words.length ? "names" : "all");
  if (group !== "names" && words.length) { console.error(`a group takes no test names: ${group} ${words.join(" ")}`); process.exit(2); }
  let doUnit = false, browserTests = [];
  if (group === "unit") doUnit = true;
  else if (group === "smoke") browserTests = SMOKE;
  else if (group === "browser") browserTests = browser;
  else if (group === "ci") { doUnit = true; browserTests = SMOKE; }
  else if (group === "all") { doUnit = true; browserTests = [...SMOKE, ...browser]; }
  else if (group === "quick") {
    doUnit = true;
    const changed = changedFiles(opt.base);
    const picked = changed ? browserTestsFor(changed.files, { available: all }) : { tests: [], core: true, files: [] };
    browserTests = [...new Set([...SMOKE, ...picked.tests.filter(t => browser.includes(t) || SMOKE.includes(t))])];
    console.log(changed ? `quick: ${changed.files.length} changed file(s) vs ${changed.from} -> ${browserTests.join(", ")}${picked.core ? " (includes the core set: some change has no specific mapping)" : ""}`
      : "quick: git diff failed, running the core set");
  } else {
    for (const n of words) {
      if (!all.includes(testOf(n))) { console.error(`no tests/${testOf(n)}.mjs`); process.exit(2); }
      if (n.includes("@") && !SHARDS[testOf(n)]) { console.error(`${testOf(n)} has no shards (see SHARDS in tools/run-tests.mjs)`); process.exit(2); }
    }
    browserTests = words;
  }
  // shards are queue items of their own: count, schedule, retry and report them one by one
  const times = readTimes();
  const items = order([...new Set(browserTests.flatMap(expand))], times);
  if (opt.list) { console.log([doUnit ? "unit" : "", ...items].filter(Boolean).join("\n")); return; }

  const jobs = Math.min(opt.jobs, Math.max(1, items.length));
  console.log(`run-tests: ${group}${doUnit ? ` (unit: ${unit.length} files)` : ""}, ${items.length} browser test(s), jobs ${jobs}`);
  const t0 = Date.now();
  const results = [], fresh = {};
  const pad = Math.max(16, ...items.map(n => n.length));
  const record = (name, r, tag = "") => {
    results.push({ name, ...r, tag });
    console.log(`${r.ok ? "通過" : "失敗"}  ${name.padEnd(pad)} ${fmt(r.secs)}${tag}`);
    if (!r.ok) console.log(tail(r.out).split("\n").map(l => "    | " + l).join("\n"));
  };

  const phaser = items.length ? await vendorPhaser() : null;
  const servers = await Promise.all(Array.from({ length: jobs }, () => serve(phaser)));
  const queue = [...items];
  const failed = [];
  const worker = async server => {
    for (let name; (name = queue.shift());) {
      const r = await run([`tests/${testOf(name)}.mjs`, server.url], name, envOf(name));
      record(name, r);
      if (r.ok) fresh[name] = r.secs; else failed.push(name);   // a failure's time (a timeout, an early exit) says nothing about its length
    }
  };
  const unitJob = doUnit ? run(["--test", ...unit.map(n => `tests/${n}.mjs`)], "unit").then(r => record("unit", r)) : Promise.resolve();
  await Promise.all([unitJob, ...servers.map(worker)]);
  saveTimes(fresh);

  // A failure under load is not always a real one: run each failed test again, alone, on a quiet machine.
  const flaky = [], hard = [];
  if (failed.length) console.log(`\n重跑 ${failed.length} 支失敗的測試（單獨、一次一支）...`);
  for (const name of failed) {
    if (!opt.retry) { hard.push(name); continue; }
    const r = await run([`tests/${testOf(name)}.mjs`, servers[0].url], name, envOf(name));
    record(name, r, r.ok ? "  (重跑後通過)" : "  (重跑仍失敗)");
    (r.ok ? flaky : hard).push(name);
  }
  if (doUnit && results.some(r => r.name === "unit" && !r.ok)) hard.push("unit");
  await Promise.all(servers.map(s => s.close()));

  const total = (Date.now() - t0) / 1000, sum = results.reduce((a, r) => a + r.secs, 0);
  console.log(`\n=== 彙總 ===  ${fmt(total)} 牆鐘（各測試加總 ${fmt(sum)}），jobs ${jobs}`);
  const n = items.length + (doUnit ? 1 : 0);
  console.log(`共 ${n} 項：通過 ${n - flaky.length - hard.length}，重跑後通過 ${flaky.length}${flaky.length ? " (" + flaky.join(", ") + ")" : ""}，失敗 ${hard.length}${hard.length ? " (" + hard.join(", ") + ")" : ""}`);
  process.exit(hard.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) main();
