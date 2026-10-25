// Unit checks for the page upkeep: the subset font link covers every character the game can show.
// Usage: node --test tests/unit-tech.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fontsHref, glyphs, currentHref } from "../tools/font-subset.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("the &text= font link in index.html covers every character in the scripts, styles and page", () => {
  assert.match(html, /<script src="js\/fonts-link\.js"><\/script>/, "index.html loads js/fonts-link.js (classic, not deferred: it writes the link)");
  const href = currentHref();
  assert.ok(href, "js/fonts-link.js carries the link");
  const text = new URL(href).searchParams.get("text") || "";
  const missing = [...glyphs()].filter(ch => !text.includes(ch));
  assert.deepEqual(missing, [], "new characters: run `node tools/font-subset.mjs --write`");
  assert.equal(href, fontsHref(), "the font link is out of date: run `node tools/font-subset.mjs --write`");
});

test("every CJK headline glyph is in the subset (the title, the victory and the ledger)", () => {
  const text = glyphs();
  for (const s of ["私掠者", "私掠許可狀", "自由港屹立不搖", "安全港", "港口帳簿", "擊沉君權號所花的時間", "對方降旗投降"]) for (const ch of s) assert.ok(text.includes(ch), ch);
});

test("the page carries its link-preview metadata", () => {
  for (const re of [/<meta name="description"/, /og:title/, /og:url" content="https:\/\/howwmingnew\.github\.io\/Privateers\/"/, /twitter:card/, /theme-color" content="#0f3f52"/,
    /og:locale:alternate" content="zh_TW"/, /<title>Privateers: Letters of Marque/]) assert.match(html, re);
  assert.match(html, /twitter:card" content="summary_large_image"/);
  assert.match(html, /og:image" content="https:\/\/howwmingnew\.github\.io\/Privateers\/og\.png"/, "an absolute address: crawlers do not resolve relative ones");
  assert.match(html, /og:image:width" content="1200"/);
  assert.match(html, /og:image:height" content="630"/);
});
