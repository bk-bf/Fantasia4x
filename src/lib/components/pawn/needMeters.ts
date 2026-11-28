import type { Pawn } from '$lib/game/core/types';
import type { RampName } from '$lib/pixelArt/palette';
import { getNeedDescription } from '$lib/components/util/pawnUtils';

export type NeedMeter = { label: string; value: number; max: number; ramp: RampName; word: string };

const pick = (pct: number, words: [number, string][], last: string) =>
  words.find(([edge]) => pct < edge)?.[1] ?? last;

export function needMeters(pawn: Pawn): NeedMeter[] {
  const n = pawn.needs;
  const out: NeedMeter[] = [
    {
      label: 'Hunger',
      value: n.hunger,
      max: 100,
      ramp: 'ember',
      word: getNeedDescription('hunger', n.hunger)
    },
    {
      label: 'Rest',
      value: n.fatigue,
      max: 100,
      ramp: 'water',
      word: getNeedDescription('fatigue', n.fatigue)
    },
    {
      label: 'Thirst',
      value: n.thirst ?? 0,
      max: 100,
      ramp: 'water',
      word: getNeedDescription('thirst', n.thirst ?? 0)
    },
    {
      label: 'Hygiene',
      value: n.hygiene ?? 0,
      max: 100,
      ramp: 'honey',
      word: getNeedDescription('hygiene', n.hygiene ?? 0)
    },
    {
      label: 'Wetness',
      value: n.wetness ?? 0,
      max: 100,
      ramp: 'violet',
      word: pick(
        n.wetness ?? 0,
        [
          [25, 'dry'],
          [50, 'damp'],
          [90, 'wet']
        ],
        'soaked'
      )
    },
    {
      label: 'Leisure',
      value: n.relaxation ?? 100,
      max: 100,
      ramp: 'leaf',
      word: pick(
        n.relaxation ?? 100,
        [
          [5, 'starved for company'],
          [12, 'restless']
        ],
        'content'
      )
    }
  ];
  if (n.bloodHunger !== undefined)
    out.push({
      label: 'Bloodlust',
      value: n.bloodHunger,
      max: 100,
      ramp: 'blood',
      word: pick(
        n.bloodHunger,
        [
          [40, 'sated'],
          [70, 'stirring'],
          [100, 'ravenous']
        ],
        'frenzied'
      )
    });
  if (pawn.maxBloodVolume) {
    const cur = pawn.bloodVolume ?? pawn.maxBloodVolume;
    const pct = (cur / pawn.maxBloodVolume) * 100;
    if (pct < 100)
      out.push({
        label: 'Blood',
        value: cur,
        max: pawn.maxBloodVolume,
        ramp: 'blood',
        word: pick(
          pct,
          [
            [30, 'near death'],
            [60, 'critical'],
            [90, 'low']
          ],
          'healthy'
        )
      });
  }
  if (pawn.maxStamina !== undefined) {
    const cur = pawn.stamina ?? pawn.maxStamina;
    const pct = (cur / pawn.maxStamina) * 100;
    if (pct < 100)
      out.push({
        label: 'Stamina',
        value: cur,
        max: pawn.maxStamina,
        ramp: 'leaf',
        word: pick(
          pct,
          [
            [20, 'exhausted'],
            [50, 'winded'],
            [80, 'tired']
          ],
          'fresh'
        )
      });
  }
  return out;
}
