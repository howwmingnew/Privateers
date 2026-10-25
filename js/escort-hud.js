"use strict";
// ---------- The escorts' hull on the HUD (#107): a slim bar per escort that sailed, under the Ship Lv label ----------
// Escorts fight and sink out of the player's sight; without this the first sign of trouble was a toast. The chips live in the HUD's right column (css/combat.css
// #escHud), beside the chart, so they cost the sea view nothing and a phone shows them too. Redrawn a few times a second, and only when a figure changed.
Object.assign(STR.en, { escHudTag: "Esc {n}", escHudSunk: "sunk", escHudAria: "Escort {n} hull {p}%", escLowToast: "Escort {n} is badly hurt ({p}% hull)!" });
Object.assign(STR.zh, { escHudTag: "隨從 {n}", escHudSunk: "沉沒", escHudAria: "隨從 {n} 船體 {p}%", escLowToast: "隨從 {n} 受重創（船體 {p}%）！" });
const escHudEl = document.getElementById("escHud");
let escHudT = 0, escHudKey = "", escWarned = new Set();   // escWarned: the slots already warned about this sortie (#108)
// Pure: the chips' data for the live escorts [{ slot, e }]: slot number (1-based), hull share in whole percent, sunk.
const escIsLow = frac => frac < ESCORT_WARN;
const escHudRows = live => live.map(({ slot, e }) => ({ n: slot + 1, p: e.alive ? Math.max(1, Math.round(clamp(e.hp / e.maxHp, 0, 1) * 100)) : 0, sunk: !e.alive }));
function escHudDraw() {
  const rows = typeof escortLive !== "undefined" && !docked && !titleOpen ? escHudRows(escortLive) : [], key = lang + JSON.stringify(rows);
  if (key === escHudKey) return;
  escHudKey = key;
  for (const r of rows) if (!r.sunk && escIsLow(r.p / 100) && !escWarned.has(r.n)) {   // one warning per escort, the first time its hull falls under the line
    escWarned.add(r.n); toast(t("escLowToast", { n: r.n, p: r.p }), true, 3200); sfx("bell", { pitch: 0.5 });
  }
  escHudEl.hidden = !rows.length;
  escHudEl.innerHTML = rows.map(r => `<div class="eh${r.sunk ? " sunk" : escIsLow(r.p / 100) ? " low" : ""}" role="img" aria-label="${r.sunk ? t("escHudTag", { n: r.n }) + " " + t("escHudSunk") : t("escHudAria", { n: r.n, p: r.p })}">` +
    `<i style="width:${r.p}%"></i><span>${t("escHudTag", { n: r.n })}</span><b>${r.sunk ? t("escHudSunk") : r.p + "%"}</b></div>`).join("");
}
onHook("frame", dt => { if ((escHudT -= dt) > 0) return; escHudT = 0.2; escHudDraw(); });
onHook("dock", () => { escHudKey = ""; escHudDraw(); });   // the ledger is open: the chips go until the next sortie
onHook("sail", () => { escHudT = 0; escWarned = new Set(); });
