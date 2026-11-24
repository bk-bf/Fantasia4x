'use strict';
(() => {
  const T = 32;
  const NIGHT = [96, 108, 160];
  const GOLD = '#f2d36b';
  const Z_GLYPH = ['11111', '00011', '00110', '01100', '11111'];
  const $ = id => document.getElementById(id);
  const cv = $('view'), ctx = cv.getContext('2d'), frame = $('frame'), stage = $('stage'), slider = $('time');
  const sheet = new Image();
  const grounds = {};
  const tinted = new Map();
  const params = new URLSearchParams(location.search);
  let ui, scene, t = Number(params.get('t')) || 0, last = 0, scrubbing = false;

  const lerp = (a, b, u) => a + (b - a) * u;
  const age = () => Number(ui.state.age);
  const cleared = () => ui.state.state === 'cleared';
  const aged = o => (o.st ?? 1) <= age();
  const named = s => (Array.isArray(s) ? s[age() - 1] : s);
  const during = (o, at) => o.from === undefined || (o.from <= o.to ? at >= o.from && at < o.to : at >= o.from || at < o.to);
  const curve = (keys, at) => {
    let i = keys.length - 1;
    while (i > 0 && keys[i][0] > at) i--;
    const a = keys[i], b = keys[i + 1];
    return b ? lerp(a[1], b[1], (at - a[0]) / (b[0] - a[0])) : a[1];
  };

  function ground(id) {
    if (!grounds[id]) {
      grounds[id] = new Image();
      grounds[id].src = `ground-${id}.png`;
    }
    return grounds[id];
  }

  function blit(name, x, y, flip, source = sheet) {
    const a = ART[name];
    const dx = flip ? x + T - a[4] - a[2] : x + a[4], dy = y + a[5];
    if (!flip) {
      ctx.drawImage(source, a[0], a[1], a[2], a[3], dx, dy, a[2], a[3]);
      return;
    }
    ctx.save();
    ctx.translate(dx + a[2], dy);
    ctx.scale(-1, 1);
    ctx.drawImage(source, a[0], a[1], a[2], a[3], 0, 0, a[2], a[3]);
    ctx.restore();
  }

  function silhouette() {
    if (!tinted.has(GOLD)) {
      const c = document.createElement('canvas');
      c.width = sheet.width;
      c.height = sheet.height;
      const g = c.getContext('2d');
      g.drawImage(sheet, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = GOLD;
      g.fillRect(0, 0, c.width, c.height);
      tinted.set(GOLD, c);
    }
    return tinted.get(GOLD);
  }

  function marked(name, x, y, flip) {
    const gold = silhouette();
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) blit(name, x + ox, y + oy, flip, gold);
    blit(name, x, y, flip);
  }

  function facing(keys, i) {
    for (let j = i; j > 0; j--) if (keys[j][1] !== keys[j - 1][1]) return Math.sign(keys[j][1] - keys[j - 1][1]);
    return 1;
  }

  function where(actor, at) {
    const k = actor.k;
    let i = k.length - 1;
    while (i > 0 && k[i][0] > at) i--;
    const a = k[i], b = k[i + 1], az = a[4]?.z ?? 0;
    if (a[3] === 'hide') return null;
    let carry = null, how = actor.claw ? 'claw' : 'drag';
    for (let j = 0; j <= i; j++) {
      const o = k[j][4];
      if (o && 'carry' in o) [carry, how] = [o.carry, o.how ?? how];
    }
    const bz = b ? b[4]?.z ?? 0 : az;
    if (!b || (b[1] === a[1] && b[2] === a[2] && bz === az))
      return { x: a[1], y: a[2], z: az, pose: a[3], f: a[4]?.f ?? facing(k, i), carry, how, u: 0 };
    const u = (at - a[0]) / (b[0] - a[0]);
    return {
      x: lerp(a[1], b[1], u), y: lerp(a[2], b[2], u), z: lerp(az, bz, u), pose: a[3] === 'fly' ? 'fly' : 'walk',
      f: b[1] === a[1] ? facing(k, i) : Math.sign(b[1] - a[1]), carry, how, u
    };
  }

  function glyph(x, y, size, colour) {
    ctx.fillStyle = colour;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (Z_GLYPH[r][c] === '1') ctx.fillRect(x + c * size, y + r * size, size, size);
  }

  function snore(x, y, at) {
    const beat = Math.floor(at * 1.4) % 3;
    const stamp = (gx, gy, size) => {
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) glyph(gx + ox, gy + oy, size, '#1c2233');
      glyph(gx, gy, size, '#cfe0f0');
    };
    if (beat >= 1) stamp(x, y, 1);
    if (beat >= 2) stamp(x + 5, y - 12, 2);
  }

  function shadow(x, y, wide) {
    ctx.fillStyle = 'rgb(0 0 0 / .25)';
    ctx.fillRect(x + 16 - wide, y + 27, wide * 2, 2);
    ctx.fillRect(x + 18 - wide, y + 26, wide * 2 - 4, 4);
  }

  function actorDraw(actor, p, phase) {
    const base = named(actor.s);
    const resting = p.pose === 'sleep' || p.pose === 'lie';
    const name = resting && actor.lie && ART[base + '#lie'] ? base + '#lie' : base;
    const x = Math.round(p.x * T), y = Math.round(p.y * T), flip = p.f < 0, body = ART[base];
    let lift = Math.round(p.z);
    if (p.pose === 'walk') lift += Math.floor(t * 7 + phase) % 2;
    if (p.pose === 'fly') lift += Math.round(Math.sin(t * 9 + phase) * 2);
    if (p.pose === 'eat') lift -= Math.floor(t * 3 + phase) % 2;
    if (actor.hop && p.pose === 'walk') lift += Math.round(Math.sin(Math.PI * p.u) * 9);
    if (p.pose === 'fly') shadow(x, y, 9);
    if (p.carry && p.how === 'drag') blit(p.carry, x - p.f * Math.round(body[2] / 2 + 8), y + 3, flip);
    if (resting && actor.rot) {
      ctx.save();
      ctx.translate(x + 16, y + 22);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(sheet, body[0], body[1], body[2], body[3], -body[2] / 2, -body[3] / 2, body[2], body[3]);
      ctx.restore();
    } else blit(name, x, y - lift, flip);
    if (p.carry && p.how === 'lift') blit(p.carry, x, y - lift - body[3] + 6, flip);
    if (p.carry && p.how === 'claw') blit(p.carry, x, y - lift + 14, flip);
    if (p.pose === 'sleep') snore(x + 16 + p.f * 8, y + ART[name][5] - 10, t + phase);
  }

  function propDraw(o, at, glow) {
    let x = Math.round(o.x * T), y = Math.round(o.y * T);
    if (o.shake && at >= o.shake[0] && at < o.shake[1]) x += Math.round(Math.sin(at * 34));
    if (o.fall && at >= o.fall[0] && at < o.fall[0] + o.fall[2]) y -= Math.round(o.fall[1] * (1 - ((at - o.fall[0]) / o.fall[2]) ** 2));
    if (glow && o.loot) marked(o.s, x, y, o.f < 0);
    else blit(o.s, x, y, o.f < 0);
  }

  function light(night) {
    if (night <= 0) return;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${NIGHT.map(c => Math.round(lerp(255, c, night))).join(' ')})`;
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (scene.glow) {
      ctx.globalCompositeOperation = 'lighter';
      const flicker = Math.floor(t * 9) % 3;
      [[150, 0.07], [112, 0.09], [78, 0.11], [46, 0.14]].forEach(([r, a]) => {
        ctx.fillStyle = `rgb(255 150 60 / ${a * night})`;
        ctx.beginPath();
        ctx.arc(scene.glow[0] * T, scene.glow[1] * T, r + flicker, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function draw() {
    const gone = cleared(), at = gone ? scene.clearedAt : t;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ground(ui.state.lair), 0, 0);
    const props = scene.props.filter(o => aged(o) && during(o, at) && (gone ? !o.gone : !o.only));
    for (const o of props) if (o.flat) propDraw(o, at, gone);
    const row = props.filter(o => !o.flat).map(o => ({ key: (o.y + 1) * T + (o.top ? 8 : 0), go: () => propDraw(o, at, gone) }));
    if (!gone)
      scene.actors.forEach((actor, i) => {
        const p = aged(actor) && where(actor, at);
        if (p) row.push({ key: (p.y + 1) * T + 1 + (p.z > 20 ? 4000 : 0), go: () => actorDraw(actor, p, i * 1.7) });
      });
    row.sort((a, b) => a.key - b.key).forEach(d => d.go());
    light(gone ? 0 : curve(scene.night, at));
  }

  function fit() {
    const [w, h] = scene.size.map(n => n * T);
    const z = ui.state.zoom === 'fit' ? Math.max(1, Math.floor(Math.min(stage.clientWidth / w, stage.clientHeight / h))) : Number(ui.state.zoom);
    frame.style.width = `${w * z}px`;
    frame.style.height = `${h * z}px`;
    for (const pin of $('pins').children) {
      pin.style.left = `${pin.dataset.x * T * z}px`;
      pin.style.top = `${pin.dataset.y * T * z}px`;
    }
    stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2;
    stage.scrollTop = (stage.scrollHeight - stage.clientHeight) / 2;
  }

  function cards() {
    const parts = scene.parts.filter(aged), gone = cleared(), showParts = ui.state.parts === 'on' && !gone;
    $('pins').innerHTML = showParts ? parts.map(p => `<b data-x="${p.at[0]}" data-y="${p.at[1]}">${p.n}</b>`).join('') : '';
    $('legend').hidden = !showParts;
    $('legend').innerHTML = `<h2>${scene.name}</h2><ol>${parts.map(p => `<li><b>${p.n}</b><div>${p.name}<span>${p.note}</span></div></li>`).join('')}</ol>`;
    const haul = scene.loot.filter(l => l.n[age() - 1] > 0);
    $('loot').hidden = !gone;
    $('loot').innerHTML = `<h2>Left behind</h2><ul>${haul
      .map(l => {
        const a = ART[l.s];
        return `<li><i style="background-position:${Math.round((36 - a[2]) / 2) - a[0]}px ${Math.round((30 - a[3]) / 2) - a[1]}px"></i><div>${l.name}</div><em>${l.n[age() - 1]}</em></li>`;
      })
      .join('')}</ul><button>HAUL</button>`;
  }

  function change() {
    scene = SCENES[ui.state.lair];
    [cv.width, cv.height] = scene.size.map(n => n * T);
    slider.max = scene.loop;
    t %= scene.loop;
    cards();
    fit();
  }

  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!scrubbing && !cleared()) t = (t + dt * Number(ui.state.speed)) % scene.loop;
    if (!scrubbing) slider.value = t;
    if (sheet.complete && ground(ui.state.lair).complete) draw();
    requestAnimationFrame(tick);
  }

  slider.addEventListener('input', () => {
    scrubbing = true;
    t = Number(slider.value);
  });
  slider.addEventListener('change', () => (scrubbing = false));
  addEventListener('resize', fit);
  sheet.src = 'sprites.png';
  ui = F4X.bar(change);
  change();
  requestAnimationFrame(tick);
})();
