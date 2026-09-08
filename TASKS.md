# Audit → board, September 8

## Done
- [x] `--only` path filter on `audit issues`
- [x] Audit issue writes go through `tools/issue.mjs`, not raw `gh`
- [x] Audit issues carry a `verify` label, so the gate accepts them
- [x] `finding.issue_number` / `raised_at`, with `audit raised` to read it
- [x] 77 findings across 17 issues linked to the board
- [x] mon removed from the nightly; 4 stuck ci/cl sessions cleared
- [x] Run resumed, window to 02:12 UTC

## Waiting on Kirill
- [ ] Split `game/core` into three segments? Orphans #48, opens 3 new issues.
- [ ] `--rerender` the 14 skipped issues so their bodies carry the new citations?

## Notes
- All 20 groups were already on the board. Nothing new was created.
- 197 findings still unlinked, all `game/core`, all in the 3 held groups.
