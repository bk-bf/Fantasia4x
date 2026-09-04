---
id: g01-audio
title: Branch no caller can reach — audio
status: open
kind: correctness
severity: low
ready: false
origin: audit
rules:
  - G01
files:
  - src/lib/audio/manifest.ts
symbols:
  - src/lib/audio/manifest.ts::resolveAmbient#0
created: 2026-09-04
updated: 2026-09-04
---

# Branch no caller can reach — audio

> **Related:** [issues/README](README.md) · [tools/audit](../../tools/audit/README.md) · [rule source](../../docs/game/ARCHITECTURE.md)

## What breaks

Rule `G01` — branch no caller can reach — holds in 1 place under `audio`. Each one is listed below with the evidence the audit required before it would record a fail.

The clearest case: The `isNight ? 0` arm at src/lib/audio/manifest.ts:272 is unreachable, because the only way into that `else` block is by failing the `else if (isNight)` test at src/lib/audio/manifest.ts:266, so `isNight` is always `false` there.

## Evidence

- [`src/lib/audio/manifest.ts:237`](../../src/lib/audio/manifest.ts#L237) — The `isNight ? 0` arm at src/lib/audio/manifest.ts:272 is unreachable, because the only way into that `else` block is by failing the `else if (isNight)` test at src/lib/audio/manifest.ts:266, so `isNight` is always `false` there.
  - Branch: the true arm of the ternary at src/lib/audio/manifest.ts:272, `layers.forest = isNight ? 0 : 0.15;` — the `0` result. The `else` block at src/lib/audio/manifest.ts:271-273 is the tail of the chain that begins at src/lib/audio/manifest.ts:262 (`weatherType === 'snow'`), src/lib/audio/manifest.ts:264 (`'fog'`), src/lib/audio/manifest.ts:266 (`isNight`), src/lib/audio/manifest.ts:268 (`'clear' || 'heat_wave'`).
  - Guard that cannot hold: `isNight === true` at src/lib/audio/manifest.ts:272. Entering the `else` at src/lib/audio/manifest.ts:271 requires the preceding `else if (isNight)` at src/lib/audio/manifest.ts:266 to have evaluated false, i.e. `isNight === false`. `isNight` is a plain `boolean` parameter (src/lib/audio/manifest.ts:239) and is never reassigned inside the function, so no argument value, weather type or intensity can make line 272's condition true. Every other branch in the function is reachable: I checked each weather id it tests against the ids declared in src/lib/game/database/world/weather.jsonc:5-282 and all of `clear`, `spring_windy`, `summer_windy`, `autumn_windy`, `winter_windy`, `drizzle`, `rain`, `windy_rain`, `heavy_rain`, `storm`, `snow`, `blizzard`, `fog`, `foggy_rain`, `heat_wave`, `gale` exist as real weather states.
  - Call sites: `grep -rn "resolveAmbient" --include="*.ts" --include="*.svelte" --include="*.js" --include="*.jsonc" .` (excluding node_modules) returned exactly three hits — the declaration at src/lib/audio/manifest.ts:237, the import at src/lib/components/UI/audio/AudioController.svelte:14, and the single call at src/lib/components/UI/audio/AudioController.svelte:105. `grep -rn "resolveAmbient\|manifest" src/tests --include="*.ts"` returned nothing, so no test, headless scenario or dev route calls it. The one caller passes `isNight: night` (src/lib/components/UI/audio/AudioController.svelte:107), where `night` is computed at src/lib/components/UI/audio/AudioController.svelte:90 and takes both values, and `weatherType: wx?.type ?? 'clear'` (src/lib/components/UI/audio/AudioController.svelte:106) from the `currentWeather` store — so the caller reaches the `else` block itself, but only ever with `isNight === false`, and no external caller of this exported function could do otherwise since the contradiction is internal to the if/else chain rather than caller-dependent.

## Why nothing caught it

Nothing below the judgment tier can decide this one: it is why `G01` exists at T2 rather than as a lint rule or a test. The invariant is stated in `docs/game/ARCHITECTURE.md`. If the fix makes the class mechanically checkable, add that check and demote the rule — `node tools/audit/audit.mjs demote` tracks which rules have earned it.

## Remediation

- [ ] Confirm each citation above still holds; drop any whose evidence does not.
- [ ] Fix every remaining site under `audio` — this is one class, one PR.
- [ ] Add the check that would have caught it, or record why it stays a judgment call.
- [ ] `pnpm check` and `pnpm test:related` on the changed files are green.

## Out of scope

Sites outside `audio`, and any other rule's findings — they are their own issues. Widening this PR past the citations above makes it unreviewable.
