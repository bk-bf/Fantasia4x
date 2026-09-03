# Cross-cutting structural audit

Scope: circular imports, dead exports, duplicated helpers, test conventions, config hygiene,
repo hygiene. Verified with `madge`, `knip`, and manual grep against `src/`, `src/tests/`, and
the `.jsonc` data files -- see each bullet's Evidence.

## 1. Circular imports

`pnpm dlx madge --circular --extensions ts,svelte --ts-config tsconfig.json src` found 6 cycles.
Each was traced by grepping the actual import lines to tell value cycles (real runtime hazard)
from type-only cycles (erased at compile, cosmetic).

- **[medium]** src/lib/game/entities/Pawns.ts:22 / src/lib/game/systems/Combat.ts:51 -- `Pawns.ts` imports `createBodyPlanLimbs` from `Combat.ts`, which imports `calcMaxStamina` back from `Pawns.ts`; both are real value imports, so the two modules initialize each other. Evidence: madge cycle #2, confirmed with `grep -n "Combat" src/lib/game/entities/Pawns.ts` and `grep -n "from.*Pawns" src/lib/game/systems/Combat.ts`.
- **[medium]** src/lib/game/systems/Combat.ts:71 -> src/lib/game/services/KingdomService.ts:35 -> src/lib/game/services/entity/kingdomParties.ts:14 -> src/lib/game/services/entity/entitySpawning.ts:4-5 -> back to Combat.ts and Pawns.ts -- a 4-module value cycle: `entitySpawning.ts` imports `calcMaxStamina` from `Pawns.ts` and `createBodyPlanLimbs` from `Combat.ts`, closing the loop from `KingdomService`/`kingdomParties`. Evidence: madge cycles #4 and #5, confirmed by grepping each import line in the chain (`KingdomService`, `kingdomParties`, `entitySpawning`).
- **[low]** src/lib/stores/simLogBridge.ts:7 / src/lib/stores/gameState.ts:14 -- `gameState.ts` does a bare side-effect `import './simLogBridge'`, and `simLogBridge.ts` imports `requestThreatPause, requestDeathPause` back from `gameState.ts`. Real value cycle but small (one binding pair) and initialization-order sensitive only for those two functions. Evidence: madge cycle #6, confirmed via `grep -n "gameState" src/lib/stores/simLogBridge.ts` and `grep -n "simLogBridge" src/lib/stores/gameState.ts`.
- **[low]** src/lib/game/core/types/items.ts:2 / src/lib/game/core/types/culture.ts:1 -- both sides are `import type`, erased at compile time. No runtime cycle; madge counts it because it doesn't distinguish type-only edges. Evidence: madge cycle #1; both import lines confirmed as `import type`.
- **[low]** src/lib/game/services/PathfinderService.ts:2 / src/lib/game/services/WasmPathfinderService.ts:2 -- `PathfinderService.ts` has a real value import of `wasmPathfinderService`, but `WasmPathfinderService.ts`'s import of `PathfinderService` back is `import type` only, so there's no runtime cycle, just a graph edge. Evidence: madge cycle #3, confirmed by reading both import lines.

## 2. Dead exports

`pnpm dlx knip --no-progress` reported 23 "unused files" and 281 "unused exports". Both lists
over-report (CLI entry scripts, Electron/vscode-extension entry points, and exports consumed
only within their own file all get flagged). Verified each candidate by grepping `src/`,
`src/tests/`, and `.jsonc` files for the symbol/filename.

**Dead files** (zero references anywhere, confirmed via `grep -rni <name> src tools scripts`):
- **[medium]** src/lib/components/UI/hud/ActivityLogOverlay.svelte -- no import anywhere in `src`.
- **[medium]** src/lib/components/UI/hud/TaskContainer.svelte -- no import anywhere in `src`.
- **[medium]** src/lib/components/UI/widget/CancelButton.svelte -- no import anywhere in `src`.
- **[medium]** src/lib/game/ai/CharacterGenerator.ts -- no import anywhere in `src`.
- **[medium]** src/lib/game/ai/EventGenerator.ts -- no import anywhere in `src`.
- **[low]** src/lib/game/core/util/devFlags.ts -- no import anywhere in `src`.
- **[medium]** src/lib/webgl/font-loader.ts -- the rest of `src/lib/webgl` is actively used (confirmed via `grep -rln "lib/webgl" src`), but nothing imports `font-loader.ts` itself.
- **[low]** src/lib/game/world/MapRenderer.ts + src/lib/components/UI/canvas/ASCIIMap.svelte -- `MapRenderer.ts` is the only importer of `ASCIIMap.svelte`, and nothing imports `MapRenderer.ts`; the pair is a dead subtree together.
- **[low]** src/lib/dev/AuditTables.svelte + src/lib/dev/SortableTable.svelte + src/lib/dev/sortableTable.ts -- `AuditTables.svelte` imports both of the others, but nothing imports `AuditTables.svelte` itself (confirmed with `grep -rn "AuditTables" src`), so all three are a dead subtree -- an audit-table dev page that was never wired into a route.

