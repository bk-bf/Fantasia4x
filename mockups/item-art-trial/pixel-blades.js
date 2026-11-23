'use strict';
const PIXEL_BLADES = (() => {
  const { assemble, part, run } = PX, { POMMEL, BLADE, grip, binding, quillons, crossbar } = PARTS;
  const sword = (pommel, hilt, guard, blade) => assemble([pommel, hilt, guard, -1, blade]);
  const knife = (hilt, collar, blade) => assemble([hilt, collar, -1, blade]);

  const copperShortsword = () => sword([POMMEL.block, 'copper'], [grip(3), 'wood'], [quillons(4), 'copper'], [BLADE.broad(11), 'copper']);
  const bronzeLeafSword = () => sword([POMMEL.wheel, 'bronze'], [grip(4, 'ml'), 'bronze'], [quillons(2), 'bronze'], [BLADE.leaf(17, 7), 'bronze']);
  const shortSeax = () => knife([run(-1, ['lm', 'md'], 6), 'wood'], [crossbar(2), 'iron'], [BLADE.seax(13), 'iron']);
  const spatha = () => sword([POMMEL.block, 'bone'], [grip(4), 'wood'], [quillons(2), 'iron'], [BLADE.spatha(18), 'iron']);
  const steelLongsword = () => sword([POMMEL.plus, 'steel'], [grip(5), 'leather'], [quillons(6), 'steel'], [BLADE.arming(16), 'steel']);
  const steelGreatsword = () => sword([POMMEL.wheel, 'steel'], [grip(7), 'leather'], [quillons(8), 'steel'], [BLADE.fullered(17, 11), 'steel']);
  const runeArmingSword = () => sword([POMMEL.jewel, 'gold', 'sapphire'], [grip(5), 'wool'], [quillons(4), 'gold'], [BLADE.runed(16), 'runed', 'glow']);
  const gravemaker = () => sword([POMMEL.ring, 'black'], [binding(7), 'red'], [crossbar(5), 'black'], [BLADE.jagged(17), 'black']);

  const flintDagger = () => knife([grip(5, 'md'), 'wood'], [binding(2), 'cord'], [BLADE.broad(9), 'flint']);
  const copperDagger = () => sword([POMMEL.dot, 'bone'], [grip(4, 'ml'), 'bone'], [quillons(2), 'copper'], [BLADE.leaf(9, 2), 'copper']);
  const ironRondel = () => sword([part(-2, ['l', 'm', 'm', 'd', 'd']), 'iron'], [grip(4), 'wood'], [crossbar(3), 'iron'], [BLADE.spike(12, 6), 'iron']);
  const steelStiletto = () => sword([POMMEL.dot, 'steel'], [grip(4), 'leather'], [quillons(2), 'steel'], [BLADE.needle(12), 'steel']);

  const orcCleaver = () => knife([binding(6), 'leather'], [crossbar(1), 'black'], [BLADE.slab(18), 'black']);

  return [
    { id: 'copper_shortsword', draw: copperShortsword },
    { id: 'bronze_leaf_sword', draw: bronzeLeafSword },
    { id: 'short_seax', draw: shortSeax },
    { id: 'spatha', draw: spatha },
    { id: 'steel_longsword', draw: steelLongsword },
    { id: 'steel_greatsword', draw: steelGreatsword },
    { id: 'rune_etched_arming_sword', draw: runeArmingSword },
    { id: 'gravemaker', draw: gravemaker },
    { id: 'flint_dagger', draw: flintDagger },
    { id: 'copper_dagger', draw: copperDagger },
    { id: 'iron_rondel', draw: ironRondel },
    { id: 'steel_stiletto', draw: steelStiletto },
    { id: 'orc_cleaver', draw: orcCleaver }
  ];
})();
