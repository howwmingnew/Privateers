"use strict";
// ---------- Achievements: 20, kept in save.ach as { id: unlock time }, with a small toast that never blocks play ----------
// The ids are stable so a Steamworks bridge can map them one to one.
const ACH = [
  { id: "first_hit" }, { id: "first_sink" }, { id: "untouched" }, { id: "full_hold" }, { id: "salvage" },
  { id: "own_schooner" }, { id: "own_brig" }, { id: "own_frigate" }, { id: "own_line" },
  { id: "bounty_1" }, { id: "bounty_2" }, { id: "bounty_3" }, { id: "bounty_4" }, { id: "bounty_5" },
  { id: "sea_reef" }, { id: "sea_lanes" }, { id: "sea_maelstrom" },
  { id: "centurion" }, { id: "charmed" }, { id: "vulture", hidden: true },
];
Object.assign(STR.en, {
  achUnlocked: "Achievement unlocked",
  ach_first_hit: "Opening Shot", achd_first_hit: "Land your first cannonball on an enemy ship.",
  ach_first_sink: "Blood in the Water", achd_first_sink: "Sink your first ship.",
  ach_untouched: "Not a Scratch", achd_untouched: "Sink a ship on a sortie before taking a single hit.",
  ach_full_hold: "Full to the Gunwales", achd_full_hold: "Fill your cargo hold to the brim.",
  ach_salvage: "Salvage Rights", achd_salvage: "Recover every last crate from one of your wrecks.",
  ach_own_schooner: "Two Masts", achd_own_schooner: "Buy a schooner.",
  ach_own_brig: "Square-Rigged", achd_own_brig: "Buy a brig.",
  ach_own_frigate: "Ship of War", achd_own_frigate: "Buy a frigate.",
  ach_own_line: "First Rate", achd_own_line: "Buy a Ship of the Line.",
  ach_bounty_1: "Red Ned's Colours", achd_bounty_1: "Claim the bounty on Red Ned.",
  ach_bounty_2: "No More Boarders", achd_bounty_2: "Claim the bounty on Mother Carey.",
  ach_bounty_3: "Ashes to Ashes", achd_bounty_3: "Claim the bounty on the Ashen Saint.",
  ach_bounty_4: "Colours Struck", achd_bounty_4: "Claim the bounty on Commodore Hale.",
  ach_bounty_5: "Sovereign of the Seas", achd_bounty_5: "Sink HMS Sovereign and end the war.",
  ach_sea_reef: "Into the Reefs", achd_sea_reef: "Sail into the Reef Straits.",
  ach_sea_lanes: "Crown Waters", achd_sea_lanes: "Sail into the Navy Lanes.",
  ach_sea_maelstrom: "Off the Chart", achd_sea_maelstrom: "Sail into the Maelstrom.",
  ach_centurion: "Centurion", achd_centurion: "Sink 100 ships.",
  ach_charmed: "Charmed Life", achd_charmed: "Claim the first three bounties without losing a ship.",
  ach_vulture: "Vulture", achd_vulture: "Scoop up the plunder of a ship someone else sank.",
});
Object.assign(STR.zh, {
  achUnlocked: "解鎖成就",
  ach_first_hit: "第一砲", achd_first_hit: "第一次用砲彈命中敵船。",
  ach_first_sink: "海上見血", achd_first_sink: "擊沉第一艘船。",
  ach_untouched: "毫髮無傷", achd_untouched: "在一次出航中，還沒被打中就擊沉一艘船。",
  ach_full_hold: "滿載而歸", achd_full_hold: "把貨艙裝滿。",
  ach_salvage: "撈回家當", achd_salvage: "把一處殘骸裡的貨物全部撈回來。",
  ach_own_schooner: "雙桅在手", achd_own_schooner: "買下一艘縱帆船。",
  ach_own_brig: "橫帆揚起", achd_own_brig: "買下一艘雙桅橫帆船。",
  ach_own_frigate: "戰艦之主", achd_own_frigate: "買下一艘巡防艦。",
  ach_own_line: "一級戰艦", achd_own_line: "買下一艘戰列艦。",
  ach_bounty_1: "紅鬍的旗", achd_bounty_1: "領取紅鬍奈德的懸賞。",
  ach_bounty_2: "不准跳幫", achd_bounty_2: "領取凱莉大娘的懸賞。",
  ach_bounty_3: "塵歸塵", achd_bounty_3: "領取灰燼聖徒的懸賞。",
  ach_bounty_4: "降旗投降", achd_bounty_4: "領取海爾准將的懸賞。",
  ach_bounty_5: "海上君王", achd_bounty_5: "擊沉君權號，結束這場戰爭。",
  ach_sea_reef: "駛入暗礁", achd_sea_reef: "駛進暗礁海峽。",
  ach_sea_lanes: "皇家水域", achd_sea_lanes: "駛進海軍航道。",
  ach_sea_maelstrom: "海圖盡頭", achd_sea_maelstrom: "駛進大漩渦。",
  ach_centurion: "百船斬", achd_centurion: "擊沉 100 艘船。",
  ach_charmed: "福星高照", achd_charmed: "一艘船都沒沉，就完成前三張懸賞。",
  ach_vulture: "禿鷹", achd_vulture: "撿走別人擊沉的船留下的戰利品。",
});
const ACH_IDS = new Set(ACH.map(a => a.id));

