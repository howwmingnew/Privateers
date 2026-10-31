"use strict";
// ---------- Daily rewards: cosmetics and badges for clearing the day's sea (#39) ----------
// Sinking the day's captain earns one reward, once per daily number (a replay of the same day gives nothing more). Rewards are
// flag colours and emblems, hull paints and badges: pure looks, nothing that touches gold, guns or campaign balance.
// They live under their own key, never in privateers-save-v2 (nor in privateers-daily-v1): a hand-edited store can only change
// how the ship looks. Colours and emblems are picked on the flag card (js/flags.js); the hull paint is picked there too, kept here.
const REWARDS_KEY = "privateers-rewards-v1";
// The order rewards are handed out in: each win gives the next one not yet owned; once all are owned only badges can come.
const REWARD_ITEMS = ["paint:ebony", "emblem:crown", "color:navy", "paint:crimson", "emblem:moon", "color:rose", "paint:sea", "emblem:wave", "color:lime", "paint:ivory"];
// Badges: wins = days cleared in all, streak = consecutive daily numbers cleared.
const REWARD_BADGES = [{ id: "first", wins: 1 }, { id: "streak3", streak: 3 }, { id: "wins7", wins: 7 }, { id: "streak7", streak: 7 }, { id: "streak14", streak: 14 }, { id: "wins30", wins: 30 }];
const REWARD_KEEP = 120;   // days of "already claimed" kept
Object.assign(STR.en, {
  rwTitle: "Daily reward", rwNew: "New: {what}", rwDone: "Today's reward is already claimed.", rwLost: "Sink the captain to earn today's reward.",
  rwNone: "Everything the daily sea gives is already yours.", rwBadgeNew: "Badge: {what}", rwEquip: "Equip it on the Colors card in the ledger.",
  rwBadges: "Badges", rwPaint: "Hull paint", rwPaintStd: "Standard", rwKindColor: "Flag color", rwKindEmblem: "Flag emblem", rwKindPaint: "Hull paint",
  fc_navy: "Navy", fc_rose: "Rose", fc_lime: "Lime", fe_crown: "Crown", fe_moon: "Moon", fe_wave: "Wave",
  hp_ebony: "Ebony", hp_crimson: "Crimson", hp_sea: "Sea green", hp_ivory: "Ivory",
  bd_first: "First sea cleared", bd_streak3: "Three days running", bd_wins7: "Seven seas cleared", bd_streak7: "A week at sea", bd_streak14: "Fortnight captain", bd_wins30: "Thirty seas cleared",
});
Object.assign(STR.zh, {
  rwTitle: "每日獎勵", rwNew: "新獲得：{what}", rwDone: "今天的獎勵已經領過了。", rwLost: "擊沉船長，就能領今天的獎勵。",
  rwNone: "每日海域能給的，你都已經擁有了。", rwBadgeNew: "徽章：{what}", rwEquip: "到港口帳簿的「船旗」頁就能換上。",
  rwBadges: "徽章", rwPaint: "船身塗裝", rwPaintStd: "標準", rwKindColor: "旗幟顏色", rwKindEmblem: "旗幟圖案", rwKindPaint: "船身塗裝",
  fc_navy: "海軍藍", fc_rose: "玫瑰", fc_lime: "青檸", fe_crown: "皇冠", fe_moon: "月牙", fe_wave: "海浪",
  hp_ebony: "烏木", hp_crimson: "緋紅", hp_sea: "海綠", hp_ivory: "象牙",
  bd_first: "首次通關", bd_streak3: "連續三天", bd_wins7: "通關七次", bd_streak7: "海上一週", bd_streak14: "雙週船長", bd_wins30: "通關三十次",
});