**Dead exports** (symbol has exactly one hit repo-wide -- its own declaration -- via `grep -rn "\bSYM\b" src --include=*.ts --include=*.svelte --include=*.jsonc`, and also confirmed via a second unscoped `grep -rn SYM .` including `docs/`):
- **[low]** src/lib/components/UI/canvas/selectionCard.ts:406 -- `jobResourceName` is declared and never called.
- **[low]** src/lib/components/util/pawnUtils.ts:155 -- `getStatColor` is declared and never called.
- **[low]** src/lib/components/util/pawnUtils.ts:266 -- `getEfficiencyDescription` is declared and never called.
- **[low]** src/lib/components/util/pawnUtils.ts:274 -- `formatAbilityName` is declared and never called.
- **[low]** src/lib/components/util/pawnUtils.ts:286 -- `formatEffectValue` is declared and never called (only other hit is a docs mention in an archived review doc).

**Checked, not a problem** (knip false positives, verified by grep):
- `tools/audit/fix.mjs`, `tools/audit/lib/prs.mjs` -- invoked as CLI entry points (`node tools/audit/fix.mjs --next`) from `tools/audit/README.md` and `tools/audit/deploy/nightly-audit.sh`, not via `import`.
- `tools/vscode-build-distance/extension.js` -- the `main` entry of a vscode extension `package.json`, loaded by VS Code, not by the app's import graph.
- `electron/preload.cjs` -- loaded via `path.join(__dirname, 'preload.cjs')` string in `electron/main.cjs`, which knip's static analysis doesn't follow.
- `scripts/dev-tools/geardb/main.ts`, `.../shims/state.ts`, `.../vite.config.mjs` -- built by `scripts/dev-tools/pack.mjs` (`pnpm tools:pack`), a separate mini Vite app, not part of the main import graph.
- `desktop-spike/electron/main.js`, `desktop-spike/electron/preload.cjs` -- labeled "throwaway wrappers" in `desktop-spike/README.md`, run manually, not part of the main build.
- `scripts/profile-self.mjs`, `scripts/profile-window.mjs` -- standalone CLI scripts run manually with `node`, not imported.
- `buildArmorModel`, `pawnStateLabel`, `mobDisplayName` (selectionCard.ts), `bodyPartName` (combatNarration.ts), `CATEGORY_LABELS` (itemCategoryTree.ts), `STAT_REF` (buildFit.ts) -- each is exported but only used inside its own file; not dead code, just an export keyword that could be dropped.
- `uuid` (dependency) and `@types/uuid` (devDependency) -- knip's "unused dependencies" list; confirmed zero `from 'uuid'` imports anywhere in `src`. Worth dropping from `package.json` but not a structural finding.

## 3. Duplicated utility helpers

- **[critical]** src/lib/dev/gearDb.ts:425-429 and src/lib/dev/itemTree.ts:31-35 -- byte-identical `const prettify = (id) => id.replace(/^category:/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())`, copy-pasted verbatim between the two dev-tool modules with no shared import. Evidence: `grep -n -A4 "replace(/_/g, ' ')" src/lib/dev/gearDb.ts src/lib/dev/itemTree.ts`.
- **[high]** "id -> Title Case label" reimplemented independently at least 4 times with slightly different steps, none importing a shared helper:
  - src/lib/dev/gearDb.ts:426 / src/lib/dev/itemTree.ts:31 -- `prettify` (strips `category:` prefix, underscore->space, per-word capitalize).
  - src/lib/dev/buildingTree.ts:18 -- `prettify` (underscore->space, per-word capitalize; no `category:` strip).
  - src/lib/components/util/itemCategoryTree.ts:126 -- `labelFor` (same underscore->space + capitalize tail, inlined instead of a named helper).
  - src/lib/components/util/bodyLabels.ts:1-8 -- `humanize` (underscore->space, camelCase split, whitespace collapse, per-word capitalize -- a superset of the others, but not reused by them).
  Evidence: `grep -rln "replace(/_/g, ' ')" src --include=*.ts` (16 files hit the substring; the 4 above independently reimplement the full multi-step humanizer, not just a one-off substitution).