// ---------- Unlocking ----------
const achQueue = [];
const achToastEl = document.createElement("div");
achToastEl.id = "achToast"; achToastEl.setAttribute("role", "status");
document.body.append(achToastEl);
let achShowing = false;
function unlockAch(id) {
  if (!ACH_IDS.has(id) || save.ach[id]) return false;
  save.ach = { ...save.ach, [id]: Date.now() };
  persist();
  achQueue.push(id);
  if (!achShowing) nextAchToast();
  return true;
}
function renderAchToast(id) { achToastEl.innerHTML = `<small>${t("achUnlocked")}</small><b>${t("ach_" + id)}</b><span>${t("achd_" + id)}</span>`; }
function nextAchToast() {
  const id = achQueue.shift();
  if (!id) { achShowing = false; achToastEl.classList.remove("on"); return; }
  achShowing = true; achToastEl.dataset.id = id; renderAchToast(id);
  achToastEl.classList.remove("on"); void achToastEl.offsetWidth; achToastEl.classList.add("on");
  sfx("buy");   // the ledger stamp
  setTimeout(() => { achToastEl.classList.remove("on"); setTimeout(nextAchToast, 350); }, 3200);
}

// ---------- What earns them ----------
onHook("hurt", (s, dmg, src) => { if (!s.isPlayer && src === player) unlockAch("first_hit"); });
onHook("sunk", (s, killer, loot) => {
  if (loot && killer !== player) loot.vulture = true;   // someone else's prize, for the hidden one
  if (s.isPlayer || killer !== player) return;
  unlockAch("first_sink");
  if (sortie && !sortie.hurt) unlockAch("untouched");   // sortie: js/logbook.js
  if (save.sunk >= 100) unlockAch("centurion");
});
onHook("pickup", (c, taken) => {
  if (c.wreck && c.value <= 0) unlockAch("salvage");
  if (c.vulture && taken > 0) unlockAch("vulture");
});
onHook("bounty", n => {
  unlockAch("bounty_" + n);
  if (n === OUTPOST_BOUNTY && save.campaign.deaths === 0) unlockAch("charmed");
});
onHook("sea", id => { if (id !== "shallows") unlockAch("sea_" + id); });
onHook("renderPort", () => { if (save.ship !== "sloop") unlockAch("own_" + save.ship); });
onHook("frame", () => { if (!paused && player.alive && player.cap > 0 && cargo >= player.cap) unlockAch("full_hold"); });
onHook("lang", () => { if (achShowing && achToastEl.dataset.id) renderAchToast(achToastEl.dataset.id); });
