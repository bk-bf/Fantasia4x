# Music candidates — UNWIRED audition batch

These tracks are **not referenced by `manifest.ts`** and will not play in-game. They sit here so you
can listen first and pick which to promote. Files are the **faithful OGG originals** (no re-encode /
loudness pass yet) so you hear true quality.

All **Alexandr Zhelanov** (our existing primary music artist), mirrored from the Internet Archive
because opengameart.org's front-end was 502-ing. Same author, same originals.

| Suggested scene | File | Original track | Duration | License | Source |
| --------------- | ---- | -------------- | -------- | ------- | ------ |
| day | `day/for-the-king.ogg` | "For The King" | 4:31 | CC-BY 4.0 | https://archive.org/details/alexandrzhelanov-fortheking |
| day | `day/full-of-memories.ogg` | "Full Of Memories" | 1:25 | CC-BY 4.0 | https://archive.org/details/fullofmemories |
| day | `day/medieval-theme-1.ogg` | "СДП (средневековая тема 1)" | 2:53 | CC-BY 3.0 | https://archive.org/details/AlexandrZhelanov-oldmusic · https://opengameart.org/content/old-music |
| day | `day/medieval-theme-2.ogg` | "СДП (Тема срдневек)" | 3:43 | CC-BY 3.0 | https://archive.org/details/AlexandrZhelanov-oldmusic · https://opengameart.org/content/old-music |
| day | `day/legend.ogg` | "Легенда 1" (Legend) | 3:17 | CC-BY 3.0 | https://archive.org/details/AlexandrZhelanov-oldmusic · https://opengameart.org/content/old-music |
| day | `day/magic-actions.ogg` | "Magic Actions" | 2:18 | CC-BY 4.0 | https://archive.org/details/magicactions |
| night | `night/he-will-never-see-her-again.ogg` | "He Will Never See Her Again" | 4:18 | CC-BY 4.0 | https://archive.org/details/hewillneverseeheragain |
| night | `night/unfriendly-forest.ogg` | "Unfriendly forest" | 1:00 | CC-BY 4.0 | https://archive.org/details/magicactions |
| combat | `combat/light-battle.ogg` | "Light Battle Theme" | 1:44 | CC-BY 4.0 | https://archive.org/details/lightbattle |

## To promote a track (later, on your say-so)

1. Loudness-normalise + move it to `static/audio/music/<scene>-N.ogg` (match the existing pipeline).
2. Add its path to the relevant `MUSIC[...]` array and a `TRACK_LABELS` entry in `src/lib/audio/manifest.ts`.
3. Add the attribution row to `AUDIO-CREDITS.md` (all of these are CC-BY → attribution required).
4. Delete this `_candidates/` tree before release so unused audio doesn't ship in the build.
