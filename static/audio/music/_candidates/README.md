# Music candidates — UNWIRED staging area

Drop tracks you're auditioning here. **Nothing in this tree is referenced by `manifest.ts`, so it
never plays in-game** — it's purely for listening before committing. Keep the originals here (no
re-encode / loudness pass yet) so you hear true quality while choosing.

## Layout — mirrors the shipped tree

```
_candidates/
  all/    menu/  combat/  day/  night/   ← year-round (plays every season)
  spring/ day/  night/
  summer/ day/  night/
  autumn/ day/  night/
  winter/ day/  night/
```

Sort each candidate into the bucket where you think it fits: `all/<scene>` for a year-round track,
`<season>/{day,night}` for a season-specific one. `menu` and `combat` are season-agnostic, so they
only exist under `all/`. (The `.gitkeep` files just keep the empty dirs in git — leave them.)

## Promote a track (the wiring step)

Once you've picked the keepers, each gets:

1. **Loudness-normalise to ≈ −17 LUFS** (matches the shipped catalogue) and encode to OGG, then move
   it to the matching `static/audio/music/<bucket>/<scene>/` folder. Method that works well:
   measure with `ffmpeg -af loudnorm=print_format=json` then apply a single `volume=<−17 − I>dB` gain
   (exact for integrated loudness, preserves dynamics, one encode).
2. Add its path to the right pool in `src/lib/audio/manifest.ts` (`MENU` / `COMBAT` / `DAY_SHARED` /
   `NIGHT_SHARED` / `DAY_SEASONAL[season]` / `NIGHT_SEASONAL[season]`) **and** a `TRACK_LABELS` entry.
3. Add the attribution row to `AUDIO-CREDITS.md` (CC-BY tracks require attribution).

## Before release

This whole `_candidates/` tree should be pruned so unused audio doesn't ship in the build.
