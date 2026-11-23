'use strict';
(() => {
  const D = HUD.data, A = HUD.art;
  const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ico = (name, cls) => `<i class="ico ${cls || ''}" data-i="${name}"></i>`;
  const gly = (name, ramp, cls) => `<i class="gly ${cls || ''}" data-g="${name}"${ramp ? ` data-ramp="${ramp}"` : ''}></i>`;
  const bdg = (g, k) => `<i class="bdg" data-g="${g}" data-k="${k}"></i>`;
  const bar = (v, ramp, cls) => `<i class="bar ${cls || ''}" data-v="${v}" data-ramp="${ramp}"></i>`;
  const btn = (label, o) => {
    o = o || {};
    return `<button class="btn ${o.cls || ''}${o.on ? ' on' : ''}" data-skin="${o.on ? 'btnOn' : o.skin || 'btn'}"${o.act ? ` data-act="${o.act}"` : ''}${o.title ? ` title="${o.title}"` : ''}>${o.glyph ? gly(o.glyph, o.ramp) : ''}${label ? `<span>${e(label)}</span>` : ''}</button>`;
  };
  const kv = (k, v, cls) => `<div class="kv ${cls || ''}"><em>${e(k)}</em><span>${v}</span></div>`;
  const meter = ([k, v, ramp, word]) => `<div class="meter"><em>${e(k)}</em>${bar(v, ramp)}<span>${e(word)}</span></div>`;
  const hpClass = p => (p >= .99 ? 'good' : p >= .85 ? 'warn' : 'neg');
  const cond = ([name, kind, g]) => `<span class="cond ${kind}">${bdg(g, kind)}${e(name)}</span>`;
  const pills = () => D.sel.pills.map(([k, v, t]) => `<span class="pill ${t || ''}"><em>${k}</em>${v}</span>`).join('');

  function columns(state) {
    const stock = D.stock.map(g => `<h4>${g.group}</h4>` + g.rows.map(([ic, nm, n, f]) => `<div class="row${f ? ' ' + f : ''}">${ico(ic)}<span>${e(nm)}</span><b>${n}</b></div>`).join('')).join('');
    const log = D.log.map(([t, s, k]) => `<p class="${k || ''}"><em>${t}</em>${e(s)}</p>`).join('');
    return (state.hideL ? '' : `<aside class="col col-l"><canvas class="scrim"></canvas><div class="col-body">${stock}</div></aside>`) +
      (state.hideR ? '' : `<aside class="col col-r"><canvas class="scrim"></canvas><div class="col-body">${log}</div></aside>`);
  }
  function top(state) {
    const rib = ([n, k, win], i) => `<button class="ribbon${win && state.wins.includes(win) ? ' on' : ''}" data-skin="ribbon" data-dye="${i % 6}"${win ? ` data-act="win:${win}"` : ''}><span>${n}</span><kbd>${k}</kbd></button>`;
    const speeds = [['', state.paused, 'pause'], ['1×', !state.paused && state.speed === 1, 'speed1'], ['2×', !state.paused && state.speed === 2, 'speed2'], ['4×', !state.paused && state.speed === 4, 'speed4']]
      .map(([t, on, act]) => btn(t, { on, act, glyph: t ? '' : state.paused ? 'play' : 'pause', cls: 'spd' })).join('');
    const danger = D.log.filter(l => l[2] === 'danger').length;
    return `<div class="rail" data-skin="rail">
      <div class="b-l">${btn('', { glyph: state.hideL ? 'right' : 'left', act: 'side:L', cls: 'mini', title: state.hideL ? 'Show stores' : 'Hide stores' })}<h3>${D.settlement}</h3><span>${D.souls} souls</span></div>
      <div class="b-time"><span>${D.day} <i data-t="season"></i> Y${D.year}</span><b class="clock" data-t="clock"></b></div>
      <i class="b-gap"></i>
      <div class="b-wx"><i class="gly" data-g="sun" data-wx data-ramp="honey"></i><span data-t="temp"></span><span class="lab" data-t="weather"></span><span class="speeds">${speeds}</span></div>
      <div class="b-r">${state.hideR && danger ? `<b class="alarm">${danger}</b>` : ''}<h3>Chronicle</h3>${btn('', { glyph: state.hideR ? 'left' : 'right', act: 'side:R', cls: 'mini', title: state.hideR ? 'Show chronicle' : 'Hide chronicle' })}</div>
    </div>
    <div class="tc"><nav class="rib rib-l">${D.nav.slice(0, 5).map(rib).join('')}</nav><i class="gap"></i><nav class="rib rib-r">${D.nav.slice(5).map((n, i) => rib(n, i + 5)).join('')}</nav></div><canvas class="dialcv"></canvas>`;
  }
  function card(state) {
    const p = D.sel, has = w => state.wins.includes(w);
    if (has('fuel')) {
      const f = D.fuel;
      return `<section class="card bcardsel" data-skin="card"><div class="c-top"><span class="well" data-skin="well"><i class="bspr" data-b="hearth"></i></span><div class="c-id"><h3>${f.building}</h3><p>${f.burning}</p><div class="meter"><em>Fuel</em>${bar(f.level, 'ember')}<span>${Math.round(f.level * 100)}%</span></div></div></div>
        <div class="c-verbs">${btn('Fuel', { on: true, act: 'win:fuel' })}${btn('Stores', {})}${btn('Repair', {})}</div></section>`;
    }
    return `<section class="card" data-skin="card">
      <div class="c-top"><span class="well" data-skin="well"><i class="portrait" data-p="${p.kind}" data-size="48"></i></span>
        <div class="c-id"><h3>${p.name}</h3><p>${p.line}</p><p class="job">${p.job}</p></div></div>
      <div class="meter prog">${bar(p.progress, 'ember')}<span>${Math.round(p.progress * 100)}%</span></div>
      <div class="c-bars">${p.bars.map(meter).join('')}</div>
      <div class="c-conds">${p.conditions.map(cond).join('')}</div>
      <div class="c-verbs">${btn('Draft', { glyph: 'sword' })}${btn('Follow', { glyph: 'eye' })}${btn('Body', { on: has('body'), act: 'win:body' })}${btn('Mood', {})}${btn('Gear', { on: has('pawns') && state.tab === 'gear', act: 'win:pawns:gear' })}</div>
    </section>`;
  }
  const win = (name, title, body, o) => {
    o = o || {};
    return `<section class="win w-${name} ${o.cls || ''}" data-win="${name}" data-skin="win"><header class="wh" data-skin="winbar"><h3>${title}</h3><nav class="tabs">${o.tabs || ''}</nav>${o.tools || ''}${btn('', { glyph: 'x', act: 'win:' + name, cls: 'mini' })}</header><div class="wb">${body}</div>${o.extra || ''}</section>`;
  };

  const htip = (title, p, rows) => `<aside class="tip htip" data-skin="tip"><h5>${title}</h5>${p ? `<p>${e(p)}</p>` : ''}${rows.map(([k, v]) => kv(k, v)).join('')}</aside>`;
  const skillTip = ([k, lv, , , o]) => {
    const m = x => '×' + (0.7 + x * 0.03).toFixed(2);
    const kids = o.kids ? `<h6>Specialties</h6>${o.kids.map(([n, l, x]) => `<div class="skill"><em>${n}</em><b>${l}</b>${bar(x, 'honey', 'thin')}</div>`).join('')}` : '';
    return htip(`${k} · ${lv}`, '', [['Speed', m(lv)], ['Yield', m(lv * .6)], ['Quality', m(lv * .8)], ...o.from]).replace('</aside>', kids + '</aside>');
  };
  const skillRow = (s, stars) => {
    const [k, lv, xp, st, o] = s, star = n => '★'.repeat(n) + '<i>' + '★'.repeat(3 - n) + '</i>';
    const row = (n, l, x, kid) => `<em>${n}</em><b>${l}</b>${bar(x, 'honey', 'thin')}${stars && !kid ? `<span class="stars">${star(st)}</span>` : ''}`;
    const tog = o.kids ? ` onclick="this.classList.toggle('pin')"` : '';
    return `<div class="skill hv${o.kids ? ' par' : ''}"${tog}>${row(k, lv, xp)}${skillTip(s)}</div>`;
  };
  const dcell = ([k, v, t, tip]) => `<div class="dcell hv" data-skin="well"><em>${k}</em><b class="${t}">${v}</b>${tip ? htip(k, tip[0], tip[1]) : ''}</div>`;
  function pawnsWin(state) {
    const p = D.sel, tab = state.tab, star = n => '★'.repeat(n) + '<i>' + '★'.repeat(3 - n) + '</i>';
    const tabs = D.tabs.map(([t, key]) => `<button class="tab${key === tab ? ' on' : ''}" data-skin="${key === tab ? 'cellOn' : 'cell'}"${key ? ` data-act="tab:${key}"` : ''}><span>${t}</span></button>`).join('');
    const roster = D.pawns.map((q, i) => `<button class="chip${i === 0 ? ' on' : ''}" data-skin="${i === 0 ? 'cellOn' : 'cell'}"><i class="pawnspr" data-p="${q.kind}"></i><span><b>${e(q.first)}</b><em>${e(q.state)}</em></span></button>`).join('');
    const attrs = p.attrs.map(([k, v, pot]) => `<div class="attr" data-skin="well"><em>${k}</em><b>${v}</b><span>/${pot}</span></div>`).join('');
    const limbs = p.limbs.filter(l => l[1] < 100).map(([name, pct, parts]) => `<div class="limb"><div class="limb-h"><b>${name}</b><span class="${hpClass(pct / 100)}">${pct}%</span></div>${parts.filter(x => x[3]).map(([pn, hp, max, w]) => `<div class="part"><span>${pn}</span><span class="${hpClass(hp / max)}">${hp}/${max}</span><span class="wd">· ${w}</span></div>`).join('')}</div>`).join('');
    let body;
    if (tab === 'attributes') {
      const skills = p.skills.map(s => skillRow(s, true)).join('');
      const cats = p.derived.map(([cat, cells]) => `<div class="dcat"><h5>${cat}</h5><div class="dcells">${cells.map(dcell).join('')}</div></div>`).join('');
      body = `<div class="attrtab"><section data-skin="well" class="skillband"><h4>Skills</h4><div class="skills" style="--rows:3">${skills}</div></section>
        <div class="dcats">${cats}</div>
        <section data-skin="well" class="traits"><h4>Traits</h4>${p.traits.map(([k, t, g]) => `<div class="trait">${bdg(g, 'trait')}<div><b>${k}</b><p>${e(t)}</p></div></div>`).join('')}</section></div>`;
    } else if (tab === 'relations') {
      body = HUD.relations();
    } else if (tab === 'gear') {
      const slots = p.worn.map(([slot, item, q, dur, id]) => `<div class="slot${item ? '' : ' empty'}"><span class="sq" data-skin="well">${ico(id, 'hd')}</span><div><em>${slot}</em>${item ? `<b>${e(item)}</b><span>${q}</span>${bar(dur, dur < .5 ? 'ember' : 'leaf', 'thin')}` : ''}</div></div>`).join('');
      const pack = p.pack.map(([ic, nm, n, wt]) => `<div class="row">${ico(ic)}<span>${nm}</span><b>×${n}</b><em>${wt}</em></div>`).join('');
      body = `<div class="grid g3 gear">
        <section data-skin="well"><h4>Worn</h4><div class="slots">${slots}</div></section>
        <section data-skin="well"><h4>Pack</h4><div class="packhead"><span>Item</span><span>Count</span><span>Weight</span></div>${pack}<div class="meter load"><em>Load</em>${bar(p.load[0] / p.load[1], 'honey')}<span>${p.load[0]} of ${p.load[1]} kg</span></div><div class="meter load"><em>Room</em>${bar(p.load[2] / p.load[3], 'water')}<span>${p.load[2]} of ${p.load[3]} L</span></div></section>
        <section data-skin="well"><h4>Protection</h4>${p.armour.map(([k, v, g]) => `<div class="meter">${gly(g)}<em>${k}</em>${bar(v / 30, 'water')}<span>${v}</span></div>`).join('')}<h5>In hand</h5>${D.hand.map(([k, v]) => kv(k, v)).join('')}</section>
      </div>`;
    } else {
      const toggles = p.toggles.map(([k, opts, on]) => `<div class="kv tog"><em>${k}</em><span class="seg">${opts.map((o, i) => `<button class="segb${i === on ? ' on' : ''}" data-skin="${i === on ? 'cellOn' : 'cell'}"><span>${o}</span></button>`).join('')}</span></div>`).join('');
      body = `<div class="grid g3">
        <section data-skin="well"><h4>Status</h4>${p.status.map(([k, v]) => kv(k, e(v))).join('')}${kv('State', e(p.job), 'hot')}${toggles}</section>
        <section data-skin="well"><h4>Body</h4><div class="pills">${pills()}</div>${limbs}<h5>Carries</h5>${kv(p.carries, '')}</section>
        <section data-skin="well"><h4>Needs</h4>${p.needs.map(meter).join('')}<h5>Conditions</h5>${p.conditions.map(([n, k, g, d]) => `<div class="crow ${k}">${bdg(g, k)}<b>${e(n)}</b><em>${e(d)}</em></div>`).join('')}</section>
      </div>`;
    }
    return win('pawns', 'Pawns', `<div class="s-sub"><div class="roster">${roster}</div><div class="attrs">${attrs}</div></div>${body}`, { tabs, cls: 'big', tools: btn('Follow', { glyph: 'eye' }) });
  }
  function bodyWin() {
    const p = D.sel;
    const limbs = p.limbs.filter(l => l[1] < 100).map(([name, pct, parts]) => `<div class="limb"><div class="limb-h"><b>${name}</b><span class="${hpClass(pct / 100)}">${pct}%</span></div>${parts.map(([pn, hp, max, w]) => `<div class="part"><span>${pn}</span><span class="${hpClass(hp / max)}">${hp}/${max}</span>${w ? `<span class="wd">· ${w}</span>` : ''}</div>`).join('')}</div>`).join('');
    return win('body', 'Health', `<div class="pills">${pills()}</div><div class="conds">${p.conditions.map(cond).join('')}</div><div class="bodygrid"><canvas class="doll"></canvas><div class="limbs">${limbs}<p class="rest">Head, right arm and left leg are whole.</p></div></div>`);
  }
  function fuelWin() {
    const f = D.fuel, chk = (on, label, extra) => `<label class="chk${on ? ' on' : ''}"><i class="box" data-skin="${on ? 'cellOn' : 'well'}"></i><span>${label}</span>${extra || ''}</label>`;
    return win('fuel', 'Fuel', `<h5>Lights with</h5><div class="kv"><span>${f.tinder[0]}× ${f.tinder[1]} <span class="pill">tinder · always</span></span><em>${f.tinder[2]} in store</em></div>
      ${chk(f.paused, 'Let it burn out')}
      <h5>Refuel below</h5><div class="slider"><i class="track" data-skin="well"><i class="fill" style="width:${f.threshold}%"></i><i class="knob" data-skin="btn" style="left:${f.threshold}%"></i></i><b>${f.threshold}%</b></div>
      <h5>Burns</h5><div class="chks">${f.fuels.map(([ic, nm, n, on]) => chk(on, `${ico(ic)}${nm}`, `<em>${n}</em>`)).join('')}</div>
      <div class="minis">${btn('Defaults', {})}${btn('All', {})}${btn('None', {})}</div>
      <h5>Tended by</h5><div class="chks">${f.who.map(([nm, on]) => chk(on, nm)).join('')}</div>`);
  }
  function workWin() {
    const L = ['—', 'low', 'nrm', 'hi', 'urg'], p = D.sel;
    const head = `<div class="wr head"><span class="who">Worker</span>${D.jobs.map(([a, full]) => `<span title="${full}">${a}</span>`).join('')}<span class="st">Doing</span></div>`;
    const rows = D.labor.map(([name, lv, state, marks], r) => `<div class="wr${r === 0 ? ' on' : ''}"${r === 0 ? ' data-skin="cellOn"' : ''}><span class="who">${name}</span>${[...lv].map((c, i) => `<span class="l${c}${marks[i] ? ' ' + marks[i] : ''}">${L[+c]}</span>`).join('')}<span class="st">${state}</span></div>`).join('');
    return win('work', 'Work', `<div class="wgrid" data-skin="well">${head}${rows}</div>
      <p class="legend"><span class="l0">— off</span><span class="l1">low</span><span class="l2">nrm</span><span class="l3">hi</span><span class="l4">urg</span><span class="top">best at</span><span class="weak">worst at</span></p>
      <div class="grid g3 even">
        <section data-skin="well"><h4>${p.name}</h4>${kv('Doing', e(p.job), 'hot')}${kv('Next', 'Haul logs to the yard')}${p.needs.slice(0, 4).map(meter).join('')}</section>
        <section data-skin="well" class="span2 wskills"><h4>Work skills</h4><div class="skills" style="--rows:4">${p.skills.map(s => skillRow(s, false)).join('')}</div></section>
      </div>`, { cls: 'big' });
  }
  function buildWin(state) {
    const t = D.tip, on = state.bcat;
    const cats = D.buildCats.map((c, i) => `<button class="tab${i === on ? ' on' : ''}" data-skin="${i === on ? 'cellOn' : 'cell'}" data-act="bcat:${i}"><span>${e(c)}</span></button>`).join('');
    if (on === 0) return win('build', 'Construction', `<nav class="tabs cats">${cats}</nav>${HUD.zones()}`, { cls: 'big' });
    const cards = D.builds.map((b, i) => `<article class="bcard${b.ok ? '' : ' short'}${i === 1 ? ' hover' : ''}" data-skin="well">
      <header><i class="bspr" data-b="${b.kind}"></i><div><h5>${e(b.name)}</h5><span class="work">${gly('hammer')}${b.work}</span></div></header>
      <p>${e(b.text)}</p>
      <ul class="cost">${b.cost.map(([ic, nm, need, have]) => `<li class="${have >= need ? '' : 'lack'}">${ico(ic)}<span>${e(nm)}</span><b>${need}</b><em>${have}</em></li>`).join('')}</ul>
      ${btn(b.ok ? 'Place' : 'Short of stock', { skin: b.ok ? 'btn' : 'btnOff', cls: b.ok ? 'go' : 'off' })}
    </article>`).join('');
    return win('build', 'Construction', `<nav class="tabs cats">${cats}</nav><div class="cards">${cards}</div>`, { cls: 'big', extra: `<aside class="tip" data-skin="tip"><h5>${e(t.name)}</h5><p>${e(t.text)}</p>${t.rows.map(([k, v]) => kv(k, e(v))).join('')}</aside>` });
  }
  function verbTag() {
    const m = D.marked;
    return `<div class="verbtag" data-skin="tag"><span class="vt-n"><b>${m.count}</b> ${e(m.what)} marked</span>${btn(m.verb, { skin: 'verb', glyph: m.glyph, cls: 'verb' })}${btn('', { glyph: 'x', cls: 'mini' })}</div>`;
  }

  const WIN = HUD.WIN = { pawns: pawnsWin, body: bodyWin, fuel: fuelWin, work: workWin, build: buildWin };
  HUD.ui = { e, ico, gly, bdg, bar, btn, kv, meter, win, hpClass };
  HUD.html = state => `${columns(state)}${top(state)}${card(state)}${state.wins.includes('fuel') ? '' : verbTag()}${state.wins.some(w => HUD.MODAL.includes(w)) ? '<i class="veil"></i>' : ''}${state.wins.map(w => WIN[w](state)).join('')}`;

  const put = (el, c, cls) => { c.className = cls; el.prepend(c); return c; };
  HUD.fill = (root, skin) => {
    const ramps = A.RAMP;
    root.querySelectorAll('i.ico:empty').forEach(el => {
      const hd = el.classList.contains('hd'), c = A.item(el.dataset.i, hd ? 'hd' : 'sm');
      if (!hd) c.style.margin = `${Math.floor((16 - c.height) / 2)}px 0 0 ${Math.floor((16 - c.width) / 2)}px`;
      el.append(c);
    });
    root.querySelectorAll('i.gly').forEach(el => { el.textContent = ''; el.append(A.glyph(el.dataset.g, ramps[el.dataset.ramp] || skin.glyphRamp, { line: skin.glyphLine })); });
    root.querySelectorAll('i.bdg:empty').forEach(el => el.append(skin.badge(el.dataset.g, el.dataset.k)));
    root.querySelectorAll('i.portrait:empty').forEach(el => el.append(A.portrait(el.dataset.p, +el.dataset.size || 48, skin.portraitBg)));
    root.querySelectorAll('i.pawnspr:empty').forEach(el => el.append(A.pawnFull(el.dataset.p)));
    root.querySelectorAll('i.bspr:empty').forEach(el => el.append(A.building(el.dataset.b)));
    root.querySelectorAll('i.bar').forEach(el => {
      const w = el.offsetWidth, h = el.offsetHeight;
      el.textContent = '';
      if (w > 3 && h > 2) el.append(skin.bar(w, h, +el.dataset.v, el.dataset.ramp, el));
    });
    root.querySelectorAll('canvas.scrim').forEach(c => { const el = c.parentElement, s = A.scrim(c.offsetWidth, c.offsetHeight, el.classList.contains('col-r')); c.width = s.width; c.height = s.height; c.getContext('2d').drawImage(s, 0, 0); });
    root.querySelectorAll('canvas.doll').forEach(c => { const s = A.doll(D.sel.limbs.map(l => l[1] / 100)); c.width = s.width; c.height = s.height; c.getContext('2d').drawImage(s, 0, 0); });
    root.querySelectorAll('[data-skin]').forEach(el => {
      el.querySelectorAll(':scope > canvas.skin, :scope > canvas.lit').forEach(c => c.remove());
      const w = el.offsetWidth, h = el.offsetHeight, fn = skin.paint[el.dataset.skin];
      if (!fn || w < 2 || h < 2) return;
      const out = fn(w, h, el);
      if (!out) return;
      if (out instanceof HTMLCanvasElement) { put(el, out, 'skin'); return; }
      if (out.lit) put(el, out.lit, 'lit');
      put(el, out.base, 'skin');
    });
  };
})();
