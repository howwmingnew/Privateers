"use strict";
// ---------- Plunder: sortie streak, warship bounties, wrecks, ship trade-in ----------
// Push your luck: every ship you sink this sortie adds STREAK_STEP to the sale price of the whole hold (up to
// STREAK_MAX), paid when you dock. Going down loses the streak and half the hold; the other half waits at the wreck.
// Warships (pirate and navy, forts included) also pay BOUNTY_K of their loot in gold on the spot, which takes no hold
// space; the rest floats as cargo. Merchants carry only cargo.
const STREAK_STEP = 0.1, STREAK_MAX = 1;
const BOUNTY_K = 0.4;
const WRECK_KEEP = 0.5;
const TRADE_IN = 0.6;   // buying a ship credits back this share of the gold spent on the old ship's yard upgrades
Object.assign(STR.en, {
  streakChip: "Plunder streak {k} · sale +{p}%", fStreak: "Streak +{p}%", fBounty: "+{n} gold bounty",
  soldStreak: "Sold the hold for <em>{n} gold</em>, plunder streak +{p}% included. Hull repaired.",
  toastSunkHalf: "Your ship went down. Half the cargo waits at the wreck; the streak is lost.",
  sunkWreckHalf: "The crew swam ashore and the shipwright patched the hull for free. Half the hold was lost and your plunder streak with it; <em>{n} cargo</em> waits at the wreck (red ✕ on the map) until you recover it, even if you close the game.",
  shipsHint: "A new ship starts with hull, sails and hold back at Lv 1, but the yard pays back 60% of what you spent refitting the old one. Your cannons move aboard.",
  tradeIn: " · trade-in <b>−{n}</b>",
  boughtShipTrade: "The <em>{ship}</em> is yours. The yard paid <em>{n} gold</em> for your old refit. Hull, sails and hold start again at Lv 1, and your cannons are aboard.",
});
Object.assign(STR.zh, {
  streakChip: "連續劫掠 {k} · 售價 +{p}%", fStreak: "連勝 +{p}%", fBounty: "+{n} 金幣賞金",
  soldStreak: "貨艙賣得 <em>{n} 金幣</em>，已含連續劫掠加成 +{p}%。船體已修好。",
  toastSunkHalf: "你的船沉了。一半貨物留在殘骸那裡，連續劫掠也中斷了。",
  sunkWreckHalf: "船員游上了岸，造船廠免費修好了船體。貨艙損失了一半，連續劫掠加成也沒了；<em>{n} 貨物</em>留在殘骸那裡（地圖上的紅色 ✕），直到你撈回來，關掉遊戲也不會消失。",
  shipsHint: "換新船後，船體、船帆、貨艙的升級會從 Lv 1 重新開始，但造船廠會退還舊船改裝費用的 60%。火砲會一起搬上新船。",
  tradeIn: " · 舊船折抵 <b>−{n}</b>",
  boughtShipTrade: "<em>{ship}</em>是你的了。造船廠為舊船的改裝付了 <em>{n} 金幣</em>。船體、船帆、貨艙從 Lv 1 重新開始，火砲已經搬上船。",
});

let streak = 0;   // ships the player has sunk this sortie
const streakBonus = () => Math.min(STREAK_MAX, streak * STREAK_STEP);

// From sink() for every enemy: blasts a fireship, pays the player's bounty and streak, floats the rest as cargo.
// Returns the loot crate, if any.
function lootDrop(s, killer) {
  s.killedBy = killer;
  if (s.A && s.A.boom) fireshipBoom(s);
  let value = s.loot || 0;
  if (killer === player && player.alive) {
    streak++;
    const warship = s.faction === "pirate" || s.faction === "navy";
    if (warship && value > 0) {
      const g = Math.round(value * BOUNTY_K);
      save.gold += g; value -= g; persist();
      floatText(s.x, s.y - 52, t("fBounty", { n: fmt(g) }), "#ffe08a", 15);
      Snd.play("coin", { amount: g, delay: 0.2 });
    }
    if (streak * STREAK_STEP <= STREAK_MAX + 1e-9) floatText(s.x, s.y + 8, t("fStreak", { p: Math.round(streakBonus() * 100) }), "#9fe0a0", 14);
  }
  return value > 0 ? addCrate(s.x, s.y, value, null) : null;
}
// Docking: the hold sells at the streak's price, and the streak ends with the sortie either way.
function sellHold(kind) {
  const bonus = kind === "return" ? streakBonus() : 0, sold = Math.round(cargo * (1 + bonus));
  streak = 0; streakChip();
  return { sold, bonus };
}

// HUD chip under the cargo bar, shown while a streak is running.
const streakEl = (() => {
  const bars = typeof document.querySelector === "function" && document.querySelector("#hud .bars"); if (!bars) return null;
  const el = document.createElement("div"); el.id = "streak"; el.className = "streak"; el.hidden = true;
  bars.insertBefore(el, bars.querySelector(".lang")); return el;
})();
let streakShown = "";
function streakChip() {
  if (!streakEl) return;
  const key = streak > 0 && !docked ? `${lang}:${streak}` : "";
  if (key === streakShown) return;
  streakShown = key; streakEl.hidden = !key;
  if (key) { streakEl.innerHTML = t("streakChip", { k: streak, p: Math.round(streakBonus() * 100) }); streakEl.classList.toggle("max", streakBonus() >= STREAK_MAX); }
}

// ---------- Trade-in ----------
function yardSpend(s = save) {
  let g = 0;
  for (const k in YARD) for (let l = 1; l < s[k]; l++) g += YARD[k].cost(l, SHIPS[s.ship]);
  return g;
}
const tradeInCredit = id => Math.min(SHIPS[id].cost, Math.round(TRADE_IN * yardSpend()));
const shipNetCost = id => SHIPS[id].cost - tradeInCredit(id);
