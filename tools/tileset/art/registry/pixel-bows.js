'use strict';
const PIXEL_BOWS = (() => {
  const { sketch, stamp, transposed } = PX;

  const SELF_STAVE = transposed([
    '                   llllll',
    '               lllldddy  ',
    '            llldddd  y   ',
    '          llddd     y    ',
    '        lldd       y     ',
    '       Mdd        y      ',
    '      LM         y       ',
    '                y        ',
    '               y         ',
    '              y          ',
    '             y           ',
    '            y            '
  ]);
  const RECURVE_STAVE = transposed([
    '                     ll  ',
    '                      l  ',
    '                     lmy ',
    '                 llllmdy ',
    '              lllmmdd y  ',
    '           llmmdd    y   ',
    '         llmdd      y    ',
    '        lmd        y     ',
    '       lmd        y      ',
    '      LM         y       ',
    '                y        ',
    '               y         ',
    '              y          '
  ]);

  const WAR_STAVE = transposed([
    '                    lllllll',
    '               lllllmmmmmy ',
    '            lllmmmmmdd  y  ',
    '          llmmmddd     y   ',
    '        llmmdd        y    ',
    '       lmmd          y     ',
    '      lMdd          y      ',
    '       LM          y       ',
    '                  y        ',
    '                 y         ',
    '                y          ',
    '               y           ',
    '              y            '
  ]);
  const YEW_STAVE = transposed([
    '                        llllll',
    '                   lllllDDDDy ',
    '               llllDDDD    y  ',
    '            lllDDD        y   ',
    '           llDD          y    ',
    '          lDD           y     ',
    '         lDD           y      ',
    '         ZD           y       ',
    '         Y           y        ',
    '         Y          y         ',
    '                   y          ',
    '                  y           ',
    '                 y            ',
    '                y             ',
    '               y              '
  ]);
  const SINEW_STAVE = transposed([
    '                  ZZZZZZZ',
    '              ZZZZYmmmdy ',
    '           ZZZYmmmddd y  ',
    '         ZZYmmdd     y   ',
    '       ZZYmdd       y    ',
    '      ZYmdd        y     ',
    '      Zmdd        y      ',
    '      Zdd        y       ',
    '      LM        y        ',
    '               y         ',
    '              y          ',
    '             y           '
  ]);
  const HORN_STAVE = transposed([
    '                     ZZ  ',
    '                    ZYY  ',
    '                   Zmmdy ',
    '              ZZZZZmmdy  ',
    '          ZZZZmmmmddy    ',
    '        ZZmmmdddd  y     ',
    '         Zmd      y      ',
    '         Zmd     y       ',
    '        LLM     y        ',
    '               y         ',
    '              y          ',
    '             y           '
  ]);
  const GOBLIN_STAVE = transposed([
    '                   z',
    '                  zM',
    '               mmmM ',
    '            mmmmdM  ',
    '          mmdd  M   ',
    '        mmd    M    ',
    '       mWd    M     ',
    '       X     M      ',
    '            M       ',
    '           M        '
  ]);
  const HORNBOW_STAVE = transposed([
    '                ZY  ',
    '               ZYYy ',
    '             lllmd y',
    '          lllmmmd y ',
    '        llmmmdd  y  ',
    '       lmmdd    y   ',
    '      lmMM     y    ',
    '      MMDD    y     ',
    '             y      ',
    '            y       '
  ]);
  const RUNE_STAVE = transposed([
    '                    lllllll',
    '               lllllmmMmmM ',
    '            lllmMmmmdd  M  ',
    '          llmMmddd     M   ',
    '        llmmdd        M    ',
    '       lMmd          M     ',
    '      lmdd          M      ',
    '       zy          M       ',
    '                  M        ',
    '                 M         ',
    '                M          ',
    '               M           ',
    '              M            '
  ]);
  const strung = (stave, ...inks) => stamp(sketch(), 0, 0, stave, inks);

  const selfBow = () => strung(SELF_STAVE, 'ash', 'leather', 'string');
  const huntingRecurve = () => strung(RECURVE_STAVE, 'wood', 'leather', 'string');
  const warBow = () => strung(WAR_STAVE, 'wood', 'leather', 'string');
  const yewLongbow = () => strung(YEW_STAVE, 'ash', 'wood', 'string', 'leather');
  const sinewBackedBow = () => strung(SINEW_STAVE, 'wood', 'leather', 'string', 'tallow');
  const hornCompositeBow = () => strung(HORN_STAVE, 'horn', 'leather', 'string', 'bone');
  const goblinPoisonBow = () => strung(GOBLIN_STAVE, 'horn', 'venom', 'bone', 'leather');
  const warrenHornbow = () => strung(HORNBOW_STAVE, 'horn', 'red', 'string', 'bone');
  const runeStrungWarbow = () => strung(RUNE_STAVE, 'runed', 'gleam', 'gold');

  return [
    { id: 'self_bow', draw: selfBow },
    { id: 'hunting_recurve', draw: huntingRecurve },
    { id: 'war_bow', draw: warBow },
    { id: 'yew_longbow', draw: yewLongbow },
    { id: 'sinew_backed_bow', draw: sinewBackedBow },
    { id: 'horn_composite_bow', draw: hornCompositeBow },
    { id: 'goblin_poison_bow', draw: goblinPoisonBow },
    { id: 'warren_hornbow', draw: warrenHornbow },
    { id: 'rune_strung_warbow', draw: runeStrungWarbow }
  ];
})();
PIXEL_ICONS.push(...PIXEL_BOWS);
