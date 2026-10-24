// Builds the Google Fonts URL in index.html with `&text=`: every font is cut down to the characters the game can show.
// The CJK faces are the bulk of a cold load (about 1 MB as unicode-range slices); the game's text is all in its own
// strings, so the glyphs it can ever need are known. Run after adding strings with new characters:
//   node tools/font-subset.mjs           print the URL and the glyph count
//   node tools/font-subset.mjs --write   rewrite the <link id="fonts"> href in index.html
// tests/unit.mjs fails when index.html's link is out of date with the strings.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const FAMILIES = "family=IM+Fell+English+SC&family=Barlow+Semi+Condensed:wght@500;600;700&family=Noto+Serif+TC:wght@600&family=Noto+Sans+TC:wght@500";
// Printable ASCII always (numbers, gold, names), plus every non-ASCII character in the scripts, styles and the page.
export function glyphs() {
  const read = dir => readdirSync(new URL(dir, ROOT)).filter(f => /\.(js|css)$/.test(f)).map(f => readFileSync(new URL(dir + f, ROOT), "utf8"));
  const src = read("js/").concat(read("css/"),readFileSync(new URL("index.html", ROOT), "utf8").replace(/<link id="fonts"[^>]*>/, ""));
  const set = new Set();
  for (let c = 32; c < 127; c++) set.add(String.fromCharCode(c));
  for (const s of src) for (const ch of s) if (ch.codePointAt(0) > 127 && !/[\s\p{Cc}\p{Cf}\u{FE0F}]/u.test(ch)) set.add(ch);
  return [...set].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join("");
}
export function fontsHref() {
  return `https://fonts.googleapis.com/css2?${FAMILIES}&display=swap&text=${encodeURIComponent(glyphs())}`;
}
const LINK = /(<link id="fonts" rel="stylesheet" href=")[^"]*(">)/;
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const href = fontsHref();
  if (process.argv.includes("--write")) {
    const file = new URL("index.html", ROOT), html = readFileSync(file, "utf8");
    if (!LINK.test(html)) throw new Error('index.html has no <link id="fonts" rel="stylesheet" href="...">');
    writeFileSync(file, html.replace(LINK, `$1${href.replace(/&/g, "&amp;")}$2`));
    console.log(`index.html: ${[...glyphs()].length} glyphs`);
  } else console.log(href, `\n${[...glyphs()].length} glyphs, URL ${href.length} chars`);
}
