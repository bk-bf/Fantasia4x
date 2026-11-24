'use strict';
(() => {
  const D = HUD.data, { e, ico, gly, bdg, cic, bar, btn, kv, meter, win } = HUD.ui;
  const chk = (on, label, extra) => `<label class="chk${on ? ' on' : ''}"><i class="box" data-skin="${on ? 'cellOn' : 'well'}"></i><span>${label}</span>${extra || ''}</label>`;
  const seg = (opts, on) => `<span class="seg">${opts.map((o, i) => `<button class="segb${i === on ? ' on' : ''}" data-skin="${i === on ? 'cellOn' : 'cell'}"><span>${o}</span></button>`).join('')}</span>`;
  const slider = v => `<div class="slider"><i class="track" data-skin="well"><i class="fill" style="width:${v}%"></i><i class="knob" data-skin="btn" style="left:${v}%"></i></i><b>${v}%</b></div>`;
  const thing = (c, id) => `<i class="thing" data-c="${c}" data-id="${id}"></i>`;
  const sec = (title, body, cls) => `<section data-skin="well" class="${cls || ''}"><h4>${title}</h4>${body}</section>`;
  const tip = (cls, title, body) => `<aside class="tip x-tip ${cls}" data-skin="tip"><h5>${title}</h5>${body}</aside>`;
  const card = (cls, top, rest) => `<section class="card x-card ${cls}" data-skin="card"><div class="c-top">${top}</div>${rest}</section>`;

  const X = {
    saves: () => win('saves', 'Load game', `<div class="x-saves">${[
      ['Tharnorn', 'Manual', 'Autumn · Day 14 · 5 colonists', 'Year 3 · saved at dusk', '2143069691'],
      ['Tharnorn', 'Autosave', 'Autumn · Day 13 · 5 colonists', 'Year 3 · saved at dawn', '2143069691'],
      ['Hollowmere', 'Manual', 'Spring · Day 2 · 3 colonists', 'Year 1 · saved at noon', '88104277']
    ].map(([n, k, line, when, seed], i) => `<div class="x-save${i === 0 ? ' on' : ''}" data-skin="${i === 0 ? 'cellOn' : 'well'}"><div><b>${n}</b> <span class="pill${k === 'Autosave' ? '' : ' warn'}">${k}</span><p>${line}</p><em>${when}</em></div><span class="x-seed">Seed ${seed}</span>${btn('Load', { cls: i === 0 ? 'go' : '' })}${btn('', { glyph: 'x', cls: 'mini', title: 'Delete' })}</div>`).join('')}</div>`, { cls: 'modal w-saves' }),

    savegame: () => win('savegame', 'Save game', `<div class="mfoot top">${btn('New save', { skin: 'verb', cls: 'verb' })}</div><p class="sub">or write over a save</p><div class="x-saves">${[
      ['Tharnorn', 'Manual', 'Autumn · Day 14 · 5 colonists', 'Year 3 · saved at dusk', true],
      ['Tharnorn', 'Autosave', 'Autumn · Day 13 · 5 colonists', 'Year 3 · saved at dawn', false]
    ].map(([n, k, line, when, ask]) => `<div class="x-save" data-skin="well"><div><b>${n}</b> <span class="pill${k === 'Autosave' ? '' : ' warn'}">${k}</span><p>${line}</p><em>${when}</em></div>${ask ? `<span class="x-ask">Write over it?</span>${btn('Yes', { cls: 'go' })}${btn('No', {})}` : btn('Write over', {})}</div>`).join('')}</div>`, { cls: 'modal w-saves' }),

    gameover: () => win('gameover', 'The colony is lost', `<p class="lore">The last fire at Tharnorn has gone out. Nobody is left to bank it.</p><div class="x-go">${kv('Souls lost', '5')}${kv('Days endured', '41')}${kv('Last to fall', 'Celia Graymane')}</div><div class="mfoot">${btn('Main menu', {})}${btn('Begin again', { skin: 'verb', cls: 'verb' })}</div>`, { cls: 'modal w-gameover' }),

    newgame: () => {
      const rows = [['Swamp', 28, 12, 80], ['Plains', 21, 10, 30], ['Forest', 11, 9, 50], ['Mountain', 40, 6, 15]];
      return win('newgame', 'A new land', `<div class="x-ng">
        <div class="x-ngtop"><span>Size</span>${seg(['Small', 'Middling', 'Vast'], 1)}<span>Seed</span><label class="search" data-skin="well"><span>2143069691</span></label>${btn('Roll', { glyph: 'bang' })}${btn('Reset', {})}</div>
        ${sec('Lands <em>share of the map, warmth and wet</em>', `<div class="x-ngh"><span></span><span>Share</span><span>Warmth</span><span>Wet</span></div>${rows.map(([n, s, t, w]) => `<div class="x-ngr">${chk(true, n)}${slider(s)}<div class="x-deg">${slider(Math.round((t + 10) * 2.5))}<b>${t}°</b></div>${slider(w)}</div>`).join('')}<div class="x-ngr">${chk(true, 'Water')}${slider(22)}<em>lakes and seas in the lowlands</em></div>`)}
        <div class="mfoot">${btn('Back', {})}${btn('Found the colony', { skin: 'verb', cls: 'verb' })}</div></div>`, { cls: 'modal w-newgame' });
    },

    hover: () => `<div class="x-hovermark mark x-anchor" data-at="pawn" data-dx="60" data-dy="-26" style="width:22px;height:22px"><i></i><i></i><i></i><i></i></div>` +
      tip('x-anchor x-hovertip', 'Forest floor', `<p>rich soil under an oak, wet from the night's rain</p>${kv('Footing', 'slow')}${kv('Light', 'dappled')}${kv('Warmth', '8°')}${kv('Damp', 'soaked')}${kv('Wind', 'a breeze')}${kv('Soil', 'rich')}`).replace('<aside', '<aside data-at="pawn" data-dx="92" data-dy="-12"'),

    creature: () => card('x-creature', `<span class="well" data-skin="well">${thing('creature', 'wolf')}</span><div class="c-id"><h3>Grey Wolf</h3><p>hostile · a lone hunter</p><p class="job">Stalking the goat pen</p></div>`,
      `<div class="c-bars">${meter(['Blood', .81, 'blood', '81%'])}${meter(['Pain', .22, 'ember', 'sharp'])}</div><div class="c-conds"><span class="cond warn">${cic('hamstring')}Left foreleg cut</span><span class="cond neg">${cic('bleeding')}Bleeding</span></div><div class="c-verbs">${btn('Hunt', { glyph: 'bow' })}${btn('Follow', { glyph: 'eye' })}${btn('Body', {})}</div>`),

    item: () => card('x-item', `<span class="well" data-skin="well">${ico('oak_log', 'hd')}</span><div class="c-id"><h3>Oak Log ×12</h3><p>lying by the west fence</p><p class="job">Vex will haul it to the yard</p></div>`,
      `<div class="c-bars">${meter(['Weight', .4, 'honey', '18 kg'])}${meter(['Rot', 0, 'leaf', 'sound'])}</div><div class="c-verbs">${btn('Haul', {})}${btn('Forbid', {})}${btn('Pick up', {})}</div>`),

    zonecard: () => card('x-zone', `<span class="well" data-skin="well">${gly('crate', 'honey', 'big')}</span><div class="c-id"><h3>Stockpile 1</h3><p>42 tiles · 3 kinds allowed</p><p class="job">31 of 42 tiles filled</p></div>`,
      `<div class="kv tog"><em>Fill first</em>${seg(['Low', 'Normal', 'High', 'First'], 1)}</div><div class="c-verbs">${btn('Filter', { on: true })}${btn('Paint', {})}${btn('Colour', {})}${btn('Delete', {})}</div>`),

    mood: () => win('mood', 'Mood · Greta', `${meter(['Mood', .64, 'honey', '64'])}<p class="x-trend good">▲ rising toward 70</p><h5>What weighs on her</h5>${[
      ['Ate a fine meal', '+8', 'good'], ['Warm hearth nearby', '+5', 'good'], ['Slept outside', '−6', 'neg'], ['Soaked to the skin', '−4', 'neg'], ['Lost Arvid', '−12', 'neg'], ['Friends close by', '+6', 'good']
    ].map(([k, v, t]) => `<div class="kv"><em>${k}</em><span class="${t}">${v}</span></div>`).join('')}`, { cls: 'w-mood' }),

    food: () => win('food', 'Food · Greta', `<h5>She may eat</h5><div class="chks">${[['bread', 'Bread', 24, true], ['smoked_meat', 'Smoked Meat', 41, true], ['cabbage', 'Cabbage', 86, true], ['venison', 'Venison', 12, false], ['wild_berries', 'Wild Berries', 18, true], ['turnip', 'Turnip', 63, false], ['apple', 'Apple', 30, true]].map(([i, n, c, on]) => chk(on, `${ico(i)}${n}`, `<em>${c}</em>`)).join('')}</div><div class="minis">${btn('Defaults', {})}${btn('All', {})}${btn('None', {})}</div>`, { cls: 'w-food' }),

    stores: () => win('stores', 'Stores · Oak Chest', `<div class="kv tog"><em>Fill first</em>${seg(['Low', 'Normal', 'High'], 1)}</div><p class="sub">holds 4 of 8 stacks</p><h5>Let into this store</h5><div class="chks two">${[['oak_log', 'Oak Log', true], ['pine_log', 'Pine Log', true], ['oak_plank', 'Oak Plank', true], ['branch', 'Branch', false], ['small_stone', 'Small Stone', false], ['plant_fiber', 'Plant Fiber', true], ['goat_wool', 'Goat Wool', false], ['linen_cloth', 'Linen Cloth', true]].map(([i, n, on]) => chk(on, `${ico(i)}${n}`)).join('')}</div><div class="minis">${btn('Defaults', {})}${btn('All', {})}${btn('None', {})}</div>`, { cls: 'w-stores' }),

    repair: () => win('repair', 'Repair · Stone Hearth', `${meter(['Sound', .58, 'leaf', '58%'])}<p class="sub">weather wears it; at nothing it falls</p>${kv('Needs', '3 stone or brick')}${chk(false, 'Leave it to wear')}<h5>Repair below</h5>${slider(60)}<h5>Mend with</h5><div class="chks">${[['small_stone', 'Small Stone', 204, true], ['fired_brick', 'Fired Brick', 0, true], ['limestone_block', 'Limestone Block', 46, false]].map(([i, n, c, on]) => chk(on, `${ico(i)}${n}`, `<em>${c}</em>`)).join('')}</div><h5>Mended by</h5><div class="chks">${[['Greta Thornfield', true], ['Tomas Quicksilver', true], ['Vex Proudfoot', false]].map(([n, on]) => chk(on, n)).join('')}</div>`, { cls: 'w-repair' }),

    banner: () => `<div class="verbtag x-banner" data-skin="tag"><span class="vt-n">Painting <b>Stockpile 1</b> · 6 × 4</span>${btn('Erase', { glyph: 'x' })}${btn('Done', { skin: 'verb', cls: 'verb' })}</div>`,

    ctx: () => `<div class="x-ctx x-anchor" data-at="pawn" data-dx="26" data-dy="-6" data-skin="tip">${['Equip Copper Knife', 'Wear Wool Cloak', 'Pick up Oak Log…', 'Drop Bread'].map((t, i) => `<button class="x-ci${i === 2 ? ' on' : ''}" data-skin="${i === 2 ? 'cellOn' : 'cell'}"><span>${t}</span></button>`).join('')}</div>` +
      `<div class="x-qty x-anchor" data-at="pawn" data-dx="216" data-dy="44" data-skin="tip"><h5>Pick up Oak Log</h5><div class="x-qrow">${btn('−', { cls: 'mini' })}<label class="search" data-skin="well"><span>6</span></label>${btn('+', { cls: 'mini' })}<em>of 12</em></div><div class="minis">${btn('Take', { cls: 'go' })}${btn('Cancel', {})}</div></div>`,

    overlays: () => `<div class="x-bubble x-anchor" data-at="pawn" data-dx="-34" data-dy="-74" data-skin="tag"><span>“Hold still. It's only the shoulder.”</span></div>` +
      `<div class="x-hp x-anchor" data-at="bear" data-dx="-16" data-dy="-48"><i class="bar" data-v=".46" data-ramp="ember"></i></div>` +
      `<div class="x-float x-anchor neg" data-at="bear" data-dx="18" data-dy="-70">−6 bite</div>` +
      `<div class="x-float x-anchor miss" data-at="bear" data-dx="-50" data-dy="-58">miss</div>` +
      `<div class="x-work x-anchor" data-at="pawn" data-dx="-16" data-dy="-48"><i class="bar" data-v=".62" data-ramp="honey"></i></div>` +
      `<div class="x-zzz x-anchor" data-at="hearth" data-dx="30" data-dy="10">z<i>z</i><b>Z</b></div>` +
      `<svg class="x-line x-anchor" data-at="pawn" data-dx="0" data-dy="0" width="220" height="120"><path d="M2 2 L210 110" /><circle cx="210" cy="110" r="5" /></svg>`,

    tips: () => tip('x-t1', 'Hit chance · 71%', `${kv('Melee skill 12', '+48%')}${kv('Dexterity 14', '+12%')}${kv('Bronze hatchet', '+6%')}${kv('Soaked', '−5%')}${kv('Wolf dodges', '−10%')}`) +
      tip('x-t2', 'Old burn', `<p>An old burn on the left upper arm, healed over but tight in the cold.</p>${kv('Work', '−5%')}${kv('Pain', '+3%')}${kv('Fades', 'in some seasons')}`) +
      tip('x-t3', 'Cast Bronze Hatchet', `<p>Poured in a clay mould and ground keen.</p>${kv('Cut', '11 to 16')}${kv('Swing', '1.4 s')}${kv('Felling', '×1.38')}${kv('Wear', 'keen')}${kv('Weight', '1.6 kg')}`) +
      tip('x-t4', 'Greta · Woodcutting', `${kv('Skill', '14 · best at')}${kv('Priority', 'urgent')}${kv('Felling', '×1.38')}${kv('Next after', 'Hauling')}`) +
      tip('x-t5', 'Strength 9 of 52', `<p>Born to 6–12 among the Syleth; grows with hauling and felling.</p>${kv('Carry', '42 kg')}${kv('Melee', '×0.94')}`),

    coltools: () => `<div class="x-coltools l">${btn('', { glyph: 'crate', cls: 'mini', title: 'Only kinds in store', on: true })}${btn('', { glyph: 'eye', cls: 'mini', title: 'Every kind' })}</div><div class="x-coltools r">${btn('', { glyph: 'x', cls: 'mini', title: 'Clear the chronicle' })}</div>` + tip('x-ctip', 'Wolves near the pasture', `<p>Two grey wolves came out of the birches at 13:52 and circled the goat pen.</p>${kv('Bites', '3 on Vex, 1 on a goat')}${kv('Blows', '4 from Greta, 2 landed')}${kv('Wolf', 'left foreleg cut, fled')}`),

    credits: () => win('credits', 'Fantasia', `<p class="lore x-cr-sub">a 4X colony chronicle</p><div class="x-cr">${[
      ['Design and code', ['bk']],
      ['Inspired by', ['RimWorld', 'Dwarf Fortress', 'Battle Brothers', 'Vintage Story', 'Cataclysm: Dark Days Ahead']],
      ['Tileset', ['Bitlands, DragonDePlatino']],
      ['Music', ['Alexandr Zhelanov', 'RandomMind']],
      ['Ambience', ['JC Sounds']]
    ].map(([r, l]) => `<section class="x-crb"><h5>${r}</h5>${l.map(n => `<p>${e(n)}</p>`).join('')}</section>`).join('')}</div><div class="mfoot">${btn('Close', {})}</div>`, { cls: 'modal w-credits' }),

    debug: () => win('debug', 'Debug', `<nav class="tabs cats">${['Menu', 'Log'].map((t, i) => `<button class="tab${i === 0 ? ' on' : ''}" data-skin="${i === 0 ? 'cellOn' : 'cell'}"><span>${t}</span></button>`).join('')}</nav><div class="grid g3">
      ${sec('Spawn', `<label class="search" data-skin="well"><span>Wild Berries × 50</span></label><div class="minis">${btn('Item', {})}${btn('All items', {})}${btn('Clear', {})}</div><label class="search" data-skin="well"><span>Pawns × 1</span></label><div class="minis">${btn('Pawns', {})}</div><label class="search" data-skin="well"><span>random × 5</span></label><div class="minis">${btn('Creatures', {})}</div>`)}
      ${sec('World', `<div class="kv tog"><em>Weather</em>${seg(['Clear', 'Rain', 'Snow', 'Fog'], 0)}</div><div class="kv tog"><em>Season</em>${seg(['Turn', 'Spr', 'Sum', 'Aut', 'Win'], 0)}</div><div class="kv tog"><em>Hour</em>${seg(['Turn', 'Dawn', 'Noon', 'Dusk', 'Night'], 2)}</div><h5>Snow</h5>${slider(20)}<h5>Ice</h5>${slider(0)}${chk(false, 'Research gate off')}`)}
      ${sec('Events and brushes', `<div class="minis">${btn('Caravan', {})}${btn('Visitors', {})}${btn('Migrants', {})}</div><h5>Brush</h5><div class="minis">${btn('Kill', {})}${btn('Revive', {})}${btn('Regrow', { on: true })}</div><div class="minis">${btn('Building', {})}${btn('Resource', {})}${btn('Stop', {})}</div><h5>Needs frozen</h5><div class="chks two">${['Hunger', 'Fatigue', 'Thirst', 'Hygiene'].map((n, i) => chk(i === 1, n)).join('')}</div><h5>Now playing</h5>${meter(['Music', .7, 'honey', 'Campaign'])}${meter(['Wind', .26, 'water', '26%'])}`)}
    </div>`, { cls: 'big' })
  };

  const LAYERS = [
    ['Head', [['head', 'Sackcloth Hood', 'worn', .7, 'sackcloth_hood']]],
    ['Torso', [['outer', '', '', 0, 'wicker_vest'], ['mid', 'Boarhide Jerkin', 'good', .9, 'boarhide_jerkin'], ['base', 'Linen Gambeson', 'frayed', .45, 'linen_gambeson']]],
    ['Main hand', [['main hand', 'Cast Bronze Hatchet', 'keen', .8, 'cast_bronze_hatchet']]],
    ['Off hand', [['off hand', '', '', 0, 'plank_round_shield']]],
    ['Hands', [['gloves', '', '', 0, 'linen_gloves'], ['bracers', 'Boarhide Bracers', 'good', .85, 'boarhide_bracers']]],
    ['Back', [['cloak', 'Wool Cloak', 'good', .9, 'wool_cloak'], ['pack', 'Linen Snapsack', 'worn', .6, 'linen_snapsack']]],
    ['Legs', [['greaves', 'Boarhide Greaves', 'worn', .55, 'boarhide_greaves']]],
    ['Feet', [['boots', 'Leather Boots', 'good', .85, 'hide_boots'], ['socks', 'Sackcloth Footwraps', 'worn', .5, 'sackcloth_footwraps']]]
  ];
  const TRINKETS = [['amulet', 'Tooth Necklace', 'tooth_necklace'], ['belt', 'Leather Belt', 'leather_belt'], ['ring', '', 'bronze_arm_ring'], ['ring', '', 'iron_signet_ring']];
  const INNATE = [['Thick Fur', 'pine', 'torso, under all else'], ['Budding Claws', 'paw', 'a blunt swipe']];
  const layered = () => {
    let tip = '';
    const cards = LAYERS.map(([name, layers], ci) => {
      const top = layers.find(l => l[1]) || layers[0], worn = !!top[1], open = ci === 1;
      const pips = layers.length > 1 ? `<span class="lg-pips">${layers.map(l => `<i class="lg-pip${l[1] ? ' on' : ''}${l === top ? ' top' : ''}" data-skin="${l[1] ? 'cellOn' : 'well'}" title="${l[0]}">${l[1] ? ico(l[4]) : ''}</i>`).join('')}</span>` : '<span class="lg-pips"></span>';
      const card = `<div class="lg-card${worn ? '' : ' empty'}${open ? ' hover' : ''}" data-skin="cell"><span class="sq" data-skin="well">${ico(top[4], 'hd')}</span><em>${name}</em><b>${worn ? e(top[1]) : '—'}</b>${worn ? bar(top[3], top[3] < .5 ? 'ember' : 'leaf', 'thin') : '<i class="lg-nobar"></i>'}${pips}</div>`;
      if (open) tip = `<aside class="tip lg-tip" data-skin="tip"><h5>${name} · ${layers.filter(l => l[1]).length} of ${layers.length} layers</h5>${layers.map(([slot, item, q, dur, id]) => `<div class="lg-row${item ? '' : ' empty'}">${ico(id)}<em>${slot}</em><b>${item ? e(item) : 'nothing'}</b><span>${q}</span></div>`).join('')}<div class="lg-row innate">${gly('pine', 'honey')}<em>innate</em><b>Thick Fur</b><span>always</span></div></aside>`;
      return card;
    }).join('');
    const foot = `<div class="lg-foot"><em>Innate</em>${INNATE.map(([n, g, t]) => `<span class="lg-innate" data-skin="well" title="${t}">${gly(g, 'honey')}<span>${n}</span></span>`).join('')}<em class="lg-tr-h">Trinkets</em>${TRINKETS.map(([slot, item, id]) => `<span class="sq lg-tr${item ? '' : ' empty'}" data-skin="well" title="${slot}${item ? ': ' + item : ''}">${ico(id)}</span>`).join('')}</div>`;
    return { well: `<section data-skin="well"><h4>Worn</h4><div class="lg-slots">${cards}</div>${foot}</section>`, tip };
  };
  X.gearlayers = () => { const lg = layered(); return HUD.WIN.pawns({ ...HUD.state, tab: 'gear' })
    .replace(/<section data-skin="well"><h4>Worn<\/h4><div class="slots">[\s\S]*?<\/div><\/section>/, () => lg.well)
    .replace(/<\/section>$/, () => lg.tip + '</section>')
    .replace('data-win="pawns"', 'data-win="gearlayers"')
    .replace('data-act="win:pawns"', 'data-act="win:gearlayers"')
    .replace('class="win w-pawns', 'class="win w-pawns w-gearlayers'); };

  Object.assign(HUD.WIN, X);
  HUD.WINS = Object.keys(HUD.WIN);
  HUD.MODAL.push('saves', 'savegame', 'gameover', 'newgame', 'credits');
  HUD.EXTRA = Object.keys(X);

  const anchors = () => {
    const marks = document.getElementById('marks'), hud = document.getElementById('hud');
    if (!marks || !hud) return;
    const ring = marks.querySelector('.pawnring'), box = marks.querySelector('.dragbox'), brs = marks.querySelectorAll('.mark');
    const at = {
      pawn: ring && ring.getBoundingClientRect(),
      bear: box && (() => { const r = box.getBoundingClientRect(); return { left: r.right + 60, top: r.top + r.height * .55, width: 0, height: 0 }; })(),
      hearth: brs[0] && brs[0].getBoundingClientRect()
    };
    const base = hud.getBoundingClientRect();
    hud.querySelectorAll('.x-anchor').forEach(el => {
      const r = at[el.dataset.at] || at.pawn;
      if (!r) return;
      el.style.left = Math.round(r.left - base.left + r.width / 2 + +(el.dataset.dx || 0)) + 'px';
      el.style.top = Math.round(r.top - base.top + r.height / 2 + +(el.dataset.dy || 0)) + 'px';
    });
  };
  const fill = HUD.fill;
  HUD.fill = (root, skin) => { anchors(); fill(root, skin); };
})();
