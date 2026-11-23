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
    '                       Z',
    '                       Y',
    '                      l ',
    '                  llll  ',
    '               lLlddy   ',
    '             lldMd y    ',
    '            ldd   y     ',
    '           ld    y      ',
    '          Md    y       ',
    '         ML    y        ',
    '              y         ',
    '             y          ',
    '            y           '
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
    '                  MMMMMMM',
    '              MMMMmmmd y ',
    '           MMMmmmd    y  ',
    '         MMmmd       y   ',
    '       MMmd         y    ',
    '      Mmd          y     ',
    '      Zm          y      ',
    '       Y         y       ',
    '                y        ',
    '               y         ',
    '              y          ',
    '             y           '
  ]);
  const HORN_STAVE = transposed([
    '                       Z',
    '                       Y',
    '                   MMmm ',
    '               MMMmdy   ',
    '             MMmmd y    ',
    '           Mmmd   y     ',
    '          Mmd    y      ',
    '         Mmd    y       ',
    '        ZYd    y        ',
    '         Y    y         ',
    '             y          ',
    '            y           '
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
    '                  MMMM',
    '               MMMmmmy',
    '            MMMmmmd y ',
    '          MMmmmd   y  ',
    '        MMmmd     y   ',
    '       Mmmd      y    ',
    '      XWWd      y     ',
    '       XW      y      ',
    '              y       ',
    '             y        ',
    '            y         '
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
  const huntingRecurve = () => strung(RECURVE_STAVE, 'wood', 'cord', 'string', 'bone');
  const warBow = () => strung(WAR_STAVE, 'wood', 'leather', 'string');
  const yewLongbow = () => strung(YEW_STAVE, 'ash', 'wood', 'string', 'leather');
  const sinewBackedBow = () => strung(SINEW_STAVE, 'wood', 'cord', 'string', 'leather');
  const hornCompositeBow = () => strung(HORN_STAVE, 'horn', 'cord', 'string', 'bone');
  const goblinPoisonBow = () => strung(GOBLIN_STAVE, 'horn', 'venom', 'bone', 'leather');
  const warrenHornbow = () => strung(HORNBOW_STAVE, 'horn', 'bone', 'string', 'red');
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
