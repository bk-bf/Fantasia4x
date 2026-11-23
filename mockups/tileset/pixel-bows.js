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

  const strung = (stave, ...inks) => stamp(sketch(), 0, 0, stave, inks);

  const selfBow = () => strung(SELF_STAVE, 'ash', 'leather', 'string');
  const huntingRecurve = () => strung(RECURVE_STAVE, 'wood', 'cord', 'string', 'bone');

  return [
    { id: 'self_bow', draw: selfBow },
    { id: 'hunting_recurve', draw: huntingRecurve }
  ];
})();