- **[medium]** `clamp` reimplemented outside the canonical helper. src/lib/game/core/util/math.ts:1-2 exports `clamp(v, lo, hi)`, but it is only imported by 2 files (`KingdomService.ts`, `Combat.ts` -- confirmed via `grep -rln "from.*core/util/math" src`). Two other modules define their own local `clamp` const with equivalent (differently-ordered) `Math.max`/`Math.min` logic instead of importing it:
  - src/lib/game/services/PawnService.ts:800 -- `const clamp = (v, min, max) => Math.min(max, Math.max(min, v));`
  - src/lib/game/systems/pawn/handlers/breakdown.ts:31 -- `const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));`
  Same behavior today; a future edit to the canonical `clamp` (e.g. NaN handling) won't reach these two. Evidence: `grep -n "from.*util/math\|import.*clamp" src/lib/game/services/PawnService.ts src/lib/game/systems/pawn/handlers/breakdown.ts` (no import in either).
- **[low]** src/lib/game/services/entity/entityHelpers.ts:587 -- `dist(mob, pos)` is a one-line wrapper around `chebyshev()` from `src/lib/game/core/util/distance.ts`, not an independent reimplementation. No other file in `src/lib/game` (JobService, commands.ts, entityAI.ts, fill.ts, work.ts, rescue.ts, pawnQueries.ts, combat.ts, pawnHelpers.ts, pawnHauling.ts) defines its own distance math -- all call into `distance.ts`. No duplication here; listed only because it surfaced in the initial grep sweep.

**Checked, not a problem**: no duplicate `lerp` (`EnvironmentService.ts:57` is the only definition), no duplicate `deepClone`, `formatNumber`, `titleCase`, or `capitalize`-named helper, and only one seeded-RNG implementation (`src/lib/game/core/util/rng.ts`).

## 4. Test conventions

- **[high]** src/tests/game/database/_agecmp.test.ts:6 and src/tests/game/database/_src.test.ts:16 -- both `it()` blocks contain zero `expect()`/`assert` calls; they only `console.log` a report and always pass regardless of what the data says. Evidence: read both files in full -- `_agecmp.test.ts` computes `over`/`under` mismatch lists and only logs them; `_src.test.ts` computes an `orphan`/`byWhy` breakdown and only logs it. Both run under the default `pnpm test` (`vitest.config.ts` includes `src/**/*.{test,spec}.ts` with no exclusion for the `_`-prefixed names), so they add runtime and green checkmarks without verifying anything.
- **[medium]** 9 test files exceed 500 lines: `src/tests/game/database/itemRules.test.ts` (1246), `src/tests/game/systems/combatSim.test.ts` (674), `src/tests/game/services/environment.test.ts` (659), `src/tests/game/services/entitySim.test.ts` (594), `src/tests/game/systems/statAxisProposal.test.ts` (574), `src/tests/game/systems/combatRanged.test.ts` (542), `src/tests/game/services/followupFeatures.test.ts` (536), `src/tests/game/systems/fsmTransitions.test.ts` (525), `src/tests/game/services/vesselChain.test.ts` (497 -- just under, listed for context). Evidence: `find src/tests -name "*.test.ts" | xargs wc -l | sort -rn`.
- No `.skip`, `.todo`, `xit(`, or `xdescribe(` anywhere in `src/tests` (`grep -rn` returned nothing) -- the suite doesn't carry disabled tests.
- No duplicated custom test-scaffolding function found: `buildScenario` and `HeadlessSession` each have exactly one definition (`src/lib/game/headless/Scenario.ts`, `src/lib/game/headless/HeadlessSession.ts`) and the rest of the suite imports them rather than reimplementing state setup.

## 5. Config hygiene

