'use strict';
const HUD = { dirs: {}, state: {} };
(() => {
  const KEYS = [
    [0.0, 0.15, [0.72, 0.4, 1.0]], [0.21, 0.15, [0.7, 0.42, 1.0]], [0.26, 0.35, [1.0, 0.6, 0.28]], [0.31, 0.82, [1.0, 0.68, 0.32]],
    [0.37, 0.96, [1.0, 0.9, 0.72]], [0.5, 1.0, [1.0, 1.0, 1.0]], [0.64, 1.0, [1.0, 0.98, 0.88]], [0.72, 1.0, [1.0, 0.8, 0.45]],
    [0.78, 0.88, [1.0, 0.6, 0.28]], [0.84, 0.52, [1.0, 0.5, 0.32]], [0.9, 0.28, [0.82, 0.45, 0.9]], [0.95, 0.18, [0.74, 0.4, 1.0]], [1.0, 0.15, [0.72, 0.4, 1.0]]
  ];
  const WEATHER = {
    clear: { label: 'Clear skies', sat: 1, tint: [1, 1, 1], rain: 0, snow: 0, fog: 0, temp: 8, wind: 'slightly windy W' },
    rain: { label: 'Rain', sat: 0.95, tint: [0.8, 0.85, 1], rain: 0.5, snow: 0, fog: 0, temp: 6, wind: 'fairly windy SW' },
    storm: { label: 'Storm', sat: 0.72, tint: [0.72, 0.78, 0.95], rain: 1, snow: 0, fog: 0, temp: 4, wind: 'extremely windy N' },
    fog: { label: 'Fog', sat: 0.68, tint: [0.88, 0.88, 0.9], rain: 0, snow: 0, fog: 1, temp: 5, wind: 'still air' },
    snow: { label: 'Snow', sat: 0.85, tint: [0.92, 0.96, 1], rain: 0, snow: 1, fog: 0, temp: -6, wind: 'slightly windy N' },
    spring_windy: { label: 'Windy', sat: 1, tint: [0.97, 1, 0.94], rain: 0, snow: 0, fog: 0, temp: 11, wind: 'windy W', kind: 'spring', ws: 0.45, map: 'summer', season: 'Spring', glyph: 'wind' },
    summer_windy: { label: 'Windy', sat: 1, tint: [1, 0.98, 0.9], rain: 0, snow: 0, fog: 0, temp: 19, wind: 'windy W', kind: 'dust', ws: 0.4, map: 'summer', season: 'Summer', glyph: 'wind' },
    autumn_windy: { label: 'Windy', sat: 1, tint: [1, 0.9, 0.72], rain: 0, snow: 0, fog: 0, temp: 6, wind: 'windy W', kind: 'autumn', ws: 0.5, map: 'autumn', season: 'Autumn', glyph: 'wind' },
    winter_windy: { label: 'Windy snow', sat: 0.9, tint: [0.9, 0.94, 1], rain: 0, snow: 0.4, fog: 0, temp: -9, wind: 'very windy W', kind: 'snowdust', ws: 0.6, map: 'winter', season: 'Winter', glyph: 'wind' },
    drizzle: { label: 'Drizzle', sat: 0.97, tint: [0.88, 0.91, 1], rain: 0.3, snow: 0, fog: 0, temp: 7, wind: 'slightly windy W', kind: 'drizzle', ws: 0.2, map: 'autumn', season: 'Autumn', glyph: 'rain' },
    windy_rain: { label: 'Windy rain', sat: 0.85, tint: [0.8, 0.85, 1], rain: 0.7, snow: 0, fog: 0, temp: 4, wind: 'very windy W', kind: 'windyrain', ws: 0.75, map: 'autumn', season: 'Autumn', glyph: 'rain' },
    heavy_rain: { label: 'Heavy rain', sat: 0.82, tint: [0.78, 0.83, 1], rain: 0.75, snow: 0, fog: 0, temp: 3, wind: 'windy W', kind: 'heavyrain', ws: 0.5, map: 'autumn', season: 'Autumn', glyph: 'rain' },
    blizzard: { label: 'Blizzard', sat: 0.7, tint: [0.92, 0.96, 1], rain: 0, snow: 1, fog: 0.5, temp: -22, wind: 'extremely windy W', kind: 'blizzard', ws: 0.9, grade: 'brightness(1.06)', map: 'winter', season: 'Winter', glyph: 'snow' },
    foggy_rain: { label: 'Foggy rain', sat: 0.78, tint: [0.82, 0.85, 0.92], rain: 0.3, snow: 0, fog: 0.75, temp: 6, wind: 'light air W', kind: 'foggyrain', ws: 0.15, map: 'autumn', season: 'Autumn', glyph: 'fog' },
    heat_wave: { label: 'Heat wave', sat: 1, tint: [1, 0.92, 0.8], rain: 0, snow: 0, fog: 0, temp: 34, wind: 'still air', kind: 'heat', ws: 0.05, grade: 'sepia(.28) saturate(1.2) brightness(1.05) contrast(1.04)', map: 'summer', season: 'Summer' },
    gale: { label: 'Gale', sat: 0.9, grade: 'brightness(.94) contrast(1.04)', tint: [0.93, 0.92, 0.88], rain: 0, snow: 0, fog: 0, temp: 5, wind: 'gale W', kind: 'gale', ws: 1, map: 'autumn', season: 'Autumn', glyph: 'wind' }
  };
  const LUMA = [0.2126, 0.7152, 0.0722];
  const BRIGHT_FLOOR = 0.45, PANEL_SAT = 0.8, NIGHT_BLEAK = 0.25, NIGHT_SAT_FLOOR = 0.6;
  const lerp = (a, b, f) => a + (b - a) * f;
  const step64 = v => Math.round(v * 64) / 64;
  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

  function at(hour) {
    const t = ((hour % 24) + 24) % 24 / 24;
    let a = KEYS[KEYS.length - 1], b = a, f = 0;
    for (let i = 0; i < KEYS.length - 1; i++) if (t >= KEYS[i][0] && t <= KEYS[i + 1][0]) { a = KEYS[i]; b = KEYS[i + 1]; f = (t - a[0]) / (b[0] - a[0]); break; }
    const light = lerp(a[1], b[1], f), tint = [0, 1, 2].map(i => lerp(a[2][i], b[2][i], f));
    const bright = BRIGHT_FLOOR + (1 - BRIGHT_FLOOR) * light;
    return { light, tint, panelTint: tint.map(c => bright * (1 - PANEL_SAT + PANEL_SAT * c)) };
  }
  function bleak(baseSat, light) {
    const extra = (1 - baseSat) * (1 - light) * NIGHT_BLEAK;
    return step64(Math.max(Math.min(baseSat, NIGHT_SAT_FLOOR), baseSat - extra));
  }
  function matrix(tint, s) {
    const [lr, lg, lb] = LUMA, [tr, tg, tb] = tint, wash = (1 - s) * 0.08, f = n => n.toFixed(4);
    return `${f(tr * ((1 - s) * lr + s))} ${f(tr * (1 - s) * lg)} ${f(tr * (1 - s) * lb)} 0 ${f(wash)} ` +
      `${f(tg * (1 - s) * lr)} ${f(tg * ((1 - s) * lg + s))} ${f(tg * (1 - s) * lb)} 0 ${f(wash)} ` +
      `${f(tb * (1 - s) * lr)} ${f(tb * (1 - s) * lg)} ${f(tb * ((1 - s) * lb + s))} 0 ${f(wash)} 0 0 0 1 0`;
  }
  function tintRGB(hexc, tint, s) {
    const r = parseInt(hexc.slice(1, 3), 16) / 255, g = parseInt(hexc.slice(3, 5), 16) / 255, b = parseInt(hexc.slice(5, 7), 16) / 255;
    const [lr, lg, lb] = LUMA, wash = (1 - s) * 0.08, l = (1 - s) * (lr * r + lg * g + lb * b);
    return [tint[0] * (l + s * r) + wash, tint[1] * (l + s * g) + wash, tint[2] * (l + s * b) + wash];
  }
  const toHex = c => '#' + c.map(n => Math.max(0, Math.min(255, Math.round(n * 255))).toString(16).padStart(2, '0')).join('');
  const normLuma = t => { const l = LUMA[0] * t[0] + LUMA[1] * t[1] + LUMA[2] * t[2], k = l > 1e-4 ? 1 / l : 1; return t.map(c => c * k); };

  function compute(hour, weatherId) {
    const a = at(hour), w = WEATHER[weatherId] || WEATHER.clear;
    const panelTint = a.panelTint.map((c, i) => step64(c * w.tint[i]));
    const sat = bleak(w.sat, a.light), legibleTint = normLuma(panelTint);
    const night = 1 - smooth(0.2, 0.55, a.light), lamp = 1 - smooth(0.3, 0.8, a.light);
    const warm = Math.max(0, 1 - a.tint[2] / a.tint[0]) * (1 - night);
    const litTint = panelTint.map((c, i) => lerp(c, [0.98, 0.8, 0.56][i], night * 0.92));
    const skyTint = a.tint.map((c, i) => c * w.tint[i] * (0.25 + 0.75 * a.light));
    return { hour, light: a.light, tint: a.tint, panelTint, sat, legibleTint, litTint, night, lamp, warm, weather: w, weatherId, skyTint };
  }
  function phase(hour) {
    const h = ((hour % 24) + 24) % 24;
    return h < 5 ? 'Night' : h < 7.5 ? 'Dawn' : h < 11 ? 'Morning' : h < 14 ? 'Midday' : h < 17.5 ? 'Afternoon' : h < 20.5 ? 'Dusk' : h < 22 ? 'Evening' : 'Night';
  }
  function clock(hour) {
    const h = ((hour % 24) + 24) % 24, hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }
  const layers = amb => ({ dusk: clamp(amb.warm * 1.35, 0, 1), night: amb.night });
  function seen(amb) {
    const { dusk, night } = layers(amb);
    return { day: dusk < .97 && night < .97, dusk: dusk > .08 && night < .97, night: night > .08 };
  }
  HUD.ambient = { at, compute, matrix, tintRGB, toHex, phase, clock, smooth, lerp, layers, seen, WEATHER };
})();
