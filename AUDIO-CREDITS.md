# Audio Credits

> **Related:** wired up by [`src/lib/audio/manifest.ts`](src/lib/audio/manifest.ts) ·
> [`src/lib/audio/AudioService.ts`](src/lib/audio/AudioService.ts) ·
> [`src/lib/components/UI/AudioController.svelte`](src/lib/components/UI/AudioController.svelte)

All bundled audio is **CC0** or **CC-BY** and cleared for use in this game, including a commercial
(e.g. itch.io) release. The CC-BY entries below **require attribution** — keep this file shipped with
the build (or surface the credits in-game). Files live in `static/audio/` and were transcoded to OGG
Vorbis (loudness-normalised) from the originals; no other modification.

## Music — Alexandr Zhelanov (OpenGameArt), licensed CC BY 3.0 / 4.0

> Music by **Alexandr Zhelanov** (https://opengameart.org/users/alexandr-zhelanov) — Licensed under
> Creative Commons: By Attribution (3.0 or 4.0 as noted). https://creativecommons.org/licenses/by/4.0/

Medieval / fantasy-RPG campaign music — exploration & town themes by day, dark dungeon themes by
night, and Heroes-of-Might-&-Magic-style battle themes in combat.

| File                 | Original track            | License   | Source page |
| -------------------- | ------------------------- | --------- | ----------- |
| `music/menu.ogg`     | "Campaign"                | CC-BY 3.0 | https://opengameart.org/content/campaign-more-music-inside |
| `music/day-1.ogg`    | "Town"                    | CC-BY 3.0 | https://opengameart.org/content/campaign-more-music-inside |
| `music/day-2.ogg`    | "Middle age RPG Theme 1"  | CC-BY 3.0 | https://opengameart.org/content/campaign-more-music-inside |
| `music/day-3.ogg`    | "Castle"                  | CC-BY 3.0 | https://opengameart.org/content/campaign-more-music-inside |
| `music/day-4.ogg`    | "Middle age RPG Theme 2"  | CC-BY 3.0 | https://opengameart.org/content/campaign-more-music-inside |
| `music/night-1.ogg`  | "Caves of Sorrow"         | CC-BY 3.0 | https://opengameart.org/content/caves-of-sorrow |
| `music/night-2.ogg`  | "Dark Quest"              | CC-BY 4.0 | https://opengameart.org/content/dark-quest |
| `music/combat-1.ogg` | "Battle Theme 1"          | CC-BY 4.0 | https://opengameart.org/content/battle-themes |
| `music/combat-2.ogg` | "Battle Theme 3"          | CC-BY 4.0 | https://opengameart.org/content/battle-themes |
| `music/combat-3.ogg` | "Battle Theme 5"          | CC-BY 4.0 | https://opengameart.org/content/battle-themes |

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
