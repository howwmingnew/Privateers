"use strict";
// ---------- Struck colours: a beaten merchant gives up instead of running for minutes ----------
// Below STRIKE_AT of her hull a fluyt strikes her colours: she slows to STRIKE_SLOW, her guns fall silent, a white flag
// replaces her house flag and her pennant comes down, and her cargo goes over the side at once as a loot crate. The
// next hit sinks her (hurt() sinks right after its "hurt" hook). Escort brigs are not fluyts and fight on.
Object.assign(STR.en, { toastStruck: "They struck their colors! Sail slowly alongside her to board.", fStruck: "Colors struck" });
Object.assign(STR.zh, { toastStruck: "對方降旗投降！放慢船速、貼緊船舷就能登船。", fStruck: "降旗投降" });
const STRIKE_AT = 0.35, STRIKE_SLOW = 0.3;
if (typeof LIVERY !== "undefined") for (const [k, base] of [["struck", "merchant"], ["struck_pirate", "pirate"], ["struck_navy", "navy"]])
  LIVERY[k] = { ...LIVERY[base], flag: "#f6f1e3", flag2: "#f6f1e3", pennant: "rgba(0,0,0,0)", pennant2: "rgba(0,0,0,0)" };

function strikeColors(e, src) {
  e.struck = true;
  e.maxSpeed *= STRIKE_SLOW;
  e.vol = {};   // no more volleys, and any warning glow goes out
  e.target = null; e.angry = 0;
  e.lootWas = e.loot || 0;   // boarding pays a share of it (js/boarding.js)
  if (e.merchant && e.loot > 0) { addCrate(e.x, e.y, e.loot, null); e.loot = 0; }   // a warship keeps hers: sinking it still pays the bounty
  if (typeof applyShipArt === "function") applyShipArt(e, e.cls, e.merchant ? "struck" : "struck_" + e.faction);
  if (e.badge) refreshBadge(e);
  if (onScreen(e.x, e.y)) {
    floatText(e.x, e.y - 44, t("fStruck"), "#f6f1e3", 16);
    const coach = typeof coachUp === "function" && coachUp();   // the white flag and the float say it; the coach card has the floor
    if (!coach && (src === player || dist(e, player) < 900)) toast(t("toastStruck"));
  }
}
// the tutorial's target starts at 40% hull: it must sink, not surrender, so the first kill gets its full payoff
const canStrike = s => s.merchant && !s.isPlayer && !s.boss && !s.escortOf && s.alive && !s.struck
  && !(typeof tut !== "undefined" && s === tut.target);
// A beaten warship may give up too, once, when her hull is nearly gone (not a boss, an escort, a fireship, a shore battery).
const canSurrender = s => (s.faction === "pirate" || s.faction === "navy") && !s.merchant && !s.isPlayer && !s.boss && !s.escortOf && !s.escort
  && !s.fixed && !(s.A && s.A.boom) && s.alive && !s.struck && !s.surrenderRolled;
function surrenderRoll() { return Math.random(); }   // a function so the browser test can fix the roll
function maybeSurrender(s, src) {
  if (!canSurrender(s) || !(s.hp > 0 && s.hp < s.maxHp * SURRENDER_AT)) return;
  s.surrenderRolled = true;   // one roll per ship; ordinary Math.random, the same in a daily run as anywhere else
  if (surrenderRoll() < SURRENDER_CHANCE) strikeColors(s, src);
}
onHook("ready", () => { if (typeof shipArt === "function") shipArt("fluyt", "struck", {}, S); });   // baked now, not mid-fight
onHook("hurt", (s, dmg, src) => {
  if (s.struck && s.alive && dmg > 0) { s.hp = 0; return; }   // one more hit sinks her
  if (canStrike(s) && s.hp > 0 && s.hp < s.maxHp * STRIKE_AT) strikeColors(s, src);
  else maybeSurrender(s, src);
});
// Fires burn a hull down without a hit, so check the burning ones too.
onHook("frame", () => { for (const e of enemies) if (e.burnT > 0 && e.hp > 0) {
  if (canStrike(e) && e.hp < e.maxHp * STRIKE_AT) strikeColors(e, e.burnSrc); else maybeSurrender(e, e.burnSrc);
} });
