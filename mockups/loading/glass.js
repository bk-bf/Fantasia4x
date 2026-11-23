'use strict';
(() => {
  const A = HUD.art, RAMP = A.RAMP, W = 44, H = 76, CX = 22, TOP = 9, BOT = 66, NECK = 37.5;
  const FRAME = {
    timber: { wood: RAMP.beam, metal: P.iron, sand: RAMP.ochre },
    vellum: { wood: RAMP.oakDark, metal: RAMP.brass, sand: RAMP.honey }
  };

  const bulb = (y, yc) => { const d = (y - yc) / 14.2; return d * d >= 1 ? 0 : 12.4 * Math.pow(1 - Math.pow(Math.abs(d), 2.4), 1 / 2.4); };
  const half = y => (y < TOP || y > BOT ? -1 : Math.max(Math.abs(y - NECK) < 2.6 ? 1.3 : 0, bulb(y, 23.2), bulb(y, 51.8)));
  const HALF = Array.from({ length: H }, (_, y) => half(y + .5));
  const inside = (x, y) => Math.abs(x + .5 - CX) <= HALF[y];
  const rim = (x, y) => inside(x, y) && (Math.abs(x + .5 - CX) > HALF[y] - 1.1 || !inside(x, y - 1) || !inside(x, y + 1));

  function frame(kind) {
    const f = FRAME[kind], wood = A.planks(W, H, { dir: 'h', ramp: f.wood, base: .5, seed: 11, lo: 3, hi: 4 });
    const cap = (x, y, y0) => {
      const r = y - y0, inset = r === 0 ? 2 : r === 1 ? 1 : r === 6 ? 2 : 0;
      if (x < inset || x > W - 1 - inset) return null;
      if (r === 0 || r === 6 || x === inset || x === W - 1 - inset) return P.ink;
      if (r === 3 && (x === 5 || x === W - 6 || x === CX - 1)) return f.metal[f.metal.length - 2];
      const c = wood(x, y);
      return r === 1 ? A.tone(c, 1.25) : r === 5 ? A.tone(c, .72) : c;
    };
    const post = (x, y, px) => {
      const d = x - px, wave = 1.6 + .7 * Math.cos((y - 23) / 14.3 * Math.PI) - (Math.abs(y - NECK) < 2 ? .5 : 0), ring = y === 11 || y === 64 || y === 37;
      if (Math.abs(d) > wave + (ring ? .9 : 0)) return null;
      if (Math.abs(d) > wave - .6 + (ring ? .9 : 0)) return P.ink;
      if (ring) return f.metal[d < 0 ? f.metal.length - 2 : 3];
      return rp(f.wood, .55 - d * .16 + (hash(x, y >> 2, 3) - .5) * .08, x, y, .7);
    };
    return A.paint(W, H, (x, y) => (y <= 6 ? cap(x, y, 0) : y >= H - 7 ? cap(x, y, H - 7) : post(x, y, 4) || post(x, y, W - 5)));
  }

  function sand(kind, f, tick) {
    const S = FRAME[kind].sand, ltop = TOP + 2.5 + (NECK - TOP - 2.5) * Math.pow(f, .82), hb = f <= 0 ? 0 : 4 + f * 16, base = f * 8, flowing = f > 0 && f < 1;
    const pileTop = BOT + 1 - Math.max(base, hb);
    return (x, y) => {
      if (!inside(x, y)) return null;
      const dx = Math.abs(x + .5 - CX), grainy = (hash(x, y, 21) - .5) * .14, shade = .62 - (x + .5 - CX) * .022 + grainy;
      if (y < NECK + 1) {
        const dip = flowing ? Math.max(0, 3.2 - dx * .7) * Math.min(1, f * 8) : 0;
        if (y >= ltop + dip && ltop < NECK) return rp(S, shade + (y < ltop + dip + 1 ? .18 : 0), x, y, .8);
      } else {
        const surf = Math.max(base, hb - dx * .62);
        if (y >= BOT + 1 - surf) return rp(S, shade + (y < BOT + 2 - surf ? .16 : 0), x, y, .8);
      }
      if (flowing && Math.abs(x + .5 - CX) < 1 && y > NECK - 1 && y < pileTop && hash(x, y - tick * 3, 7) > .3) return S[S.length - 2 - (hash(x, y + tick, 2) > .7 ? 1 : 0)];
      if (flowing && y > pileTop - 3 && y < pileTop && dx < 3 && hash(x, y + tick * 5, 9) > .82) return S[S.length - 1];
      return null;
    };
  }

  function glass(kind, f, tick) {
    const grain = sand(kind, f, tick);
    return A.paint(W, H, (x, y) => {
      if (!inside(x, y)) return null;
      const g = grain(x, y), d = x + .5 - CX;
      if (rim(x, y)) return [214, 232, 238, 200];
      if (Math.abs(d + HALF[y] * .55) < .6 && (y < NECK - 4 || (y > NECK + 4 && y < BOT - 6))) return g ? A.tone(g, 1.3) : [236, 246, 250, 150];
      return g || [176, 206, 222, 46];
    });
  }

  HUD.sandglass = { W, H, frame, glass };
})();
