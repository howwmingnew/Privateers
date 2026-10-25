"use strict";
// ---------- Cannonball sprites, reused ----------
// Every shot used to add a ball image and destroy it where it landed. Each add or remove makes Phaser re-sort the whole
// display list (hundreds of objects in a melee) and leaves garbage, so a landed ball's sprite is hidden and kept for the
// next shot instead. It stays at depth 7, so taking it back costs no sort. A ball sprite made anywhere else (the title's
// duel, a test's own shot) has no `pooled` mark and is destroyed as before.
const ballPool = [];
// A ball sprite at (x, y): a kept one if there is one, else a new one.
function ballSpr(x, y) {
  let spr;
  while ((spr = ballPool.pop()) && !spr.active);   // skip one that was destroyed behind the pool's back
  if (spr) return spr.setVisible(true).setPosition(x, y).setScale(1);
  spr = S.add.image(x, y, "ball").setDepth(7); spr.pooled = true;
  return spr;
}
// Ball b is done (landed, spent, or the sea was cleared): its sprite goes back to the pool, at most MAX_BALLS of them.
function ballFree(b) {
  if (b.spr.pooled && b.spr.active && ballPool.length < MAX_BALLS) { b.spr.setVisible(false); ballPool.push(b.spr); }
  else b.spr.destroy();
}
