'use strict';
window.FOLK_PAGE = {
  draw: drawAnime,
  premade: false,
  marks: ['horns', 'tusks', 'fangs', 'wings', 'tail', 'spiderEyes', 'claws', 'scales', 'feathers', 'fur', 'chitin', 'ironSkin', 'emberSkin', 'leafSkin', 'dragonEyes', 'beastEyes', 'murkEyes', 'oneEye', 'scar'],
  note: 'The Folk page’s cultures and pawns drawn in an anime style. Front view only for now.',
  tune(look, culture, pawn) {
    const folk = seedOf(culture.id + ':vivid');
    if (folk % 4 === 0 && seedOf(pawn.id + ':vivid') % 10 < 7 && look.hair !== 'grey' && look.hair !== 'white') look.vividHair = ANIME_VIVID[(folk >> 2) % ANIME_VIVID.length];
    return look;
  },
};
