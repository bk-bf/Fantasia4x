'use strict';
const DOWNGRADE_MOTION = (() => {
  Object.assign(GAITS, {
    limp: { off: [.5, 0, 0, .5], duty: .66, S: .72, H: .3 },
    hobble: { off: [.5, 0, 0, .5], duty: .5, S: 1, H: .45 },
    shamble: { off: [.5, .75, 0, .25], duty: .66, S: .86, H: .2 },
    stiff: { off: [.5, .75, 0, .25], duty: .74, S: .55, H: .1 },
    stiffTrot: { off: [.5, 0, 0, .5], duty: .56, S: .85, H: .16 },
  });
  const swing = (u, g, leg) => { const G = GAITS[g]; let ph = (u + G.off[leg]) % 1; return ph < G.duty ? 0 : Math.sin(Math.PI * (ph - G.duty) / (1 - G.duty)); };
  const bad = (o, u, g) => o.limp === 'hind'
    ? { slot: 2, foot: [-o.leg * .9 - 2 + o.leg * .35 * (g ? swing(u, g, 0) : 0), 0], lurch: g ? swing(u, g, 0) : 0, pitch: 2.4 }
    : { slot: 3, foot: [o.leg * .12, o.leg * .46], lurch: g ? swing(u, g, 1) : 0, pitch: -1.5 };
  const lame = (g, k) => (u, c) => {
    const o = c.o, b = bad(o, u, g), feet = g ? gaitFeet(o, g, u) : still4.map(f => f.slice());
    feet[b.slot] = b.foot;
    const w = b.lurch * k;
    return life(c, { feet, pitch: b.pitch * w, by: .3 + w * (o.limp === 'hind' ? .6 : .8), head: [1, 1 + w * 2], snout: 4 + w * 10, ear: w > .5 ? -1 : 0, tail: { a: 18, w: .4, ph: u * TAU } });
  };
  const low = c => (c.o.leg * .32);
  const ANIMS = {
    gaunt: {
      idle: { ...QUAD_ANIMS.idle, pose(u, c) { return life(c, { feet: still4, by: .6, head: [2, low(c) + (u > .5 ? .5 : 0)], snout: 18, ear: -1, tail: { a: 30 } }); } },
      walk: { label: 'Walking, head low', group: 'Creatures', gait: 'shamble', n: 8, pose(u, c) { return life(c, { feet: gaitFeet(c.o, 'shamble', u), by: .6 + sn(u * 2) * .4, head: [2, low(c) + sn(u * 2 + .2) * .8], snout: 18, ear: -1, tail: { a: 30, w: .4, ph: u * TAU } }); } },
      trot: { label: 'Trotting, head low', group: 'Creatures', gait: 'trot', n: 8, pose(u, c) { return { ...QUAD_ANIMS.trot.pose(u, c), head: [2, low(c) - Math.abs(sn(u)) * .6], snout: 14, ear: -1, tail: { a: 24, w: .6, ph: u * TAU * 2 } }; } },
    },
    crippled: {
      idle: { ...QUAD_ANIMS.idle, pose: lame(null, 0) },
      walk: { label: 'Limping', group: 'Creatures', gait: 'limp', n: 8, pose: lame('limp', 1) },
      trot: { label: 'Hobbling', group: 'Creatures', gait: 'hobble', n: 8, pose: lame('hobble', 1.4) },
      run: { label: 'Hobbling', group: 'Creatures', gait: 'hobble', n: 8, pose: lame('hobble', 1.6) },
    },
    grizzled: {
      idle: { ...QUAD_ANIMS.idle, pose(u, c) { return life(c, { feet: still4, by: .3, head: [1, 1], snout: 6, tail: { a: 16 } }); } },
      walk: { label: 'Walking stiffly', group: 'Creatures', gait: 'stiff', n: 8, pose(u, c) { return life(c, { feet: gaitFeet(c.o, 'stiff', u), by: .3, head: [1, 1.2 + sn(u * 2) * .3], snout: 6, tail: { a: 16, w: .2, ph: u * TAU } }); } },
      trot: { label: 'Trotting stiffly', group: 'Creatures', gait: 'stiffTrot', n: 8, pose(u, c) { return { feet: gaitFeet(c.o, 'stiffTrot', u), by: .3 - Math.abs(sn(u)) * .5, head: [1, 1], snout: 6, tail: { a: 10, w: .3, ph: u * TAU } }; } },
    },
  };
  ANIMS.gaunt.run = { ...QUAD_ANIMS.run, label: 'Running, head low', pose(u, c) { return { ...QUAD_ANIMS.run.pose(u, c), head: [2, low(c) * .7], tail: { a: 10 } }; } };
  ANIMS.grizzled.run = ANIMS.grizzled.trot;
  const SETS = {};
  for (const form in ANIMS) SETS[form] = { ...QUAD_ANIMS, ...ANIMS[form] };

  const PW = PAWN_ANIMS.walk, swingP = u => { const ph = u - Math.floor(u); return ph < .58 ? 0 : Math.sin(Math.PI * (ph - .58) / .42); };
  const pawnWalk = (label, dist, f) => ({ ...PW, label, dist, pose(u, c) { const p = PW.pose(u, c); return c.face === 's' ? f(p, u, c) : p; } });
  const PSETS = {
    gaunt: { ...PAWN_ANIMS, walk: pawnWalk('Walking, head low', 17, p => ({ ...p, lean: 2, hd: [1, 1], by: p.by + .3 })) },
    crippled: { ...PAWN_ANIMS, walk: pawnWalk('Limping on a crutch', 12, (p, u) => { const w = swingP(u); return { ...p, fl: [stride(u + .5, .58, 11, 3.2)[0] * .3 - 2, 0], by: p.by + w * 1.4, lean: 1 + w * 1.5 }; }) },
    grizzled: { ...PAWN_ANIMS, walk: pawnWalk('Walking stiffly', 12, (p, u) => ({ ...p, fr: stride(u, .66, 6.5, 1.2), fl: stride(u + .5, .66, 6.5, 1.2), by: .3, lean: 2, hd: [1, 1] })) },
  };

  const actorOf = mkActor;
  mkActor = function (rig, kind, over) {
    const A = actorOf(rig, kind, over), b = rig === 'quad' ? BEASTS[kind] : rig === 'pawn' ? PAWNS[kind] : null;
    if (b && b.o.downgrade) A.anims = (rig === 'quad' ? SETS : PSETS)[b.o.downgrade];
    return A;
  };

  const FORMS = ['gaunt', 'crippled', 'grizzled'];
  const pace = id => DOWNGRADES.forms[DOWNGRADE_LOOK.looks[id].form].pace;
  const cells = () => Object.entries(DOWNGRADES.lines).flatMap(([line, L]) => {
    const look = DOWNGRADE_LOOK.looks[line + '_gaunt'];
    if (!look) return [];
    const rig = look.pawn ? 'pawn' : 'quad', kind = look.kind, table = rig === 'pawn' ? PAWNS : BEASTS;
    const size = rig === 'quad' ? bounds(rigQuad(kind, {})) : [0, 0, 72, 58], w = Math.max(112, size[2] - size[0] + 40), h = Math.max(92, size[3] - size[1] + 34);
    const v = rig === 'quad' ? BEASTS[kind].o.leg * 2.4 : 28 * FOLK[PAWNS[kind].o.race].legs / 10;
    const anims = k => { const d = table[k].o.downgrade; return d ? (rig === 'quad' ? SETS : PSETS)[d] : rig === 'quad' ? QUAD_ANIMS : PAWN_ANIMS; };
    const cell = (k, speed, name) => ({ id: 'dg-' + k, group: 'Creatures', label: name + ' · ' + anims(k).walk.label.toLowerCase(), follow: 1, w, h, cast: [{ rig, kind: k, steps: [['run', [1, 0], speed, 'walk']], at: [0, 0] }] });
    return [cell(kind, v, L.group), ...FORMS.map(f => cell(line + '_' + f, v * pace(line + '_' + f), table[line + '_' + f].name))];
  });
  if (typeof SHEET !== 'undefined') SHEET.CELLS.push(...cells());
  return { ANIMS, SETS, PSETS };
})();
