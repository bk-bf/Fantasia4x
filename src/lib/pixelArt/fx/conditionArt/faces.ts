import { art, glow, overlay, ramp, type Pal } from '../iconArt';
import { P, hex, type Spr } from '../spr';

const DISC = [
  '....44444....',
  '..445555544..',
  '.45555555554.',
  '.45555555554.',
  '4555555555554',
  '4555555555543',
  '4555555555543',
  '4555555555543',
  '4555555555443',
  '.45555555443.',
  '.34555554433.',
  '..334444333..',
  '....33333....'
];

const face = (tone: string, marks: string[], extra: Pal = {}): Spr =>
  art(overlay(DISC, marks), { ...ramp(tone), k: P.ink, ...extra }, 190);

const CHEEK = { c: hex('#f08a6a') };
const TEAR = { t: glow('#7ec8ff', 240) };

export const FACES = {
  ecstatic: () =>
    face(
      '#f4c430',
      [
        '',
        '',
        '',
        '...k.....k...',
        '..k.k...k.k..',
        '',
        '.cc.......cc.',
        '..kkkkkkkkk..',
        '..kwwwwwwwk..',
        '...kmmmmmk...',
        '....kkkkk....'
      ],
      { ...CHEEK, w: hex('#fff6e0'), m: hex('#c0303a') }
    ),
  content: () =>
    face(
      '#f4c430',
      [
        '',
        '',
        '',
        '',
        '...kk...kk...',
        '...kk...kk...',
        '',
        '.cc.......cc.',
        '..k.......k..',
        '...kkkkkkk...'
      ],
      CHEEK
    ),
  sad: () =>
    face('#d8c070', [
      '',
      '',
      '',
      '',
      '...kk...kk...',
      '...kk...kk...',
      '',
      '',
      '....kkkkk....',
      '...k.....k...'
    ]),
  depressed: () =>
    face(
      '#9aaccc',
      [
        '',
        '',
        '',
        '',
        '',
        '..kkk...kkk..',
        '...t.........',
        '...t.........',
        '..tt.........',
        '....kkkkk....',
        '...k.....k...'
      ],
      TEAR
    ),
  moodbreak: () =>
    face(
      '#c4a0e0',
      [
        '......k......',
        '.....kk......',
        '.....k.......',
        '.....kk......',
        '..kkk.k.kkk..',
        '......kk.....',
        '..t....k..t..',
        '..t...kk..t..',
        '......k......',
        '...kkkkkkk...',
        '..k...k...k..',
        '......kk.....',
        '.......k.....'
      ],
      TEAR
    ),
  spent: () =>
    art(
      [
        '...44444...',
        '..4555554..',
        '.455555554t',
        '.455555554t',
        '.4kkk5kkk4.',
        '.455555554.',
        '.4555k5554.',
        '.455kmk554.',
        '..445k443..',
        '...33333...'
      ],
      { ...ramp('#a8706a'), k: P.ink, m: hex('#5a1a1a'), ...TEAR },
      180
    )
} satisfies Record<string, () => Spr>;
