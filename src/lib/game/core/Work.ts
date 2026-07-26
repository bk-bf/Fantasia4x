// Work.ts - Work Categories Database
// Business logic has been moved to WorkService
import type { WorkCategory } from './types';

// Work Categories Database
export const WORK_CATEGORIES: WorkCategory[] = [
  // HARVESTING WORK
  {
    id: 'foraging',
    name: 'Foraging',
    description: 'Gather berries, nuts, and edible plants from the wild',
    color: '#4CAF50',
    // Tool-free (the bootstrap activity) — a knife/sickle speeds it up but is never required.
    boostTools: ['flint_knife', 'flint_sickle'],
    primaryStat: 'perception',
    secondaryStat: 'constitution',
    baseEfficiency: 1.0
  },
  {
    id: 'woodcutting',
    name: 'Woodcutting',
    description: 'Harvest wood from trees in forests and groves',
    color: '#8D6E63',
    toolsRequired: ['stone_axe', 'iron_axe', 'steel_axe'],
    primaryStat: 'strength',
    secondaryStat: 'constitution',
    baseEfficiency: 1.0
  },
  {
    id: 'mining',
    name: 'Mining',
    description: 'Extract stone, ore, and minerals from quarries and mines',
    color: '#607D8B',
    toolsRequired: ['stone_pick', 'iron_pick', 'steel_pick'],
    primaryStat: 'strength',
    secondaryStat: 'constitution',
    baseEfficiency: 1.0
  },
  {
    id: 'hunting',
    name: 'Hunting',
    description: 'Hunt animals for meat, hide, and other materials',
    color: '#8D4E85',
    // No tool gate: hunting is gated by the WEAPON the pawn carries (combat), not a harvest tool.
    primaryStat: 'dexterity',
    secondaryStat: 'perception',
    baseEfficiency: 1.0
  },
  {
    id: 'butchery',
    name: 'Butchery',
    description: 'Process animal carcasses into meat, hide, and bone at a butcher spot',
    color: '#C62828',
    toolsRequired: [
      'flint_knife',
      'stone_chopper',
      'bone_cleaver',
      'iron_butchery_kit',
      'steel_butchery_kit'
    ],
    primaryStat: 'strength',
    secondaryStat: 'dexterity',
    baseEfficiency: 1.0
  },
  {
    id: 'fishing',
    name: 'Fishing',
    description: 'Catch fish from rivers, lakes, and streams',
    color: '#4FC3F7',
    // No tool gate yet: fishing has no world content (0 fish nodes). Add a rod when fishing ships.
    primaryStat: 'dexterity',
    secondaryStat: 'perception',
    baseEfficiency: 1.0
  },
  {
    id: 'planting',
    name: 'Planting',
    description: 'Sow seeds, tend crops, and manage farmland',
    color: '#66BB6A',
    toolsRequired: ['flint_sickle', 'stone_hoe', 'iron_hoe', 'steel_hoe'],
    primaryStat: 'dexterity',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },

  // CRAFTING WORK — the generic `crafting` catch-all is DISSOLVED (§D): every craft now routes to a
  // real discipline (metalworking / woodworking / tailoring / stoneworking / pottery / cooking / alchemy)
  // by its recipe `discipline` tag or its station. `crafting` survives only as a code sentinel + the
  // `crafting_*` fallback stats; a `recipeDiscipline.test.ts` guard fails if any recipe routes to it.
  {
    id: 'metalworking',
    name: 'Metalworking',
    description: 'Smelt ores and forge metal items',
    color: '#FF5722',
    toolsRequired: ['wooden_tongs', 'iron_tongs', 'steel_tongs'],
    primaryStat: 'strength',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  {
    // Soft-goods PARENT (jobs.jsonc discipline tree). Splits into the Leatherwork + Weaving subjobs;
    // a craft order at a tannery/loom routes here, and the leaf drives its stats/tools.
    id: 'tailoring',
    name: 'Tailoring',
    description: 'Work hides and fibres into leather, cloth, and finished apparel',
    color: '#A1887F',
    primaryStat: 'dexterity',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  {
    id: 'leatherworking',
    name: 'Leatherwork',
    description: 'Flesh, curry, and sew hides into leather goods',
    color: '#8D6E63',
    // The fleshing/currying/sewing tools gate + boost by tier: a flint knife (t0) can't flesh a hide
    // (the flesh recipe needs a t1 fleshing tool), so a colony must craft a bone scraper first. Knives
    // stay in the list for the sewing/cutting steps.
    toolsRequired: [
      'flint_knife',
      'iron_knife',
      'steel_knife',
      'bone_fleshing_scraper',
      'iron_fleshing_knife',
      'curriers_kit',
      'steel_curriers_kit',
      'sewing_kit',
      'tailors_kit'
    ],
    primaryStat: 'dexterity',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  {
    // Carpentry: planks, furniture, bows, and tool/weapon hafts. Station-gated (sawtable / carpenter's
    // bench); a knife/adze speeds carving but never gates it.
    id: 'woodworking',
    name: 'Woodworking',
    description: 'Carve wood — planks, furniture, bows, and seasoned tool hafts',
    color: '#A0522D',
    boostTools: ['flint_knife', 'iron_knife', 'steel_knife'],
    primaryStat: 'dexterity',
    secondaryStat: 'strength',
    baseEfficiency: 1.0
  },
  {
    // Stone-shaping PARENT: one skill across the whole game (Knapping → Masonry → Lapidary →
    // Bonecarving), so the hard-material specialist never goes obsolete when metal arrives.
    id: 'stoneworking',
    name: 'Stoneworking',
    description: 'Shape hard material — chipped tools, dressed blocks, cut gems, carved bone',
    color: '#78909C',
    primaryStat: 'strength',
    secondaryStat: 'dexterity',
    baseEfficiency: 1.0
  },
  {
    // Ceramics: clay formed and kiln-fired (pots, bricks, tiles, urns, porcelain, glass). Station-gated.
    id: 'pottery',
    name: 'Pottery',
    description: 'Form and fire clay — pots, bricks, tiles, urns, and glass',
    color: '#B5651D',
    primaryStat: 'dexterity',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  {
    id: 'digging',
    name: 'Digging',
    description: 'Excavate soil, clay, and minerals from the ground',
    color: '#8D6E63',
    // Tool-free (dig interactions require no tool) — a stick/spade/shovel speeds it up, never gates.
    boostTools: ['digging_stick', 'stone_spade', 'iron_shovel', 'steel_shovel'],
    primaryStat: 'dexterity',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },

  // SPECIALIZED WORK
  {
    id: 'research',
    name: 'Research',
    description: 'Study scrolls, conduct experiments, and advance knowledge',
    color: '#9C27B0',
    skillRequired: 'scholarship',
    primaryStat: 'intelligence',
    secondaryStat: 'perception',
    baseEfficiency: 1.0
  },
  {
    id: 'construction',
    name: 'Construction',
    description: 'Build structures, roads, and infrastructure',
    color: '#4CAF50',
    // Tool-free (you can build bare-handed) — a hammer held by the builder speeds it up, never gates.
    // Same boost-only pattern as digging's spade/shovel: a stone→iron→steel hammer adds its
    // `toolBoost.speed` (items.jsonc) to the construction work multiplier.
    boostTools: ['stone_hammer', 'iron_hammer', 'steel_hammer'],
    primaryStat: 'strength',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  {
    id: 'alchemy',
    name: 'Alchemy',
    description: 'Create potions, elixirs, and magical compounds',
    color: '#9C27B0',
    // No tool gate: alchemy is STATION-gated (alchemy_lab / apothecary), not tool-gated.
    skillRequired: 'alchemy',
    primaryStat: 'intelligence',
    secondaryStat: 'perception',
    baseEfficiency: 1.0
  },
  {
    id: 'caretaking',
    name: 'Caretaking',
    description: 'Treat injuries, administer medicine, and care for the sick',
    color: '#E53935',
    toolsRequired: ['herbal_kit', 'bandages', 'medicine'],
    skillRequired: 'medicine',
    primaryStat: 'intelligence',
    secondaryStat: 'dexterity',
    baseEfficiency: 1.0
  },
  // Phase 6: cooking over campfire
  {
    id: 'cooking',
    name: 'Cooking',
    description: 'Prepare food at a campfire or cooking station',
    color: '#FF9800',
    // The clay cooking pot is the cooking-vessel tool: only recipes that DECLARE a `cooking`
    // toolRequirement (the stews — you can't boil a stew without a pot) are gated on it; tool-free
    // campfire cooking like spit-roasting (no recipe toolRequirement) is unaffected. ADR-009 auto-grab
    // applies — a cook fetches the pot from the colony stock en route, and it wears with use.
    toolsRequired: ['clay_cooking_pot'],
    // A stone chopper (the first cleaver) doesn't GATE cooking — you can spit-roast bare-handed — but
    // held it speeds prep (quartering/mincing for the pot). Boost-only, like the sickle on foraging.
    boostTools: ['stone_chopper'],
    primaryStat: 'intelligence',
    secondaryStat: 'dexterity',
    baseEfficiency: 1.0
  },

  // ── CRAFT-DISCIPLINE LEAVES — first-class work categories so each can carry its OWN tools/boosts and
  //    be tool-gated. They render as SUBJOBS of their parent in the Work tab (filtered from the top row
  //    by `jobService.isCraftSubjob`), and each is its own independent skill. `leatherworking`/`butchery`
  //    (legacy leaves) already have entries above; these are the rest.
  {
    id: 'weaving',
    name: 'Weaving',
    description: 'Twist fibre and weave cloth, wicker, and basketry; sew cloth garments',
    color: '#C0A060',
    // Only recipes that DECLARE `toolRequirement:{weaving,…}` gate on a kit — tool-free wicker is unaffected.
    toolsRequired: ['sewing_kit', 'tailors_kit'],
    primaryStat: 'dexterity',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  {
    id: 'knapping',
    name: 'Knapping',
    description: 'Knap flint and stone into edges, heads, and points',
    color: '#9AA0A6',
    // Bootstrap-free (the first tools are knapped bare-handed); a hammerstone-grade hammer speeds it.
    boostTools: ['stone_hammer', 'iron_hammer', 'steel_hammer'],
    primaryStat: 'strength',
    secondaryStat: 'dexterity',
    baseEfficiency: 1.0
  },
  {
    id: 'masonry',
    name: 'Masonry',
    description: 'Dress and lay stone — blocks, walls, querns',
    color: '#78909C',
    boostTools: ['stone_hammer', 'iron_hammer', 'steel_hammer'],
    primaryStat: 'strength',
    secondaryStat: 'dexterity',
    baseEfficiency: 1.0
  },
  {
    id: 'lapidary',
    name: 'Lapidary',
    description: 'Cut and polish gems',
    color: '#7E57C2',
    primaryStat: 'dexterity',
    secondaryStat: 'perception',
    baseEfficiency: 1.0
  },
  {
    id: 'bonecarving',
    name: 'Bonecarving',
    description: 'Carve bone, antler, and ivory into tools, weapons, and charms',
    color: '#C8A87A',
    boostTools: ['flint_knife', 'iron_knife', 'steel_knife'],
    primaryStat: 'dexterity',
    secondaryStat: 'perception',
    baseEfficiency: 1.0
  },
  {
    id: 'meals',
    name: 'Meals',
    description: 'Cook stews, roasts, and prepared dishes',
    color: '#FF9800',
    primaryStat: 'dexterity',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  {
    id: 'baking',
    name: 'Baking',
    description: 'Mill flour and bake bread and pies',
    color: '#D4A056',
    primaryStat: 'dexterity',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  {
    id: 'brewing',
    name: 'Brewing',
    description: 'Ferment ale, wine, and cider',
    color: '#B5651D',
    primaryStat: 'intelligence',
    secondaryStat: 'perception',
    baseEfficiency: 1.0
  },
  {
    id: 'herbalism',
    name: 'Herbalism',
    description: 'Gather and prepare herbal poultices, salves, and washes',
    color: '#6FA06F',
    primaryStat: 'intelligence',
    secondaryStat: 'perception',
    baseEfficiency: 1.0
  },
  {
    id: 'potions',
    name: 'Potions',
    description: 'Brew potions, tonics, and coatings from reagents',
    color: '#9C27B0',
    primaryStat: 'intelligence',
    secondaryStat: 'perception',
    baseEfficiency: 1.0
  },
  // Phase 7: hauling — carry dropped items to storage
  {
    id: 'hauling',
    name: 'Hauling',
    description: 'Pick up resources left on the ground and carry them to a storage building',
    color: '#FFB300',
    primaryStat: 'strength',
    secondaryStat: 'constitution',
    baseEfficiency: 1.0
  }
];
