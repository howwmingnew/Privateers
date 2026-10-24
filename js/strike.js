"use strict";
// ---------- Struck colours: a beaten merchant gives up instead of running for minutes ----------
// Below STRIKE_AT of her hull a fluyt strikes her colours: she slows to STRIKE_SLOW, her guns fall silent, a white flag
// replaces her house flag and her pennant comes down, and her cargo goes over the side at once as a loot crate. The
// next hit sinks her (hurt() sinks right after its "hurt" hook). Escort brigs are not fluyts and fight on.
Object.assign(STR.en, { toastStruck: "They struck their colors!", fStruck: "Colors struck" });
Object.assign(STR.zh, { toastStruck: "對方降旗投降！", fStruck: "降旗投降" });
const STRIKE_AT = 0.35, STRIKE_SLOW = 0.3;
if (typeof LIVERY !== "undefined") LIVERY.struck = { ...LIVERY.merchant, flag: "#f6f1e3", flag2: "#f6f1e3", pennant: "rgba(0,0,0,0)" };

function strikeColors(e, src) {
  e.struck = true;
  e.maxSpeed *= STRIKE_SLOW;
  e.vol = {};   // no more volleys, and any warning glow goes out
  if (e.loot > 0) { addCrate(e.x, e.y, e.loot, null); e.loot = 0; }
  if (typeof applyShipArt === "function") applyShipArt(e, e.cls, "struck");
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
onHook("ready", () => { if (typeof shipArt === "function") shipArt("fluyt", "struck", {}, S); });   // baked now, not mid-fight
onHook("hurt", (s, dmg, src) => {
  if (s.struck && s.alive && dmg > 0) { s.hp = 0; return; }   // one more hit sinks her
  if (canStrike(s) && s.hp > 0 && s.hp < s.maxHp * STRIKE_AT) strikeColors(s, src);
});
// Fires burn a hull down without a hit, so check the burning ones too.
onHook("frame", () => { for (const e of enemies) if (e.burnT > 0 && canStrike(e) && e.hp > 0 && e.hp < e.maxHp * STRIKE_AT) strikeColors(e, e.burnSrc); });
