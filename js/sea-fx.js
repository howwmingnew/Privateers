"use strict";
// ---------- Sea finish: a second wave pattern, a screen-fixed light grade, drifting sun glints ----------
// The open sea was one 256-px scallop tile at two scales, and the repeat showed in every frame. Here the second layer
// gets its own pattern at scale 2.3 (the two never line up), a CSS gradient lights the centre and darkens the
// edges (composited once, no canvas cost), and a handful of additive glints twinkle on the water. The sea's base hue
// per ring is the depth gradient in js/scenery.js.
const GLINTS = VFX_LOW ? 12 : 20;
let glintImgs = [];

function bakeSeaFx(sc) {
  if (sc.textures.exists("wave2")) return;
  bakeCanvas(sc, "wave2", 256, 256, 1, c => {   // longer, thinner swells than "wave", at angles of their own
    const r = mulberry32(11);
    c.lineCap = "round";
    for (let i = 0; i < 18; i++) {
      const x = r() * 256, y = r() * 256, w = 18 + r() * 30, a = -0.35 + r() * 0.7;
      c.strokeStyle = `rgba(200,236,244,${0.25 + r() * 0.25})`; c.lineWidth = 1.4 + r();
      for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {   // wrap the strokes so the tile has no seams
        c.beginPath(); c.arc(x + ox, y + oy, w, Math.PI * 1.2 + a, Math.PI * 1.8 + a); c.stroke();
      }
    }
  });
  bakeCanvas(sc, "fx-glint", 24, 8, 1, c => {   // sun on a wave crest: a short horizontal shimmer with a hot core
    const g = c.createRadialGradient(12, 12, 0, 12, 12, 12);   // a circle squashed to 24 x 8
    g.addColorStop(0, "rgba(255,255,240,1)"); g.addColorStop(0.3, "rgba(255,250,225,.5)"); g.addColorStop(1, "rgba(255,250,225,0)");
    c.save(); c.scale(1, 1 / 3); c.fillStyle = g; c.fillRect(0, 0, 24, 24); c.restore();
    c.fillStyle = "rgba(255,255,255,.85)"; c.fillRect(6, 3.5, 12, 1);
  });
}
onHook("ready", () => {
  bakeSeaFx(S);
  if (S.sea2) S.sea2.setTexture("wave2").setTileScale(2.3).setAlpha(0.2);
  glintImgs = Array.from({ length: GLINTS }, () => ({ img: S.add.image(0, 0, "fx-glint").setDepth(0.5).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0),
    ph: rand(0, TAU), sp: rand(0.6, 1.3), life: -1 }));
  if (!document.getElementById("seaGrade")) document.getElementById("game").insertAdjacentHTML("afterend", '<div id="seaGrade" aria-hidden="true"></div>');
});
// Each glint lives one twinkle (a sharp sin^4 flash), drifting with the swell, then reappears somewhere else in view.
onHook("frame", dt => {
  if (!glintImgs.length || !S || seaFrozen) return;
  const v = S.cameras.main.worldView, lk = typeof labelScale === "function" ? Math.min(labelScale(), 1.6) : 1;
  for (const g of glintImgs) {
    g.life -= dt * g.sp * 0.5;
    if (g.life <= 0 || !v.contains(g.img.x, g.img.y)) { g.life = 1; g.img.setPosition(v.x + Math.random() * v.width, v.y + Math.random() * v.height); }
    const w = Math.sin(Math.PI * (1 - g.life)), a = w * w * w * w;
    g.img.x += dt * 6; g.img.y += dt * 3;
    g.img.setAlpha(a * 0.6).setScale((0.5 + 0.5 * a) * lk, (0.5 + 0.3 * a) * lk);
  }
});
