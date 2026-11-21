import { clamp, dith } from './noise';

export type Rgb = readonly number[];
export type Ramp = readonly Rgb[];

const hex = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16)
];

const ramp = (stops: string): Ramp => stops.trim().split(/\s+/).map(hex);

export const INK = hex('#0d0a10');

export const RAMPS = {
  iron: ramp('#1a1c22 #2a2e36 #40464e #5c646c #7e888e #a6b0b2 #d0d8d6'),
  gold: ramp('#5a4010 #866214 #b4881c #dcb030 #f4d860'),
  red: ramp('#4a141a #701c22 #9a2a2a #c0443a #de6a52'),
  blue: ramp('#16243e #20385c #2e507c #44709c #6a98bc'),
  green: ramp('#1c3020 #2a482a #3c6436 #558246 #76a05a'),
  purple: ramp('#24143a #3a2058 #56307c #7648a0 #9c6cc0'),
  fire: ramp('#7a1c0e #c23a10 #f07818 #fcc23a #fff0a0'),
  moon: ramp('#1c2a44 #2c4466 #46688c #6c93b0 #9cc0d0 #d0e6ea'),
  oakDark: ramp('#110b08 #19110c #231810 #2e2015 #3a291a #493521 #5b442b'),
  beam: ramp('#1b120d #291b12 #3a2719 #4e3621 #64472b #7c5b38 #977448'),
  brass: ramp('#2a1c0a #47310e #6e4e14 #987219 #c29628 #e2bd48 #f7e38a'),
  inkwash: ramp('#1c130c #2c1e14 #3e2c1e #54402c #6e583e #8c7454'),
  ochre: ramp('#4a3410 #6e4e16 #94701e #b8922c #d4b44c #ecd480'),
  verdigris: ramp('#12322c #1c4c42 #2c6c5c #44907a #6cb49a #a4d8c0')
};

export function pick(r: Ramp, t: number, x: number, y: number, spread = 0.7): Rgb {
  const n = r.length - 1;
  const i = Math.floor(clamp(t, 0, 1) * n + 0.5 + (dith(x, y) - 0.5) * spread);
  return r[clamp(i, 0, n)];
}

export const tone = (c: Rgb, k: number): Rgb => [
  Math.min(255, c[0] * k),
  Math.min(255, c[1] * k),
  Math.min(255, c[2] * k)
];
