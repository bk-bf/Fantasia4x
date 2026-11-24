'use strict';
const MOTION_FOLK = (() => {
  const PEOPLE = [
    { kind: 'marked', name: 'Horned man', culture: 'vexast', pawn: { sex: 'male', age: 36, height: 181, weight: 82, traits: ['gore-horns', 'head-scar-serious', 'one-eyed', 'pox-marked', 'goring-fangs'] }, look: { style: 'ponytail', beard: 'goatee', sleeves: 'long', hat: 'none', cloak: null } },
    { kind: 'kirtle', name: 'Woman in a kirtle', culture: 'rynek', pawn: { sex: 'female', age: 27, height: 166, weight: 61, traits: [] }, look: { style: 'braids', sleeves: 'long', apron: true, pouch: true, hat: 'none', cloak: null } },
    { kind: 'maimed', name: 'One-armed man', culture: 'krixul', pawn: { sex: 'male', age: 44, height: 172, weight: 74, traits: ['one-armed', 'one-legged', 'rending-claws', 'webbed-limbs'] }, look: { style: 'short', beard: 'full', sleeves: 'long', hat: 'none', cloak: null } },
    { kind: 'winged', name: 'Winged woman', culture: 'rynock', pawn: { sex: 'female', age: 23, height: 158, weight: 55, traits: ['wings', 'prehensile-tail', 'nub-horns', 'feathered'] }, look: { style: 'long', sleeves: 'rolled', apron: false, hat: 'none', cloak: null } },
  ];
  const GROUP = 'Composed folk', PACE = 19, AXE = { tool: 'axe', shield: null }, BARE = { tool: null, shield: null };
  const P1 = (kind, steps, at, over) => ({ rig: 'pawn', kind: 'folk-' + kind, steps, at: at || [0, 0], over: over || BARE });
  const loop = (anim, o) => [['act', anim, 9999, o]];
  const WAYS = [['side', 'sideways', [1, 0]], ['toward', 'toward', [0, 1]], ['away', 'away', [0, -1]]];
  function cells(p) {
    const id = x => p.kind + '-' + x, label = x => p.name + ' · ' + x;
    return [
      ...WAYS.map(([w, text, dir]) => ({ id: id('walk-' + w), group: GROUP, label: label('walking ' + text), follow: 1, cast: [P1(p.kind, [['run', dir, w === 'side' ? 28 : 24, 'walk']])] })),
      { id: id('chop'), group: GROUP, label: label('woodcutting'), h: 132, cast: [P1(p.kind, loop('chop'), [-16, 0], AXE)], props: [['tree:oak', 12, -2]] },
      { id: id('chop-fb'), group: GROUP, label: label('woodcutting toward and away'), w: 136, cast: [P1(p.kind, loop('chop', { face: 'f' }), [-30, 0], AXE), P1(p.kind, loop('chop', { face: 'b' }), [30, -2], AXE)] },
      ...WAYS.map(([w, text, dir]) => ({ id: id('carry-' + w), group: GROUP, label: label('carrying ' + text), follow: 1, loads: ['wild_oats'], hold: 'bulky', w: 120, h: 108, cast: [P1(p.kind, [['run', dir, PACE, 'heft']])] })),
      { id: id('sit'), group: GROUP, label: label('sitting'), cast: [P1(p.kind, loop('sit'))], props: [['stool', -3, -1]] },
      { id: id('idle'), group: GROUP, label: label('standing'), cast: [P1(p.kind, loop('idle', { face: 'f' }))] },
      { id: id('sleep'), group: GROUP, label: label('sleeping'), cast: [P1(p.kind, loop('sleep'))] },
      { id: id('out'), group: GROUP, label: label('unconscious'), cast: [P1(p.kind, loop('out'))], ox: 4 },
      { id: id('downed'), group: GROUP, label: label('blow, stagger, collapse'), w: 128, cast: [P1(p.kind, [['act', 'guard', 1.4], ['act', 'hit', .42], ['act', 'stagger', .9], ['act', 'fall', 1], ['act', 'down', 2.4]], [8, 0])], span: 3.72, t0: 1.4, n: 14 },
    ];
  }
  SHEET.CELLS.push(...PEOPLE.flatMap(cells));
  function init(data) {
    for (const p of PEOPLE) {
      const culture = data.cultures.find(c => c.id === p.culture), pawn = { id: 'motion-' + p.kind, ...p.pawn };
      LOOK_CAST['folk-' + p.kind] = { name: p.name, look: { ...pawnLookOf(pawn, culturePreference(culture), data.traitRarity), ...p.look } };
    }
  }
  return { init, GROUP };
})();
