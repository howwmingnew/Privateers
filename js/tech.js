"use strict";
// ---------- Page and frame upkeep: tab title per language, no selection or context menu on the game, and big fights
// kept readable and cheap (level plates thinned out, damage smoke halved while frames run long) ----------
Object.assign(STR.en, { noGuns: "Mount at least one gun before you set sail: every gun port is empty." });
Object.assign(STR.zh, { noGuns: "至少要裝一門砲才能出航：現在每個砲位都是空的。" });

// The tab, bookmarks and the home-screen name lead with the player's language.
const DOC_TITLE = { en: "Privateers: Letters of Marque · 私掠者", zh: "私掠者：私掠許可狀 · Privateers" };
const docTitle = () => { document.title = DOC_TITLE[lang] || DOC_TITLE.en; };
docTitle();
onHook("lang", docTitle);

// A long press on a phone must not open the browser's copy / save-image menu over the sea (the canvas itself is
// covered in js/input.js). The CSS side (no text selection) is in css/tech.css.
for (const id of ["hud", "joy", "hint"]) document.getElementById(id)?.addEventListener("contextmenu", e => e.preventDefault());

// ---------- Big fights ----------
// Past PLATE_CROWD ships on screen the "Lv · gold" plates pile into one unreadable stack, so only the PLATE_NEAR
// nearest keep theirs, plus whatever the captain is fighting (the last ship they hit, the tutorial's mark) and bosses.
const PLATE_CROWD = 8, PLATE_NEAR = 3, PLATE_FOCUS_S = 6;
let plateFocus = null, plateFocusT = 0, platesThinned = false;
onHook("hurt", (s, dmg, src) => { if (src === player && !s.isPlayer) { plateFocus = s; plateFocusT = PLATE_FOCUS_S; } });
function thinPlates(dt) {
  plateFocusT -= dt;
  const seen = enemies.filter(e => e.alive && e.badge && onScreen(e.x, e.y, 0));
  if (seen.length <= PLATE_CROWD) {
    if (platesThinned) { platesThinned = false; for (const e of enemies) e.badge?.setVisible(true); }
    return;
  }
  platesThinned = true;
  const keep = new Set(seen.map(e => [dist(e, player), e]).sort((a, b) => a[0] - b[0]).slice(0, PLATE_NEAR).map(p => p[1]));
  if (plateFocusT > 0 && plateFocus) keep.add(plateFocus);
  if (typeof tut !== "undefined" && tut.target) keep.add(tut.target);
  for (const e of enemies) if (e.badge) e.badge.setVisible(keep.has(e) || !!e.boss);
}

// Frame cost: the CPU time of the scene's update (the simulation, not the GPU), smoothed. Over PERF_HI ms a frame the
// damage smoke and flames (js/vfx.js) puff half as often; back under PERF_OK they return.
const PERF_HI = 12, PERF_OK = 8, PERF_K = 0.05;
let perfT0 = 0, perfEma = 0;
onHook("ready", () => {
  S.events.on("preupdate", () => { perfT0 = performance.now(); });
  S.events.on("postupdate", () => {
    perfEma += (performance.now() - perfT0 - perfEma) * PERF_K;
    PERF_LOW = PERF_LOW ? perfEma > PERF_OK : perfEma > PERF_HI;
  });
});
onHook("frame", dt => { if (player && !docked) thinPlates(dt); });
