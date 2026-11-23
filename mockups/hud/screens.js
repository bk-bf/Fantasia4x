'use strict';
(() => {
  const D = HUD.data, { e, ico, gly, bdg, bar, btn, kv, win, hpClass } = HUD.ui;
  const tabs = (list, on, act) => list.map((t, i) => `<button class="tab${i === on ? ' on' : ''}" data-skin="${i === on ? 'cellOn' : 'cell'}"${act ? ` data-act="${act}:${i}"` : ''}><span>${e(t)}</span></button>`).join('');
  const thing = (c, id, cls) => `<i class="thing ${cls || ''}" data-c="${c}" data-id="${id}"></i>`;
  const chk = (on, label, extra) => `<label class="chk${on ? ' on' : ''}"><i class="box" data-skin="${on ? 'cellOn' : 'well'}"></i><span>${label}</span>${extra || ''}</label>`;
  const search = ph => `<label class="search" data-skin="well">${gly('eye')}<span>${e(ph)}</span></label>`;
  const sec = (title, body, cls) => `<section data-skin="well" class="${cls || ''}"><h4>${title}</h4>${body}</section>`;

  function craftWin() {
    const lanes = D.queue.map(([at, jobs]) => `<div class="lane${jobs.length ? '' : ' empty'}"><h5>${e(at)}${jobs.length ? '' : ' · empty'}</h5>${jobs.length ? jobs.map(([id, nm, n, p, st]) => `<div class="qchip ${st}" data-skin="cell"><i class="qfill" style="width:${Math.round(p * 100)}%"></i><i class="grip">⠿</i>${ico(id)}<b>${e(nm)}${n > 1 ? ' ×' + n : ''}</b><em>${st === 'wait' ? 'waiting' : st === 'pause' ? 'paused' : Math.round(p * 100) + '%'}</em>${btn('', { glyph: st === 'pause' ? 'play' : 'pause', cls: 'mini' })}${btn('', { glyph: 'x', cls: 'mini' })}</div>`).join('') : '<p class="hint">drop a task here</p>'}</div>`).join('');
    const cards = D.recipes.map(r => {
      const can = r.st === 'craft', label = { craft: 'Craft', queue: 'Queue', blocked: 'Blocked' }[r.st];
      return `<article class="bcard rcard${r.st === 'blocked' ? ' short' : ''}" data-skin="well">
        <header><span class="sq sm" data-skin="well">${ico(r.id, 'hd')}</span><div><h5>${e(r.name)}</h5><span class="work">${gly('hammer')}${r.work}</span></div></header>
        <p>${e(r.text)}</p>
        <div class="at">${gly('flag')}<span>${e(r.at)}</span></div>${r.tools ? `<div class="at${r.locked ? ' neg' : ''}">${gly('axe')}<span>${r.tools}${r.locked ? ' (locked)' : ''}</span></div>` : ''}
        <ul class="cost">${r.cost.map(([ic, nm, need, have]) => `<li class="${have >= need ? '' : 'lack'}">${ico(ic)}<span>${e(nm)}</span><b>${need}</b><em>${have}</em></li>`).join('')}</ul>
        <div class="rbtns">${btn(label, { skin: r.st === 'blocked' ? 'btnOff' : 'btn', cls: r.st === 'blocked' ? 'off main' : 'main' })}${r.st === 'blocked' ? '' : ['+3', '+5', '+10'].map(t => btn(t, { cls: 'plus' })).join('')}</div>
      </article>`;
    }).join('');
    return win('craft', 'Crafting', `<nav class="tabs cats">${tabs(D.craftCats, 0)}</nav>
      <section class="queue" data-skin="well"><h4>Queue <em>(4)</em></h4><div class="lanes">${lanes}</div></section>
      <div class="cards rcards">${cards}</div>`, { cls: 'big', tools: search('search recipes…') });
  }

  function researchWin() {
    const R = D.research, a = R.active, tier = ['T0', 'T1', 'T2'];
    const mats = R.materials.map(([k, n]) => kv(k, `<b class="${n ? 'good' : ''}">${n}</b>`)).join('');
    const open = R.open.map(r => `<article class="rs${r.st === 'no' ? ' short' : ''}" data-skin="well">
      <header><h5>${e(r.name)}</h5><span class="tier t${r.tier}">${tier[r.tier]}</span><em>${r.cat}</em></header>
      <p>${e(r.text)}</p>
      ${kv('Time', r.time + ' turns')}
      ${r.need.map(([k, n, have]) => kv('Need', `<span class="${have >= n ? '' : 'neg'}">${k}: ${n} <i class="dimt">(have ${have})</i></span>`)).join('')}
      ${r.prereq ? kv('Prereq', e(r.prereq)) : ''}${kv('Unlocks', e(r.unlocks))}
      ${btn(r.st === 'busy' ? 'Busy' : 'Unavailable', { skin: 'btnOff', cls: 'off' })}
    </article>`).join('');
    return win('research', 'Research', `<div class="rsgrid">
      <div class="rsside">${sec('Materials', mats)}${sec('Active research', `<h5 class="proj">${e(a.name)}</h5>${kv('Category', a.cat)}<div class="meter">${bar(a.prog, 'honey')}<span>${Math.round(a.prog * 100)}%</span></div><p class="it">${a.left} turns left</p>${btn('Cancel', {})}`)}</div>
      <div class="rsopen"><h4>Available <em>(${R.open.length})</em></h4><div class="rslist">${open}</div></div>
    </div>`, { cls: 'w-research' });
  }

  function exploreWin() {
    const n = D.found.reduce((s, r) => s + r[4], 0);
    const rows = D.found.map(([c, id, nm, type, cnt, pos], i) => `<div class="tr${i === 4 ? ' hover' : ''}">${c === 'plant' ? thing(c, id, 'half') : `<i class="dia ${type}">◆</i>`}<span>${e(nm)}</span><em>${type}</em><b>×${cnt}</b><em>(${pos})</em></div>`).join('');
    return win('explore', 'Discovered resources', `<p class="sub">${D.found.length} types · ${n} nodes</p><div class="table" data-skin="well"><div class="tr th"><span></span><span>Resource</span><span>Type</span><span>Count</span><span>Pos</span></div>${rows}</div>`, { cls: 'w-explore', tools: search('search resources…') });
  }

  function cultureWin() {
    const C = D.culture;
    const list = D.cultures.map(([nm, arch, n], i) => `<button class="li${i === 0 ? ' on' : ''}" data-skin="${i === 0 ? 'cellOn' : 'cell'}"><b>${e(nm)}</b><em>${e(arch)}</em><span>${n ? n + ' colonist' : 'none here'}</span></button>`).join('');
    const stats = C.stats.map(([k, lo, hi, plus]) => `<div class="meter"><em>${k}</em>${bar((lo + hi) / 40 + (plus || 0) / 20, (lo + hi) / 2 >= 13 ? 'leaf' : (lo + hi) / 2 >= 10 ? 'honey' : 'ember')}<span>${lo}–${hi}${plus ? ` <b class="good">+${plus}</b>` : ''}</span></div>`).join('');
    const traits = C.traits.map(([nm, who, txt, g, fx]) => `<div class="tcard${fx.some(f => f[2]) ? ' bad' : ''}" data-skin="cell">${bdg(g, fx.some(f => f[2]) ? 'neg' : 'trait')}<div><b>${nm}</b><em>${who}</em><p>${e(txt)}</p>${fx.map(([k, v, t]) => `<span class="pill ${t || ''}"><em>${k}</em>${v}</span>`).join('')}</div></div>`).join('');
    return win('culture', 'Cultures', `<div class="split"><nav class="list">${list}</nav><div class="detail">
      <h4>${C.name} <em>— ${C.epithet}</em></h4><p class="lore">${e(C.lore)}</p>
      <div class="grid g2">${sec('People', C.rows.map(([k, v]) => kv(k, e(v))).join('') + '<h5>Physique</h5>' + C.body.map(([k, v]) => kv(k, e(v))).join(''))}${sec('Stats <em>each born within</em>', stats)}</div>
      ${sec('Traits <em>1 shared · 3 possible</em>', `<div class="tcards">${traits}</div>`, 'wide')}
      ${sec('Relations', C.rel.map(([k, d, n, t]) => kv(k, `<span class="${t}">${d} (${n})</span>`)).join(''), 'wide')}
    </div></div>`, { cls: 'w-split' });
  }

  function kingdomWin() {
    const K = D.kingdom, unk = t => `<p class="it">${t}</p>`;
    const list = D.kingdoms.map(([nm, home, d, tier, t], i) => `<button class="li${i === 0 ? ' on' : ''}" data-skin="${i === 0 ? 'cellOn' : 'cell'}"><b>${e(nm)}</b>${home ? `<em>⌂ ${home}</em>` : ''}<span><i class="${t}">${d}</i> · ${tier}</span></button>`).join('');
    return win('kingdoms', 'Kingdoms', `<div class="split"><nav class="list">${list}</nav><div class="detail">
      <h4>${e(K.name)} <em class="good">${K.disp}</em></h4><p class="lore">${e(K.epithet)}; ${e(K.temper)}. <i class="dimt">${K.via}.</i></p>
      <div class="grid g2">
        ${sec('Peoples', K.peoples.map(([k, n]) => `<div class="meter ppl"><em>${e(k)}</em>${bar(n / 10, 'honey')}<span>${n * 10}%</span></div>`).join(''))}
        ${sec('Court & coffers', K.court.map(([k, v]) => kv(k, e(v))).join(''))}
        ${sec('Lands', K.lands.map(([k, v]) => kv(k, e(v))).join(''))}
        ${sec('Standing', K.standing.map(([k, d, t]) => kv(k, `<span class="${t}">${d}</span>`)).join(''))}
        ${sec('Chronicle', unk('Their past, and the names that shaped it, unknown.'))}
        ${sec('Famed works', unk('What treasures they forge and hoard, unknown.'))}
      </div>
    </div></div>`, { cls: 'w-split' });
  }

  function entityWin() {
    const hostile = D.mobs.filter(m => m[2] === 'hostile').length;
    const limbs = D.mobLimbs.map(([nm, pct, parts, bleed]) => `<div class="limb"><div class="limb-h"><b>${nm}</b><span class="${hpClass(pct / 100)}">${pct}%${bleed ? ` <i class="neg">▼${bleed}</i>` : ''}</span></div>${parts.map(([pn, hp, max, w]) => `<div class="part"><span>${pn}</span><span class="${hpClass(hp / max)}">${hp}/${max}</span>${w ? `<span class="wd">· ${w}</span>` : ''}</div>`).join('')}</div>`).join('');
    const rows = D.mobs.map(([id, nm, type, blood, worst, pain, st, pos, open]) => `<div class="tr${open ? ' on' : ''}"${open ? ' data-skin="cellOn"' : ''}><i class="exp">${open ? '▾' : '▸'}</i>${thing('creature', id, 'half')}<span class="${type === 'hostile' ? 'neg' : ''}">${e(nm)}</span><em>${type}</em><b class="${hpClass(blood / 100)}">${blood}%</b><em class="${worst ? 'warn' : ''}">${worst || '—'}</em><b class="${pain > 15 ? 'warn' : ''}">${pain}%</b><em>${st}</em><em>(${pos})</em></div>${open ? `<div class="expand">${btn('Follow', { glyph: 'eye' })}<div class="elimbs">${limbs}</div></div>` : ''}`).join('');
    return win('entities', 'Live entities', `<p class="sub"><span class="neg">${hostile} hostile</span> · ${D.mobs.length - hostile} neutral · 1 corpse</p><div class="table ent" data-skin="well"><div class="tr th"><i></i><i></i><span>Entity</span><span>Type</span><span>Blood</span><span>Worst limb</span><span>Pain</span><span>State</span><span>Pos</span></div>${rows}</div>`, { cls: 'w-ent', tools: search('search entities…') });
  }

  HUD.relations = () => {
    const fam = D.family.map(([kin, nm, stage, where, k]) => `<div class="fam ${k}"><em>${kin}</em><b>${e(nm)}</b>${stage ? `<span class="good">${stage}</span>` : ''}${where ? `<p>${e(where)}</p>` : ''}</div>`).join('');
    const log = D.bondLog.map(([d, t, v, k, said]) => `<div class="blog"><em>${d}</em><span class="${k}">${said ? '▾ ' : ''}${e(t)}</span><b class="${k}">${v}</b></div>${said ? `<div class="said">${said.map(s => `<p>${e(s)}</p>`).join('')}</div>` : ''}`).join('');
    const bonds = D.bonds.map(([nm, stage, t, rom, v, tags, open]) => `<div class="bond${open ? ' on' : ''}"><div class="bh"><i>${open ? '▾' : '▸'}</i><b class="link">${e(nm)}</b><span class="${t}">${stage}</span>${rom ? `<span class="rom">${rom}</span>` : ''}</div><div class="meter">${bar((v + 100) / 200, v < 0 ? 'ember' : 'leaf')}<span class="${v < 0 ? 'neg' : 'good'}">${v > 0 ? '+' : ''}${v}</span></div>${tags.length ? `<div>${tags.map(g => `<span class="pill">${g}</span>`).join('')}</div>` : ''}${open ? `<div class="blogs">${log}</div>` : ''}</div>`).join('');
    return `<div class="grid g3 rel">${sec('Family', fam)}${sec('Bonds', `<div class="bonds">${bonds}</div>`)}</div>`;
  };

  HUD.zones = () => {
    const kinds = D.zoneKinds.map(([nm, g, txt, n]) => `<article class="bcard zcard" data-skin="well"><header>${gly(g, 'honey', 'big')}<div><h5>${nm}</h5><span class="work">${n ? n + ' active' : 'none yet'}</span></div></header><p>${e(txt)}</p>${btn('New', { glyph: 'flag' })}</article>`).join('');
    const zs = D.zones.map(([nm, g, tags, extra, on]) => `<div class="zrow${on ? ' on' : ''}"${on ? ' data-skin="cellOn"' : ''}>${gly(g, 'honey')}<b>${nm}</b>${tags.map(t => `<span class="pill">${t}</span>`).join('')}<span class="zb">${btn('Paint', {})}${extra ? btn(extra, { on }) : ''}${btn('Colour', {})}${btn('Delete', {})}</span></div>`).join('');
    const filt = D.zoneFilter.map(([k, on]) => chk(on, k)).join('');
    return `<div class="cards zcards">${kinds}</div><div class="grid zgrid">${sec('Active zones', zs)}${sec('Filter · Stockpile 1 <em>3 of 10 kinds</em>', `<div class="chks two">${filt}</div><div class="minis">${btn('Clear', {})}</div>`)}</div>`;
  };

  function tradeWin() {
    const T = D.trade, give = T.yours.reduce((s, r) => s + r[3] * r[4], 0), get = T.theirs.reduce((s, r) => s + r[3] * r[4], 0);
    const col = rows => rows.map(([id, nm, have, price, n]) => `<div class="trow${n ? ' on' : ''}">${ico(id)}<span>${e(nm)}</span><em>×${have}</em><em>${price}</em>${btn('−', { cls: 'mini' })}<b>${n}</b>${btn('+', { cls: 'mini' })}${btn('All', { cls: 'all' })}</div>`).join('');
    const head = '<div class="trow th"><i></i><span>Item</span><em>Have</em><em>Worth</em><span class="c4">Offered</span></div>';
    return win('trade', 'Trade', `<p class="sub">${e(T.who)} · ${e(T.by)} bargains</p>
      <div class="grid g2">${sec('Their wares', head + col(T.theirs))}${sec('Your stock', head + col(T.yours))}</div>
      <footer class="tfoot"><span>You receive <b>${get}</b></span><span>You give <b>${give}</b></span><span class="good">they accept</span>${btn('Trade', { skin: 'verb', cls: 'verb' })}</footer>`, { cls: 'w-trade' });
  }

  function migrantsWin() {
    const n = D.migrants.filter(m => m[3]).length;
    const cards = D.migrants.map(([nm, cult, kind, yes, good, bad]) => `<div class="mig${yes ? '' : ' off'}" data-skin="cell"><span class="well" data-skin="well"><i class="portrait" data-p="${kind}" data-size="40"></i></span><div><b>${nm}</b><em>${cult}</em><div>${good.map(g => `<span class="pill good">${g}</span>`).join('')}${bad.map(g => `<span class="pill warn">${g}</span>`).join('')}</div></div>${btn(yes ? 'Welcome' : 'Turn away', { on: yes, glyph: yes ? '' : 'x' })}</div>`).join('');
    return win('migrants', 'Migrants arrive', `<p class="lore">${D.migrants.length} wanderers have reached your colony, hoping to join.</p>${cards}<div class="mfoot">${btn(n ? `Welcome ${n} migrant${n > 1 ? 's' : ''}` : 'Turn them all away', { skin: 'verb', cls: 'verb' })}</div>`, { cls: 'modal w-migrants' });
  }

  function caravanWin() {
    const K = D.kingdom;
    return win('caravan', 'A caravan arrives', `<p class="lore">A trade caravan from ${e(K.name)} has crossed into your lands — laden beasts, watchful guards, and a trader at their head.</p><p class="it">${e(K.name)} — ${e(K.epithet)}.</p><p class="lore">The trader will linger a few days by the east road.</p><div class="mfoot">${btn('Receive them', { skin: 'verb', cls: 'verb', act: 'win:caravan' })}</div>`, { cls: 'modal w-caravan' });
  }

  function pauseWin() {
    const items = [['Resume', 'win:pause'], ['Save game'], ['Load game'], ['Settings', 'win:settings'], ['Exit to main menu'], ['Quit to desktop', '', 'neg']];
    return win('pause', 'Paused', `<div class="pmenu">${items.map(([t, act, c]) => btn(t, { act, cls: c || '' })).join('')}</div>`, { cls: 'modal w-pause' });
  }

  function settingsWin() {
    const ctl = ([k, kind, v, w, note]) => {
      if (kind === 'chk') return chk(v, `${e(k)}${w ? ` <i class="dimt">${e(w)}</i>` : ''}`);
      if (kind === 'slide') return `<div class="srow"><span>${e(k)}${note || ''}</span><div class="slider"><i class="track" data-skin="well"><i class="fill" style="width:${v}%"></i><i class="knob" data-skin="btn" style="left:${v}%"></i></i></div></div>`;
      return `<div class="srow"><span>${e(k)}</span><span class="seg">${v.map((o, i) => `<button class="segb${i === w ? ' on' : ''}" data-skin="${i === w ? 'cellOn' : 'cell'}"><span>${o}</span></button>`).join('')}</span></div>`;
    };
    const fix = r => (r[1] === 'slide' && r[3] ? [r[0], r[1], r[2], undefined, `<i class="dimt note">${e(r[3])}</i>`] : r);
    const secs = D.settings.map(([t, rows]) => `<section class="sset"><h5>${t}</h5>${rows.map(r => ctl(fix(r))).join('')}</section>`).join('');
    return win('settings', 'Settings', `<div class="scols">${secs}</div><div class="mfoot">${btn('Done', { act: 'win:settings' })}</div>`, { cls: 'modal w-settings' });
  }

  Object.assign(HUD.WIN, { craft: craftWin, research: researchWin, explore: exploreWin, culture: cultureWin, kingdoms: kingdomWin, entities: entityWin, trade: tradeWin, migrants: migrantsWin, caravan: caravanWin, pause: pauseWin, settings: settingsWin });
  HUD.WINS = Object.keys(HUD.WIN);
  HUD.MODAL = ['migrants', 'caravan', 'pause', 'settings'];

  const fillThings = root => root.querySelectorAll('i.thing:empty').forEach(el => {
    const c = HUD.art.thing(el.dataset.c, el.dataset.id, el.classList.contains('half'));
    if (c) el.append(c); else el.classList.add('none');
  });
  const fill = HUD.fill;
  HUD.fill = (root, skin) => { fillThings(root); fill(root, skin); };
})();
