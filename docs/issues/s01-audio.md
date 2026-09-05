---
id: s01-audio
title: Hand-maintained roster restates a declared set — audio
status: open
kind: drift
severity: high
ready: false
origin: audit
rules:
  - S01
files:
  - src/lib/audio/manifest.ts
symbols:
  - src/lib/audio/manifest.ts::TRACK_LABELS#0
  - src/lib/audio/manifest.ts::WORK_SOUND_LABELS#0
  - src/lib/audio/manifest.ts::COMBAT_SFX#0
created: 2026-09-04
updated: 2026-09-05
---

# Hand-maintained roster restates a declared set — audio

> **Related:** [issues/README](README.md) · [tools/audit](../../tools/audit/README.md) · [rule source](../../docs/issues/core-stat-single-source.md)

## What breaks

Rule `S01` — hand-maintained roster restates a declared set — holds in 3 places under `audio`. Each one is listed below with the evidence the audit required before it would record a fail.

The clearest case: TRACK_LABELS hand-lists every track URL already declared by the playlist arrays in the same file, so a track added to a playlist without a matching label entry silently renders its raw filename in the UI.

## Evidence

- [`src/lib/audio/manifest.ts:86`](../../src/lib/audio/manifest.ts#L86) — TRACK_LABELS hand-lists every track URL already declared by the playlist arrays in the same file, so a track added to a playlist without a matching label entry silently renders its raw filename in the UI.
  - Hand-written list: src/lib/audio/manifest.ts:86-108 — 21 literal URL keys.
  - The set is declared at src/lib/audio/manifest.ts:7 (MENU, 2 urls), :8-14 (COMBAT, 5), :16-25 (DAY_SHARED, 8), :26-31 (DAY_SEASONAL, 1 under winter), :32-38 (NIGHT_SHARED, 5), :39-44 (NIGHT_SEASONAL, 0) — total 21, the same 21 URLs TRACK_LABELS repeats; those arrays are what src/lib/audio/manifest.ts:46-57 `playlistFor` returns and what src/lib/audio/AudioService.ts:111 plays. TRACK_LABELS is typed `Record<string, string>`, not keyed off those arrays, so nothing checks the two agree.
  - Adding e.g. '/audio/music/all/day/day-9.ogg' to DAY_SHARED (src/lib/audio/manifest.ts:16-25) makes AudioService play it, and src/lib/audio/manifest.ts:119-122 `trackLabel` misses the lookup and falls back to `url.split('/').pop()`, so src/lib/components/UI/audio/AudioNowPlaying.svelte:17 shows the player the string 'day-9.ogg' — a raw file id instead of a track name. No test guards it: `grep -rln "audio\|TRACK_LABELS\|manifest" src/tests` returns nothing, and `grep -rn "TRACK_LABELS\|trackLabel" src` hits only manifest.ts and AudioNowPlaying.svelte.
- [`src/lib/audio/manifest.ts:193`](../../src/lib/audio/manifest.ts#L193) — WORK_SOUND_LABELS hand-copies the six keys of WORK_SFX, so a seventh work sound added to WORK_SFX gets no label and the raw id is rendered in the audio readout.
  - Hand-written list: src/lib/audio/manifest.ts:193-200 — WORK_SOUND_LABELS spells out woodcutting, mining, construction, crafting, foraging, planting as a Record<string, string> with no union type constraining it.
  - The set is declared at src/lib/audio/manifest.ts:184-191 (WORK_SFX), whose keys are the same six ids and which is the gate on what can ever reach the label lookup: src/lib/components/UI/audio/AudioController.svelte:243 drops any soundId with `workClipsFor(soundId).length === 0`, and workClipsFor tests membership in WORK_SFX at src/lib/audio/manifest.ts:203. The ids themselves originate outside the manifest — job defs' `audio` field (src/lib/game/database/pawns/jobs.jsonc:4,5,10,46,47, read via src/lib/game/services/JobService.ts:348-350) and work categories from src/lib/game/services/JobService.ts:332-334, which return values such as 'cooking' and 'stoneworking' (src/tests/game/services/jobRegistry.test.ts:62-63) that have no entry in either manifest table. No test names WORK_SOUND_LABELS: `grep -rn "WORK_SOUND_LABELS" src/tests` returns nothing, and `grep -rn "WORK_SOUND_LABELS\|WORK_SFX\|workClipsFor" src tools docs` finds call sites only in src/lib/audio/manifest.ts and src/lib/components/UI/audio/AudioController.svelte:17-18,243,252-253.
  - Concretely: add `cooking: workClips('cooking', 3)` to WORK_SFX (src/lib/audio/manifest.ts:184) and ship /audio/work/cooking/*.ogg — the clips play, but src/lib/components/UI/audio/AudioController.svelte:253 falls through its `WORK_SOUND_LABELS[id] ?? id` fallback, passes the raw id 'cooking' into audioService.setWorkLevels (src/lib/audio/AudioService.ts:149-151), which publishes it as `work` (src/lib/audio/AudioService.ts:215) and it is printed to the player at src/lib/components/UI/audio/AudioNowPlaying.svelte:57. The mismatch never throws and no test fails; the only symptom is an internal identifier shown in the now-playing list.
- [`src/lib/audio/manifest.ts:209`](../../src/lib/audio/manifest.ts#L209) — COMBAT_SFX hand-lists the combat `audio` ids that items.jsonc and conditions.jsonc declare, and it is already short by three: `reptile`, `whoosh` and `blade` are set on items but have no entry, so those attacks play no sound.
  - src/lib/audio/manifest.ts:209-226 — `COMBAT_SFX: Record<string, string[]>` with 16 hand-written keys (slash, pierce, blunt, bow, bite, venom, screech, spectral, tongue, knockdown, fracture, shock, envenomed, disoriented, ensnared, bloodletting). Typed `Record<string, ...>`, so the compiler checks nothing — unlike the neighbouring CREATURE_SFX at src/lib/audio/manifest.ts:143, which is `Record<CreatureSoundId, string[]>` against the union at src/lib/audio/manifest.ts:130-138.
  - The set is declared in the data files, as the values of the optional `audio` field: `Item.audio` at src/lib/game/core/types/items.ts:313, written in src/lib/game/database/items/items.jsonc (grep '"audio"\s*:\s*"[a-z_-]*"' over that file yields slash×50, pierce×41, blunt×38, bow×25, spectral×14, bite×6, whoosh×2, venom×2, blade×2, tongue×1, screech×1, reptile×1); and the condition `audio` field at src/lib/game/core/types/health.ts:33, written in src/lib/game/database/pawns/conditions.jsonc (fracture, shock, knockdown, envenomed, disoriented, ensnared, bloodletting — e.g. src/lib/game/database/pawns/conditions.jsonc:130, :369, :634, :1017, :1036, :1048, :1084). Those values reach COMBAT_SFX at src/lib/game/systems/Combat.ts:1229 (`itemService.getItemById(result.weaponId)?.audio` → `simLog.pushCombatSound`) and src/lib/game/systems/Combat.ts:1155 / :1305 (`conditionAudio(id)` → `pushCombatSound`). No test asserts the two agree: `grep -rn "audio" src/tests` returns no matches, and `grep -rn "COMBAT_SFX\|combatClipsFor" src/ tools/ docs/` hits only manifest.ts and AudioController.svelte.
  - Five item entries already carry `audio` ids COMBAT_SFX does not list: src/lib/game/database/items/items.jsonc:6313 `"reptile"`, :6334 and :8082 `"whoosh"`, :11081 and :11112 `"blade"`. When one of those weapons swings, Combat.ts:1230 pushes `{sound: 'blade'}`, `combatClipsFor` at src/lib/audio/manifest.ts:228-229 returns `[]` because `'blade' in COMBAT_SFX` is false, and AudioController.svelte:346-348 hits `if (clips.length === 0) continue` — the swing is silent with no error, warning or type failure anywhere. (`reptile` is a member of the CreatureSoundId union at src/lib/audio/manifest.ts:135, so it resolves through CREATURE_SFX for creature vocals but not through the combat lookup that Combat.ts:1229 sends it to.) Any new `audio` value added to items.jsonc or conditions.jsonc fails the same way.

## Why nothing caught it

Nothing below the judgment tier can decide this one: it is why `S01` exists at T2 rather than as a lint rule or a test. The invariant is stated in `docs/issues/core-stat-single-source.md`. If the fix makes the class mechanically checkable, add that check and demote the rule — `node tools/audit/audit.mjs demote` tracks which rules have earned it.

## Remediation

- [ ] Confirm each citation above still holds; drop any whose evidence does not.
- [ ] Fix every remaining site under `audio` — this is one class, one PR.
- [ ] Add the check that would have caught it, or record why it stays a judgment call.
- [ ] `pnpm check` and `pnpm test:related` on the changed files are green.

## Out of scope

Sites outside `audio`, and any other rule's findings — they are their own issues. Widening this PR past the citations above makes it unreviewable.