// ---------- the data (pure) ----------
const freshRewards = () => ({ v: 1, days: {}, owned: [], badges: [], wins: 0, paint: "" });
const rewardKind = id => id.split(":")[0], rewardRef = id => id.split(":")[1];
const rewardName = id => t(({ color: "fc_", emblem: "fe_", paint: "hp_" })[rewardKind(id)] + rewardRef(id));
const hasDay = (days, n) => Object.prototype.hasOwnProperty.call(days, n);
function sanitizeRewards(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return freshRewards();
  const ids = list => (Array.isArray(list) ? list : []), uniq = list => [...new Set(list)];
  const owned = uniq(ids(raw.owned).filter(id => REWARD_ITEMS.includes(id))), badges = uniq(ids(raw.badges).filter(id => REWARD_BADGES.some(b => b.id === id)));
  const days = {};
  for (const [k, v] of Object.entries(raw.days && typeof raw.days === "object" && !Array.isArray(raw.days) ? raw.days : {}))
    if (/^[1-9]\d{0,5}$/.test(k) && typeof v === "string" && (v === "" || REWARD_ITEMS.includes(v))) days[k] = v;
  const keys = Object.keys(days).map(Number).sort((a, b) => b - a).slice(0, REWARD_KEEP);
  const wins = Math.min(1e6, Math.max(Math.floor(Number(raw.wins)) || 0, 0));
  const paint = typeof raw.paint === "string" && owned.includes("paint:" + raw.paint) ? raw.paint : "";
  return { v: 1, days: Object.fromEntries(keys.map(k => [k, days[k]])), owned, badges, wins, paint };
}
// Consecutive daily numbers cleared, counting back from n.
function rewardStreak(days, n) { let k = 0; while (hasDay(days, n - k)) k++; return k; }
// A finished daily run of number n. Only a win earns, and only the first win of that number. Never mutates.
// Returns { store, status: "new" | "done" | "none" | "lost", item: id | null, badges: [new badge ids] }.
function rewardClaim(store, n, won) {
  const s = sanitizeRewards(store);
  if (!won) return { store: s, status: "lost", item: null, badges: [] };
  if (hasDay(s.days, n)) return { store: s, status: "done", item: null, badges: [] };
  const item = REWARD_ITEMS.find(id => !s.owned.includes(id)) || null, days = { ...s.days, [n]: item || "" }, wins = s.wins + 1, streak = rewardStreak(days, n);
  const badges = REWARD_BADGES.filter(b => !s.badges.includes(b.id) && (b.wins ? wins >= b.wins : streak >= b.streak)).map(b => b.id);
  const next = sanitizeRewards({ ...s, days, wins, owned: item ? [...s.owned, item] : s.owned, badges: [...s.badges, ...badges] });
  return { store: next, status: item || badges.length ? "new" : "none", item, badges };
}
const rewardEquipPaint = (store, paint) => { const s = sanitizeRewards(store); return paint === "" || s.owned.includes("paint:" + paint) ? { ...s, paint } : s; };
function loadRewards() { try { return sanitizeRewards(JSON.parse(localStorage.getItem(REWARDS_KEY))); } catch (e) { return freshRewards(); } }
let rewardsCache = null;
const rewardsNow = () => rewardsCache || (rewardsCache = loadRewards());
function saveRewards(store) { rewardsCache = store; try { localStorage.setItem(REWARDS_KEY, JSON.stringify(store)); } catch (e) { console.error("Could not save the daily rewards:", e); } }
// What the flag card may offer beyond the base lists, and the hull paint now worn ("" = the standard hull).
const rewardOwned = kind => rewardsNow().owned.filter(id => rewardKind(id) === kind).map(rewardRef);
const rewardPaint = () => rewardsNow().paint;
const rewardBadgeNames = (store = rewardsNow()) => store.badges.map(id => t("bd_" + id));
// "Badges: A · B +2" for the share card, "" with none.
function rewardBadgeLine(store = rewardsNow()) {
  const names = rewardBadgeNames(store);
  return names.length ? `${t("rwBadges")}: ${names.slice(0, 2).join(" · ")}${names.length > 2 ? ` +${names.length - 2}` : ""}` : "";
}

// ---------- the result screen ----------
function rewardHtml(r) {
  if (!r) return "";
  const kindKey = id => "rwKind" + ({ color: "Color", emblem: "Emblem", paint: "Paint" })[rewardKind(id)], lines = [];
  if (r.item) lines.push(`<li><b>${t("rwNew", { what: `${t(kindKey(r.item))} · ${rewardName(r.item)}` })}</b></li>`);
  for (const b of r.badges || []) lines.push(`<li><b>${t("rwBadgeNew", { what: t("bd_" + b) })}</b></li>`);
  const note = r.status === "new" ? (r.item ? t("rwEquip") : "") : t(r.status === "done" ? "rwDone" : r.status === "lost" ? "rwLost" : "rwNone");
  return `<section class="rewards"><h2>${t("rwTitle")}</h2>${lines.length ? `<ul class="vs-list">${lines.join("")}</ul>` : ""}${note ? `<p class="hint-s">${note}</p>` : ""}</section>`;
}

// ---------- the flag card: the paint row (js/flags.js renderFlagCard) ----------
function paintRow() {
  const owned = rewardOwned("paint"), cur = rewardPaint(), label = t("rwPaint");
  if (!owned.length) return "";
  const opt = (id, hex, nm) => `<button type="button" class="fl-sw${id === cur ? " on" : ""}" data-paint="${id}" role="radio" aria-checked="${id === cur}" aria-label="${nm}" title="${nm}"><i style="background:${hex}"></i></button>`;
  return `<div class="fl-row" role="radiogroup" aria-label="${label}"><span class="fl-lab">${label}</span><span class="fl-opts">` +
    opt("", LIVERY.player.hull, t("rwPaintStd")) + owned.map(id => opt(id, HULL_PAINTS[id], t("hp_" + id))).join("") + `</span></div>`;
}
flagEl.addEventListener("click", ev => {
  const b = ev.target.closest("button[data-paint]"); if (!b) return;
  saveRewards(rewardEquipPaint(rewardsNow(), b.dataset.paint));
  Snd.play("uiClick"); flagChanged();
});