- **[high]** eslint.config.js:6-17 -- `**/*.svelte` is in the top-level `ignores` list, so ESLint never lints any Svelte file, yet `eslint-plugin-svelte` is a devDependency and is never imported or referenced anywhere in `eslint.config.js`. Evidence: `grep -n "ignores" eslint.config.js` shows `'**/*.svelte'`; `grep -n "svelte" eslint.config.js` matches only that ignore line; knip independently flagged `eslint-plugin-svelte` as an unused devDependency.
- **[high]** eslint.config.js:20-26 -- the `@typescript-eslint/eslint-plugin` is registered (`plugins: { '@typescript-eslint': tsPlugin }`) but `rules: {}` is empty -- no `recommended` ruleset is spread in, and `@eslint/js` (which would supply one) is never imported despite being a devDependency (also flagged unused by knip). The only rules actually enforced are the two narrow custom ones (`no-restricted-properties` for `Math.random`, `no-console`) scoped to `src/lib/game/**/*.ts`, plus one repo-wide `no-restricted-syntax` rule for `/src` fetch paths. `pnpm lint` effectively checks almost nothing about general TypeScript correctness or style.
- **[medium]** `pnpm lint` currently fails on `main`: `2 errors, 12 warnings` (`no-console` in `src/lib/game/headless/Scenario.ts:61`, `no-restricted-properties`/`Math.random` in `src/lib/game/sim/commands.ts:490`). Evidence: ran `pnpm lint` directly, exit code 1. A red lint script that nobody is fixing is itself a sign it isn't run in the normal workflow.
- **[low]** 12 of the 14 lint findings are "Unused eslint-disable directive" warnings (e.g. `/* eslint-disable @typescript-eslint/no-explicit-any */` in `src/lib/dev/itemTree.ts`, `src/tests/game/database/_agecmp.test.ts`, `_src.test.ts`, `dbStructure.test.ts`, `t4WeaponAudit.test.ts`) -- these suppress a rule (`@typescript-eslint/no-explicit-any`) that isn't enabled at all under the current empty `rules: {}`, so the disable comments are inert leftovers.
- tsconfig.json has `strict: true` and `checkJs: true` -- the strictness posture itself is fine; the gap is that ESLint doesn't add anything on top of it for Svelte or for un-typed style rules.
- vitest.config.ts is coherent: a custom `.jsonc`-stripping Vite plugin, `$lib`/`$app/environment` aliases, and an explicit `AUDIT_SUITES` exclusion list gated behind `RUN_AUDITS=1` (documented in `package.json`'s `test:audit` script) -- no hygiene issue found here.
- pnpm-workspace.yaml contains only `allowBuilds: { esbuild: true }` -- no `packages:` field is declared at all, so it isn't functioning as a multi-package workspace despite the filename; there's nothing "unused" inside it because nothing is declared. Not a defect, just worth knowing the file doesn't do what its name implies.

## 6. Repo hygiene

- **[medium]** eslint-config-output.json (1424 lines, tracked in git, not in `.gitignore`) -- a generated ESLint config dump (looks like `eslint --print-config` output: starts with `linterOptions`/`rules` keys). Nothing in the repo references it (`grep -rn "eslint-config-output"` across `.json`/`.mjs`/`.js`/`.sh` files, excluding `node_modules`, found zero hits), and its git history shows only 2 commits, both from the very early history of the repo. Dead committed tool output.
- `sim-core/target/`, `spatial-core/target/`, `src/lib/spatial-core-pkg/`, `src/lib/sim-core-pkg/` are all correctly listed in `.gitignore` and `git ls-files` confirms none of their contents are tracked -- no wasm/Rust build artifacts are actually committed.
- Root shell scripts (`build.sh` 309 lines, `dev.sh` 112, `launch.sh` 293, `install.sh` 68, `audit.sh` 107) were read in full and do not functionally overlap:
  - `dev.sh` is the single source of truth for starting the Vite dev server (`exec ... pnpm exec vite dev --host --port $PORT`); `launch.sh` (the desktop-spike Electron/Tauri shell runner) calls `./dev.sh` itself (`launch.sh:70,138`) rather than reimplementing server startup.
  - `install.sh` sets up the local dev environment (`pnpm install`, `svelte-kit sync`, `wasm-pack`); `build.sh --install` is a different operation -- installing the *packaged* `.deb`/AppImage distributable onto the machine. Same word, disjoint scope; no code duplication, though the shared verb ("install") between two unrelated scripts is a minor naming ambiguity worth knowing about if a contributor searches for "how do I install this repo".
  - `audit.sh` is an SSH wrapper that tails/manages a long-running remote audit process on `$AUDIT_HOST`; it does not reimplement any logic from `tools/audit/audit.mjs` (the local audit CLI invoked by `pnpm audit`).
