# Audio Credits

> **Related:** wired up by [`src/lib/audio/manifest.ts`](src/lib/audio/manifest.ts) ·
> [`src/lib/audio/AudioService.ts`](src/lib/audio/AudioService.ts) ·
> [`src/lib/components/UI/AudioController.svelte`](src/lib/components/UI/AudioController.svelte)

All bundled audio is **CC0** or **CC-BY** and cleared for use in this game, including a commercial
(e.g. itch.io) release. The CC-BY entries below **require attribution** — keep this file shipped with
the build (or surface the credits in-game). Files live in `static/audio/` and were transcoded to OGG
Vorbis (loudness-normalised) from the originals; no other modification.

## Music — OpenGameArt (Alexandr Zhelanov & RandomMind)

> Mostly **Alexandr Zhelanov** (https://opengameart.org/users/alexandr-zhelanov), plus one CC0 track
> by **RandomMind**. Licensed per-track as noted below (CC-BY requires attribution; OGA-BY 3.0 is
> OpenGameArt's attribution licence; CC0 needs none). https://creativecommons.org/licenses/by/4.0/

Medieval / fantasy-RPG campaign music — exploration & town themes by day, dark dungeon themes by
night, and Heroes-of-Might-&-Magic-style battle themes in combat.

| File                    | Original track            | Author           | License   | Source page |
| ----------------------- | ------------------------- | ---------------- | --------- | ----------- |
| `music/menu.ogg`        | "Campaign"                | Alexandr Zhelanov | CC-BY 3.0 | https://opengameart.org/content/campaign-more-music-inside |
| `music/menu-kingdom.ogg`| "Kingdom Theme"           | Alexandr Zhelanov | CC-BY 3.0 | https://opengameart.org/content/old-music |
| `music/day-1.ogg`       | "Town"                    | Alexandr Zhelanov | CC-BY 3.0 | https://opengameart.org/content/campaign-more-music-inside |
| `music/day-2.ogg`       | "Middle age RPG Theme 1"  | Alexandr Zhelanov | CC-BY 3.0 | https://opengameart.org/content/campaign-more-music-inside |
| `music/day-3.ogg`       | "Castle"                  | Alexandr Zhelanov | CC-BY 3.0 | https://opengameart.org/content/campaign-more-music-inside |
| `music/day-4.ogg`       | "Middle age RPG Theme 2"  | Alexandr Zhelanov | CC-BY 3.0 | https://opengameart.org/content/campaign-more-music-inside |
| `music/day-5.ogg`       | "Medieval: The Bard's Tale" | RandomMind     | CC0       | https://opengameart.org/content/medieval-the-bards-tale |
| `music/night-1.ogg`     | "Caves of Sorrow"         | Alexandr Zhelanov | CC-BY 3.0 | https://opengameart.org/content/caves-of-sorrow |
| `music/night-2.ogg`     | "Dark Quest"              | Alexandr Zhelanov | CC-BY 4.0 | https://opengameart.org/content/dark-quest |
| `music/night-3.ogg`     | "A Darkness Opus"         | Alexandr Zhelanov | OGA-BY 3.0 | https://opengameart.org/content/a-darkness-opus |
| `music/combat-1.ogg`    | "Battle Theme 1"          | Alexandr Zhelanov | CC-BY 4.0 | https://opengameart.org/content/battle-themes |
| `music/combat-2.ogg`    | "Battle Theme 3"          | Alexandr Zhelanov | CC-BY 4.0 | https://opengameart.org/content/battle-themes |
| `music/combat-3.ogg`    | "Battle Theme 5"          | Alexandr Zhelanov | CC-BY 4.0 | https://opengameart.org/content/battle-themes |

## Ambient — JC Sounds, "Nature Ambient Pack Vol 1", licensed CC BY 4.0

> Nature ambience by **JC Sounds**, from "Nature Ambient Pack Vol 1" on OpenGameArt
> (https://opengameart.org/content/jc-sounds-nature-ambient-pack-vol-1) — Licensed under
> Creative Commons: By Attribution 4.0 http://creativecommons.org/licenses/by/4.0/

| File                        | Original loop          |
| --------------------------- | ---------------------- |
| `ambient/birds-day.ogg`     | "Forest Day"           |
| `ambient/night-crickets.ogg`| "Summer Evening"       |
| `ambient/wind.ogg`          | "Winter Wind"          |
| `ambient/rain.ogg`          | "Light Rain"           |
| `ambient/rain-heavy.ogg`    | "Heavy Thunderstorm"   |
| `ambient/forest.ogg`        | "Pine Forest"          |
| `ambient/fire.ogg`          | "Campfire Crackling"   |

## Creature SFX — per-creature vocalisations (`audio/creatures/<archetype>/`)

Intermittent, viewport/zoom-aware one-shots keyed by a creature `audio` archetype in
creatures.jsonc. Mixed sources:

| Archetype dir(s)                                                    | Source | Author | License |
| ------------------------------------------------------------------ | ------ | ------ | ------- |
| `canine`, `beast`, `grunt`, `critter`, `insect`, `reptile`, `goblinoid`, `wraith`, `raptor` | "80 CC0 creature SFX" (https://opengameart.org/content/80-cc0-creature-sfx) | rubberduck | CC0 |
| `fowl`                                                             | "Chicken Sound Effect" (https://opengameart.org/content/chicken-sound-effect) | IMadeIt | CC-BY 3.0 |
| `frog`                                                             | "Mutant Frog" (https://opengameart.org/content/mutant-frog) | AntumDeluge | CC0 |
| `goat`                                                             | "Goat Bleat" (https://opengameart.org/content/goat-bleat) | leone | CC-BY 4.0 |
| `boar`                                                             | "Pig SFX Pack" (https://opengameart.org/content/pig-sfx-pack) | Vinrax | CC-BY 3.0 |
| `rustle` (giant rat)                                              | "20 Rustles of dry leaves" (https://opengameart.org/content/20-rustles-dry-leaves) | qubodup | CC0 |

## Work SFX — medieval labour (`audio/work/<work-category>/`)

Intermittent, viewport/zoom-aware one-shots for pawns currently working, keyed by work category
(or a `jobs.jsonc` JobDef `audio` override).

| Category dir(s)                                            | Source | Author | License |
| --------------------------------------------------------- | ------ | ------ | ------- |
| `woodcutting`, `mining`, `construction`, `crafting`        | "100 CC0 metal and wood SFX" (https://opengameart.org/content/100-cc0-metal-and-wood-sfx) | rubberduck | CC0 |
| `foraging`, `planting`                                     | "20 Rustles of dry leaves" (https://opengameart.org/content/20-rustles-dry-leaves) | qubodup | CC0 |

## UI SFX — button hover / click (`audio/ui/`)

Subtle interface feedback played globally on button hover/press.

| File             | Source | Author | License |
| ---------------- | ------ | ------ | ------- |
| `ui/hover.ogg`   | "51 UI sound effects" (https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks) | Kenney (kenney.nl) | CC0 |
| `ui/click.ogg`   | "51 UI sound effects" (https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks) | Kenney (kenney.nl) | CC0 |
| `ui/threat-alert.ogg` | "Attention" bugle call (https://commons.wikimedia.org/wiki/File:Attention_Bugle_Call_(US).oga) — threat-sighted alarm; trimmed + loudness-normalised | U.S. Army Band | Public domain |

## Combat SFX — weapon swings + condition cues (`audio/combat/<id>/`)

Per-swing weapon sounds (the item/natural-weapon `audio` archetype in items.jsonc) and per-onset
combat-condition cues (the condition `audio` in conditions.jsonc). All CC0.

| Archetype(s)                                                  | Source | Author | License |
| ------------------------------------------------------------- | ------ | ------ | ------- |
| `slash`, `pierce`, `blunt`, `bow`, `bite` (weapon swings)     | "Swishes Sound Pack" (https://opengameart.org/content/swishes-sound-pack) | artisticdude | CC0 |
| `venom`, `screech`, `spectral`, `tongue`, `shock`, `envenomed`, `disoriented`, `ensnared`, `bloodletting` | "80 CC0 creature SFX" (https://opengameart.org/content/80-cc0-creature-sfx) | rubberduck | CC0 |
| `knockdown`, `fracture`                                       | "100 CC0 metal and wood SFX" (https://opengameart.org/content/100-cc0-metal-and-wood-sfx) | rubberduck | CC0 |
