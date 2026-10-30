// Builds portal/ from the main version for web-game portals (Poki, CrazyGames), which forbid external requests.
//   node tools/build-portal.mjs [--sdk poki|crazygames] [--out DIR]      (npm run portal)
// portal/ is generated and gitignored: index.html, js/ and css/ copied as they are, with only these changes:
//   - Phaser (the version index.html pins) is served from portal/vendor/, checked against cdnjs' published hash
//   - the Google fonts (the &text= subset in js/fonts-link.js) are downloaded to portal/fonts/ and linked with a plain stylesheet
//   - preconnect / preload hints and the og: / twitter: meta tags (absolute URLs of the Pages site) are dropped
//   - tools/portal/portal-sdk.js is added as js/portal-sdk.js, loaded just before main.js (the main version never loads it)
//   - with --sdk, the platform's SDK script tag is added; without it the shim does nothing unless the platform injects its SDK itself
// Every rewrite must match exactly once, or the build stops: a change to index.html that breaks one is noticed here, not on a portal.
// Then the output is scanned: index.html and the stylesheets may not name any URL except the --sdk script.
// Needs network on the first run (Phaser, fonts); both are kept in node_modules/.cache/privateers-portal for the next ones.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { vendorPhaser } from "./run-tests.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CACHE = join(ROOT, "node_modules", ".cache", "privateers-portal");
// Google words the stylesheet per browser: a current Chrome gets woff2 files.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
export const SDK_SCRIPTS = {
  poki: "https://game-cdn.poki.com/scripts/v2/poki-sdk.js",
  crazygames: "https://sdk.crazygames.com/crazygames-sdk-v3.js",
};

// Replaces `from` (a string or a RegExp) once; stops the build when it is not there exactly once.
function swap(text, from, to, what) {
  const hits = typeof from === "string" ? text.split(from).length - 1 : (text.match(new RegExp(from.source, "g")) || []).length;
  if (hits !== 1) throw new Error(`build-portal: expected ${what} once in index.html, found ${hits}; update tools/build-portal.mjs`);
  return text.replace(from, () => to);
}

