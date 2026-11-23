'use strict';
const PIXEL_JEWELRY = (() => {
  const { dress, mark, plate, boxed, times } = ARMOUR;

  const BAND = [
    'llllmmdd',
    'lllm  mmdd',
    'lllm    mmdd',
    'llm      mdd',
    ...times(4, 'llm        mdd'),
    'lmm      mdd',
    'lmmm    mddd',
    'mmmm  dddd',
    'mmmddddd',
    'dddddd'
  ];
  const RING = plate(['LLLM', 'LLLMMD', 'LLMMMD', 'lMMDDd', ...BAND]);
  const SIGNET = plate(['llllmm', 'lmoomd', 'lmomdd', 'lmoodd', ...BAND]);

  const CHAIN = ['y              x', 'x              y', 'y            x', 'x            y', 'y          x', 'x          y', 'y        x', 'x      y', 'y    x', 'x  y'];
  const AMULET = plate([
    ...CHAIN,
    'lm',
    'llmmmd',
    'llLLLMmd',
    'llLLLLMMdd',
    'lmLLLMMMdd',
    'lmLLMMMDdd',
    'lmLMMMDDdd',
    'lmMMMDDDdd',
    'lmMMDDdd',
    'mmdddd',
    'dd'
  ]);
  const TWIN_PENDANT = plate([
    ...CHAIN,
    'lm',
    'llmd',
    'lLLMmd',
    'lLMMdd',
    'lMMDdd',
    'lmmmdd',
    'lZZYmd',
    'lZYYdd',
    'lYYXdd',
    'mddd',
    'dd'
  ]);
  const LEAF_PENDANT = plate([
    ...CHAIN,
    'lm',
    'llmd',
    'lllmmd',
    'lllmmmdd',
    'llmlmmdd',
    'llmmmmdd',
    'lmmmmddd',
    'lmmmdd',
    'mmdd',
    'dd'
  ]);

  const far = (dx, dy) => Math.hypot(dx, dy);
  const twist = (dx, dy) => 'lmd'[(Math.floor((Math.atan2(dy, dx) + Math.PI) * 28 / (2 * Math.PI)) + (dx + dy > 3 ? 1 : 0)) % 2 + (dx + dy > 3 ? 1 : 0)];
  function hoop(size, paint) {
    const half = (size - 1) / 2;
    return plate(Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => paint(x - half, y - half)).join('')));
  }
  const TORC = hoop(22, (dx, dy) => far(dx, dy) > 10.6 || far(dx, dy) < 7.4 || (dy > 5 && Math.abs(dx) < 3.4) ? ' ' : twist(dx, dy));
  const torcEnds = mat => mark(4, 16, ['llmd      llmd', 'lmmd      lmmd', 'lmdd      lmdd', ' dd        dd '], mat);
  const torcGem = mat => mark(9, 0, ['llmd', 'lmmd', ' dd '], mat);

  const ARM_RING = boxed([
    '    dddddddddd lm  ',
    '  dd          dmd  ',
    ' l              d  ',
    'lm              md ',
    ' lmm dddddddddmdd  ',
    '   lllmmmmmmddddd  ',
    '  l              d ',
    ' lm              md',
    '  lmmddddddddd mdd ',
    '  ddlllmmmmmmddd   ',
    ' l              d  ',
    'lm              md ',
    ' lmm          mdd  ',
    '  lmllmmmmmmddd    ',
    '  md               '
  ]);

  const TOOTH_NECKLACE = plate([
    'y                    x',
    'y                    x',
    'yy                  xx',
    'yy                xx',
    'yyy            xxx',
    'yyyyyyyyyyxxxxxx',
    'lm lm  lm  lm lm',
    'lm lm  lm  lm lm',
    'ld lm  lm  lm ld',
    'd  ld  lm  ld  d',
    'd  lm  d',
    'ld',
    'dd'
  ]);
  const FANG_CHARM = plate([
    'y                x',
    'y                x',
    'yy              xx',
    'yy            xx',
    'yyy        xxx',
    'yyyyyyxxxxxx',
    'LM LM llmd MD MD',
    'LM LM llmd MD MD',
    'LMD LM llmd MD LMD',
    'LD  LD lmmd MD  DD',
    'D   LD lmdd DD   D',
    'D  lmdd  D',
    'lmdd',
    'ld',
    'dd'
  ]);
  const CHAIN_OF_OFFICE = plate([
    'lm                    lm',
    'md                    md',
    '',
    'lm                lm',
    'md                md',
    '',
    'lm            lm',
    'md            md',
    '',
    'lm        lm',
    'md        md',
    '',
    'lm lm lm',
    'md md md',
    'llmm',
    'lllmmd',
    'llmlmmdd',
    'lllommdd',
    'lmmomddd',
    'lmmmmddd',
    'mmmddd',
    'dddd'
  ]);

  const HOOP_BACK = ['mmmmdddd', 'mmmm        dddd', 'mm                dd', 'lm                  md'];
  const CIRCLET = plate([
    ...HOOP_BACK,
    'll        LLMD        dd',
    'llm      LLLMMD      mdd',
    'lllmm    LLMMMD    mmddd',
    'llllmmmmlMMDDdmmmmdddd',
    'lllmmmmmddmmmmmddd',
    'mmmmmmdddddd'
  ]);
  const TWIN_CIRCLET = plate([
    ...HOOP_BACK,
    'll                    dd',
    'llm    LLM    ZZY    mdd',
    'lllmm  LMD    ZYX  mmddd',
    'llllmmMDDmmmmYXXmmdddd',
    'lllmmmmmmmmmmmmddd',
    'mmmmmmdddddd'
  ]);
  const PLAIN_CIRCLET = plate([
    ...HOOP_BACK,
    'll                    dd',
    'llm                  mdd',
    'lllmm              mmddd',
    'lldllmmdmmmdmmdmmddodd',
    'lldmmdmmmdmmmdmddd',
    'mmmmmmdddddd'
  ]);
  const DIADEM = plate([
    'lm',
    'lmmd',
    'll  dd',
    'lmm  mmd',
    'l lmmmmd d',
    'lm  lmmd  md',
    'llllllmmmmmmmmmmdddddd',
    'lm lm lm lmmd md md md',
    'l ml ml mmmmdm dm dm d',
    'lm lm lm lmmd md md md',
    'llllllmmmmmmmmmmdddddd'
  ]);
  const WAR_CROWN = plate([
    'lm',
    'lm',
    'll   lm  llmd  md   dd',
    'll   lm  llmd  md   dd',
    'lll llmm llmd mmdd ddd',
    'llllllmmmmmmmmmmdddddd',
    'lllZZmmmmLLMDmmmmZYddd',
    'lllZYmmmmLMMDmmmmYXddd',
    'llllllmmmmmmmmmmdddddd',
    'oooooooooooooooooooooo',
    'llllmmmmmmmmmmmmdddddd',
    'dddddddddddddddddddd'
  ]);
  const HIGH_CROWN = plate([
    'LM',
    'LLMD',
    'lllmmddd',
    'llyyylmyxxdd',
    'llyyyyylmyyyxxdd',
    'llyyyyyylmyyyyxxdd',
    ...times(3, 'llzyyyyyylmyyyyyxxdd'),
    'llllllmmmmmmmmmmdddddd',
    'lllZZmmmmLLMDmmmmZYddd',
    'lllZYmmmmLMMDmmmmYXddd',
    'llllllmmmmmmmmmmdddddd',
    'oooooooooooooooooooooo',
    'llllmmmmmmmmmmmmdddddd',
    'dddddddddddddddddddd'
  ]);
  const SPARK = mark(11, 0, ['l', 'l'], 'glow');

  const gold = (gem, second) => ({ body: 'gold', trim: gem, lining: second || gem, strap: 'gold' });
  const silver = (gem, second) => ({ body: 'silver', trim: gem, lining: second || gem, strap: 'silver' });
  const ringOf = (id, gem, metal) => ({ id: id + '_ring', draw: () => dress(RING, metal(gem)) });
  const amuletOf = (id, gem, metal) => ({ id: id + '_amulet', draw: () => dress(AMULET, metal(gem)) });
  const GEMS = ['ruby', 'sapphire', 'emerald', 'topaz', 'amethyst', 'citrine'];

  return [
    ...GEMS.map(gem => ringOf(gem, gem, gold)),
    ...GEMS.map(gem => amuletOf(gem, gem, gold)),
    ringOf('moonstone', 'moonstone', silver),
    amuletOf('moonstone', 'moonstone', silver),
    { id: 'iron_signet_ring', draw: () => dress(SIGNET, { body: 'iron' }) },
    { id: 'silver_pendant', draw: () => dress(LEAF_PENDANT, { body: 'silver', strap: 'silver' }) },
    { id: 'wayfarers_pendant', draw: () => dress(TWIN_PENDANT, silver('topaz', 'moonstone')) },
    { id: 'sages_pendant', draw: () => dress(TWIN_PENDANT, gold('sapphire', 'citrine')) },
    { id: 'bronze_torc', draw: () => dress(TORC, { body: 'bronze' }, torcEnds('bronze')) },
    { id: 'gold_torc', draw: () => dress(TORC, { body: 'gold' }, torcEnds('gold'), torcGem('emerald')) },
    { id: 'champions_torc', draw: () => dress(TORC, { body: 'gold' }, torcEnds('ruby'), torcGem('emerald')) },
    { id: 'bronze_arm_ring', draw: () => dress(ARM_RING, { body: 'bronze', lining: 'black' }) },
    { id: 'tooth_necklace', draw: () => dress(TOOTH_NECKLACE, { body: 'bone', strap: 'leather' }) },
    { id: 'fang_charm', draw: () => dress(FANG_CHARM, { body: 'bone', trim: 'horn', strap: 'leather' }) },
    { id: 'gold_chain_of_office', draw: () => dress(CHAIN_OF_OFFICE, { body: 'gold' }) },
    { id: 'bone_circlet', draw: () => dress(PLAIN_CIRCLET, { body: 'bone' }) },
    { id: 'stargazer_circlet', draw: () => dress(CIRCLET, silver('glow'), SPARK) },
    { id: 'scholars_circlet', draw: () => dress(CIRCLET, silver('sapphire')) },
    { id: 'wardens_circlet', draw: () => dress(TWIN_CIRCLET, gold('emerald', 'moonstone')) },
    { id: 'filigree_diadem', draw: () => dress(DIADEM, { body: 'silver', trim: 'silver' }) },
    { id: 'champions_crown', draw: () => dress(WAR_CROWN, gold('ruby', 'topaz')) },
    { id: 'sovereign_crown', draw: () => dress(HIGH_CROWN, { body: 'gold', trim: 'citrine', lining: 'amethyst', strap: 'regal' }) }
  ];
})();
PIXEL_ICONS.push(...PIXEL_JEWELRY);
