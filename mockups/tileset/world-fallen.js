'use strict';
(() => {
  const COLONIST = { race: 'human', tunic: P.leather, pants: P.furDark, hair: P.hay }, STILL = 1.9;
  function unconscious() {
    const s = rigPawnLie(COLONIST, { out: 1 });
    MOTION_FX.stars({ put: (x, y, c, glow) => s.set(x, y, c, glow) }, ...s.pts.daze, STILL);
    return s;
  }
  const limp = () => rigPawnLie(COLONIST, { out: 1 });
  WORLD_GEAR.add({ carried_pawn: { kind: 'body', tuck: 'low', figure: unconscious, carried: limp } });
})();