async function cached(name, fetcher) {
  const file = join(CACHE, name);
  if (existsSync(file)) return readFileSync(file);
  const buf = await fetcher();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, buf);
  return buf;
}
const get = async url => {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`build-portal: ${url} answered HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};

// The stylesheet URL js/fonts-link.js writes (a JS string: the quotes inside are escaped), and the font files it names.
async function vendorFonts(out) {
  const src = readFileSync(join(ROOT, "js", "fonts-link.js"), "utf8");
  const m = src.match(/href=\\"(https:\/\/fonts\.googleapis\.com\/[^"\\]+)\\"/);
  if (!m) throw new Error("build-portal: no Google Fonts URL in js/fonts-link.js");
  const url = m[1];
  let css = (await cached(`fonts-${createHash("sha1").update(url).digest("hex")}.css`, () => get(url))).toString("utf8");
  const files = new Map();
  css = css.replace(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g, (_, u) => {
    if (!files.has(u)) files.set(u, createHash("sha1").update(u).digest("hex").slice(0, 16) + ".woff2");
    return `url(${files.get(u)})`;
  });
  if (!files.size) throw new Error("build-portal: the Google Fonts stylesheet named no font files");
  mkdirSync(join(out, "fonts"), { recursive: true });
  for (const [u, name] of files) writeFileSync(join(out, "fonts", name), await cached(`font-${name}`, () => get(u)));
  writeFileSync(join(out, "fonts", "fonts.css"), css);
  return files.size;
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) yield* walk(join(dir, e.name)); else yield join(dir, e.name);
  }
}

export async function build({ sdk = "", out = join(ROOT, "portal") } = {}) {
  if (sdk && !SDK_SCRIPTS[sdk]) throw new Error(`build-portal: --sdk is ${Object.keys(SDK_SCRIPTS).join(" or ")}, not "${sdk}"`);
  const phaser = await vendorPhaser();
  if (!phaser) throw new Error("build-portal: could not get Phaser (network, or the cdnjs hash no longer matches)");

  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, "vendor"), { recursive: true });
  cpSync(join(ROOT, "css"), join(out, "css"), { recursive: true });
  cpSync(join(ROOT, "js"), join(out, "js"), { recursive: true });
  rmSync(join(out, "js", "fonts-link.js"));   // replaced by the local stylesheet link
  cpSync(join(ROOT, "tools", "portal", "portal-sdk.js"), join(out, "js", "portal-sdk.js"));
  writeFileSync(join(out, "vendor", "phaser.min.js"), phaser);
  const fonts = await vendorFonts(out);

  let html = readFileSync(join(ROOT, "index.html"), "utf8").replaceAll("\r\n", "\n");   // the repo's files are CRLF on Windows checkouts
  const phaserUrl = html.match(/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/phaser\/[\d.]+\/phaser\.min\.js/)?.[0];
  if (!phaserUrl) throw new Error("build-portal: index.html names no Phaser URL on cdnjs");
  html = swap(html, /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\r?\n/, "", "the fonts.googleapis.com preconnect");
  html = swap(html, /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\r?\n/, "", "the fonts.gstatic.com preconnect");
  html = swap(html, /<link rel="preconnect" href="https:\/\/cdnjs\.cloudflare\.com">\r?\n/, "", "the cdnjs preconnect");
  html = swap(html, `<link rel="preload" as="script" href="${phaserUrl}">\n`, "", "the Phaser preload");
  html = swap(html, '<script src="js/fonts-link.js"></script>', '<link id="fonts" rel="stylesheet" href="fonts/fonts.css">', "the fonts-link.js script");
  html = swap(html, `<script defer src="${phaserUrl}"></script>`, '<script defer src="vendor/phaser.min.js"></script>', "the Phaser script");
  html = swap(html, '<script defer src="js/main.js"></script>', '<script defer src="js/portal-sdk.js"></script>\n<script defer src="js/main.js"></script>', "the main.js script");
  if (sdk) html = swap(html, '<script defer src="js/boot-guard.js"></script>', `<script src="${SDK_SCRIPTS[sdk]}"></script>\n<script defer src="js/boot-guard.js"></script>`, "the boot-guard script");
  html = html.replace(/<meta (?:property="og:|name="twitter:)[^>]*>\r?\n/g, "");
  writeFileSync(join(out, "index.html"), html);

  // Nothing in the page or the stylesheets may reach outside, except the platform's own SDK.
  const allowed = new Set(sdk ? [SDK_SCRIPTS[sdk]] : []), bad = [];
  const sheets = [...walk(join(out, "css")), ...walk(join(out, "fonts"))].filter(p => p.endsWith(".css"));
  for (const f of [join(out, "index.html"), ...sheets]) {
    for (const u of readFileSync(f, "utf8").match(/(?:https?:)?\/\/[\w-]+(?:\.[\w-]+)+[^\s"')<>]*/gi) || []) {
      if (!allowed.has(u) && !u.startsWith("http://www.w3.org/")) bad.push(`${f.slice(out.length + 1)}: ${u}`);
    }
  }
  if (bad.length) throw new Error(`build-portal: external URL(s) left in the output:\n  ${bad.join("\n  ")}`);
  return { out, fonts, sdk: sdk || "none" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--sdk") opt.sdk = argv[++i];
    else if (argv[i].startsWith("--sdk=")) opt.sdk = argv[i].slice(6);
    else if (argv[i] === "--out") opt.out = resolve(argv[++i]);
    else { console.error(`unknown option ${argv[i]}`); process.exit(2); }
  }
  build(opt).then(r => console.log(`portal: built ${r.out} (Phaser local, ${r.fonts} font files, SDK script: ${r.sdk})`),
    e => { console.error(e.message); process.exit(1); });
}
