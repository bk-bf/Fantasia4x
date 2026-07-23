
evaluate the feasibility of porting the game to one of these: Your instinct is right — there are several stacks that give you web-like UI iteration speed without the Chromium baggage of Electron. Here's how the main options stack up for a UI-heavy game.
## Slint (Rust-native, no browser at all)

Slint is a Rust-first declarative UI toolkit that compiles your UI to native code — no DOM, no browser engine, no webview. It uses its own DSL (`.slint` files) with a CSS-like styling syntax, so the mental model is similar to writing web UI, but it renders natively with a runtime footprint under 300KB RAM. The key feature for your use case is Live-Preview, which lets you tweak layouts, colors, animations, and geometry and see changes instantly, similar to Svelte's HMR loop but without any browser. Since it's pure Rust, your game logic and UI logic live in the same language and process — no WASM/IPC bridge needed at all, which is a real advantage over the Tauri approach if you want maximum simplicity.

## Dioxus (React-like, Rust-native)

Dioxus is worth watching closely. Version 0.7 just introduced a true Native Renderer built on WGPU (the same GPU API Rust game engines use) plus "hot-patching" for real-time updates without full rebuilds. It supports both web and desktop/native targets from the same codebase, and its dev server (`dx serve --platform desktop`) gives hot-reload iteration comparable to a web dev workflow, even when targeting native builds. Because it's built on WGPU, it's architecturally closer to a game engine's rendering pipeline than Slint or Tauri, which could matter if you eventually want custom shaders or GPU-driven UI effects blended with gameplay.

## Avalonia (C#/.NET native)

If you'd rather stay in the C#/.NET ecosystem, Avalonia is the XAML-based equivalent — a cross-platform native UI framework with a familiar MVVM pattern for anyone coming from WPF. Hot reload support exists via community tooling like HotAvalonia, and it works reasonably well for XAML markup changes, though full C# logic changes still often require a rebuild or rely on .NET's own hot reload, which is less seamless than the web stacks. This path makes sense mainly if your compute-heavy logic is happier in C# than Rust, or if your team already has strong .NET experience.

| Stack | Rendering | Iteration speed | Language unity | Maturity |
|---|---|---|---|---|
| Tauri + SvelteKit + Rust | OS webview | Excellent (web HMR) | Split (JS UI / Rust logic) | Mature, widely used  |
| Slint + Rust | Native, no browser | Very good (Live-Preview) | Unified (all Rust) | 1.x, API-stable  |
| Dioxus + Rust | Native via WGPU | Good, improving fast | Unified (all Rust) | Newer, 0.7 just released  |
| Avalonia + C# | Native | Partial hot reload | Unified (all C#) | Mature but hot reload limited  |

Given that you're already planning to push heavy computation into Rust, **Slint** is arguably the most elegant fit: it eliminates the WASM/IPC boundary entirely since UI and game logic share one language and process, while still giving you a fast visual iteration loop through Live-Preview. Tauri remains the safer choice if you specifically want to keep Svelte's component model and web-dev ergonomics, accepting the small overhead of a webview and cross-language boundary.

What matters more to you here — keeping the exact Svelte/web development experience, or minimizing the Rust-to-UI boundary even if it means learning a new UI paradigm?
I'll evaluate this against your actual codebase rather than in the abstract — the feasibility of each port depends entirely on how your UI and logic are coupled, how much Svelte-specific reactivity you'd have to rewrite, and how the existing Rust/WASM boundary would change. Let me survey the code.

Bash Survey codebase size and structure
IN
echo "=== Component count & LOC ===" && find src/lib/components src/routes -name '*.svelte' | wc -l && find src/lib/components src/routes -name '*.svelte' -exec cat {} + | wc -l && echo "=== Stores ===" && ls src/lib/stores/ 2>/dev/null && find src/lib/stores -name '*.ts' -exec cat {} + | wc -l && echo "=== Services ===" && ls src/lib/game/services/ && echo "=== Core ===" && ls src/lib/game/core/ && echo "=== TS total LOC in game ===" && find src/lib/game -name '*.ts' -exec cat {} + | wc -l

OUT
=== Component count & LOC ===
89
27570
=== Stores ===
Permissions Size User   Date Modified Git Name
.rw-r--r--  2,0k kirill  6 Jul 01:43   -- attackLunges.ts
.rw-r--r--  1,8k kirill  6 Jul 01:43   -- cameraView.ts
.rw-r--r--  2,5k kirill  6 Jul 01:43   -- combatFeedback.ts
.rw-r--r--  6,6k kirill  6 Jul 01:43   -- combatLog.test.ts
.rw-r--r--  1,9k kirill  6 Jul 01:43   -- combatSounds.ts
.rw-r--r--  5,1k kirill  6 Jul 01:43   -- discoveredResources.ts
.rw-r--r--   999 kirill  6 Jul 05:27   -- eventStore.ts
.rw-r--r--   763 kirill  6 Jul 01:43   -- filterClipboard.ts
.rw-r--r--   72k kirill  6 Jul 01:43   -- gameState.ts
.rw-r--r--   20k kirill  6 Jul 01:43   -- Log.ts
.rw-r--r--   340 kirill  6 Jul 01:43   -- perfStats.ts
.rw-r--r--  2,4k kirill  6 Jul 01:43   -- projectiles.ts
.rw-r--r--   29k kirill  6 Jul 01:43   -- saveManager.ts
.rw-r--r--  3,7k kirill  6 Jul 01:43   -- simLogBridge.ts
.rw-r--r--  1,0k kirill  6 Jul 01:43   -- uiPersist.ts
.rw-r--r--  8,6k kirill  6 Jul 01:43   -- uiPrefs.ts
.rw-r--r--  8,1k kirill  6 Jul 01:43   -- uiState.ts
.rw-r--r--  4,1k kirill  6 Jul 01:43   -- worldEffects.ts
.rw-r--r--    32 kirill  6 Jul 01:43   -- worldState.ts
4043
=== Services ===
Permissions Size User   Date Modified Git Name
drwxr-xr-x     - kirill  6 Jul 18:43   -- entity
drwxr-xr-x     - kirill  6 Jul 06:21   -- jobs
.rw-r--r--  5,1k kirill  6 Jul 01:43   -- arachnidAnatomy.test.ts
.rw-r--r--  2,7k kirill  6 Jul 01:43   -- autoDrink.test.ts
.rw-r--r--  3,3k kirill  6 Jul 01:43   -- buildingCondition.test.ts
.rw-r--r--  3,0k kirill  6 Jul 01:43   -- buildingCost.test.ts
.rw-r--r--  2,3k kirill  6 Jul 01:43   -- buildingLight.test.ts
.rw-r--r--   40k kirill  6 Jul 01:43   -- BuildingService.ts
.rw-r--r--  2,7k kirill  6 Jul 01:43   -- buildingWalkability.test.ts
.rw-r--r--  4,1k kirill  6 Jul 01:43   -- bulkLogistics.test.ts
.rw-r--r--  2,0k kirill  6 Jul 01:43   -- castingMold.test.ts
.rw-r--r--  3,0k kirill  6 Jul 01:43   -- categoryPlank.test.ts
.rw-r--r--  3,3k kirill  6 Jul 01:43   -- clearDesignationsForResource.test.ts
.rw-r--r--  2,6k kirill  6 Jul 01:43   -- cookingPotTool.test.ts
.rw-r--r--  2,7k kirill  6 Jul 01:43   -- craftDropMerge.test.ts
.rw-r--r--  3,6k kirill  6 Jul 01:43   -- craftPendingOrders.test.ts
.rw-r--r--  2,8k kirill  6 Jul 01:43   -- designationAbsorb.test.ts
.rw-r--r--   23k kirill  6 Jul 01:43   -- DesignationService.ts
.rw-r--r--  2,1k kirill  6 Jul 01:43   -- draftMovePath.ts
.rw-r--r--  8,4k kirill  6 Jul 01:43   -- dryingAndDecay.test.ts
.rw-r--r--  3,1k kirill  6 Jul 01:43   -- EntityService.ts
.rw-r--r--   26k kirill  6 Jul 04:52   -- entitySim.test.ts
.rw-r--r--   25k kirill  6 Jul 01:43   -- environment.test.ts
.rw-r--r--   72k kirill  6 Jul 04:11   -- EnvironmentService.ts
.rw-r--r--  2,6k kirill  6 Jul 01:43   -- equipCarryLoad.test.ts
.rw-r--r--  3,1k kirill  6 Jul 01:43   -- equipSlotChoice.test.ts
.rw-r--r--   11k kirill  6 Jul 01:43   -- farmingSoil.test.ts
.rw-r--r--  2,6k kirill  6 Jul 01:43   -- floorBuildings.test.ts
.rw-r--r--   24k kirill  6 Jul 01:43   -- followupFeatures.test.ts
.rw-r--r--   11k kirill  6 Jul 01:43   -- foodChain.test.ts
.rw-r--r--  2,5k kirill  6 Jul 01:43   -- foodRules.test.ts
.rw-r--r--  3,9k kirill  6 Jul 01:43   -- foodRules.ts
.rw-r--r--  4,9k kirill  6 Jul 01:43   -- fuelRules.test.ts
.rw-r--r--  8,0k kirill  6 Jul 01:43   -- fuelRules.ts
.rw-r--r--  2,5k kirill  6 Jul 01:43   -- harvestJobSync.test.ts
.rw-r--r--  2,8k kirill  6 Jul 01:43   -- harvestZonePreservation.test.ts
.rw-r--r--  2,4k kirill  6 Jul 01:43   -- haulForbidden.test.ts
.rw-r--r--  2,6k kirill  6 Jul 01:43   -- index.ts
.rw-r--r--  3,3k kirill  6 Jul 01:43   -- itemDeterioration.test.ts
.rw-r--r--   53k kirill  6 Jul 17:49   -- ItemService.ts
.rw-r--r--  2,8k kirill  6 Jul 01:43   -- jobCraftByproducts.test.ts
.rw-r--r--  3,8k kirill  6 Jul 01:43   -- jobRegistry.test.ts
.rw-r--r--  9,3k kirill  6 Jul 01:43   -- JobService.test.ts
.rw-r--r--   28k kirill  6 Jul 01:43   -- JobService.ts
.rw-r--r--  4,7k kirill  6 Jul 01:43   -- jobSim.test.ts
.rw-r--r--   15k kirill  6 Jul 01:43   -- LightingService.ts
.rw-r--r--  1,8k kirill  6 Jul 01:43   -- lightWork.test.ts
.rw-r--r--  2,6k kirill  6 Jul 01:43   -- lightWorkWiring.test.ts
.rw-r--r--  2,8k kirill  6 Jul 01:43   -- moodBreakdown.test.ts
.rw-r--r--  4,9k kirill  6 Jul 01:43   -- movementPass.test.ts
.rw-r--r--   11k kirill  6 Jul 01:43   -- MovementSystem.ts
.rw-r--r--  3,4k kirill  6 Jul 01:43   -- moverDeadlock.test.ts
.rw-r--r--  5,3k kirill  6 Jul 01:43   -- OccupancyService.ts
.rw-r--r--   10k kirill  6 Jul 01:43   -- PathfinderService.ts
.rw-r--r--   47k kirill  6 Jul 01:43   -- PawnService.ts
.rw-r--r--   37k kirill  6 Jul 18:49   M- PawnStatService.ts
.rw-r--r--  3,4k kirill  6 Jul 01:43   -- physicalProduction.test.ts
.rw-r--r--  4,1k kirill  6 Jul 01:43   -- recipeService.test.ts
.rw-r--r--   11k kirill  6 Jul 01:43   -- RecipeService.ts
.rw-r--r--  4,6k kirill  6 Jul 01:43   -- repairRules.ts
.rw-r--r--   14k kirill  6 Jul 01:43   -- ResearchService.ts
.rw-r--r--  4,2k kirill  6 Jul 01:43   -- resourceGen.test.ts
.rw-r--r--   11k kirill  6 Jul 01:43   -- ResourceGeneratorService.ts
.rw-r--r--  7,9k kirill  6 Jul 01:43   -- ResourceObjectService.ts
.rw-r--r--  5,2k kirill  6 Jul 01:43   -- storageBins.test.ts
.rw-r--r--  3,1k kirill  6 Jul 01:43   -- subjobStats.test.ts
.rw-r--r--  2,3k kirill  6 Jul 01:43   -- toolTierGate.test.ts
.rw-r--r--  1,8k kirill  6 Jul 01:43   -- toolWear.test.ts
.rw-r--r--  4,0k kirill  6 Jul 01:43   -- toolWorkBoost.test.ts
.rw-r--r--  3,6k kirill  6 Jul 01:43   -- urgentHaul.test.ts
.rw-r--r--  2,9k kirill  6 Jul 01:43   -- WasmPathfinderService.ts
.rw-r--r--  1,8k kirill  6 Jul 01:43   -- waterNeeds.test.ts
.rw-r--r--  4,6k kirill  6 Jul 01:43   -- wetness.test.ts
.rw-r--r--  7,0k kirill  6 Jul 01:43   -- windchill.test.ts
.rw-r--r--  6,5k kirill  6 Jul 01:43   -- WorkService.ts
=== Core ===
Permissions Size User   Date Modified Git Name
drwxr-xr-x     - kirill  6 Jul 19:05   M- types
.rw-r--r--   17k kirill  6 Jul 01:43   -- BodyParts.ts
.rw-r--r--   15k kirill  6 Jul 01:43   -- bodyPlans.test.ts
.rw-r--r--  1,9k kirill  6 Jul 01:43   -- buildingAmenity.ts
.rw-r--r--   825 kirill  6 Jul 01:43   -- buildingDefs.ts
.rw-r--r--   974 kirill  6 Jul 01:43   -- buildingSig.ts
.rw-r--r--  3,4k kirill  6 Jul 18:44   -- carcassCondition.test.ts
.rw-r--r--  4,2k kirill  6 Jul 01:43   -- carcassCondition.ts
.rw-r--r--   836 kirill  6 Jul 01:43   -- color.ts
.rw-r--r--  2,8k kirill  6 Jul 01:43   -- conditionOnsetDelay.test.ts
.rw-r--r--  3,3k kirill  6 Jul 01:43   -- cp437.ts
.rw-r--r--   15k kirill  6 Jul 01:43   -- Creatures.ts
.rw-r--r--  1,7k kirill  6 Jul 01:43   -- cropHealth.test.ts
.rw-r--r--  3,4k kirill  6 Jul 01:43   -- cropHealth.ts
.rw-r--r--   984 kirill  6 Jul 01:43   -- devFlags.ts
.rw-r--r--  2,8k kirill  6 Jul 01:43   -- distance.ts
.rw-r--r--  4,7k kirill  6 Jul 01:43   -- Events.ts
.rw-r--r--  2,3k kirill  6 Jul 01:43   -- famedNames.test.ts
.rw-r--r--  5,1k kirill  6 Jul 01:43   -- famedNames.ts
.rw-r--r--   23k kirill  6 Jul 01:43   -- GameState.ts
.rw-r--r--  1,6k kirill  6 Jul 01:43   -- itemDefs.ts
.rw-r--r--  8,7k kirill  6 Jul 01:43   -- itemQuality.test.ts
.rw-r--r--  7,1k kirill  6 Jul 01:43   -- itemQuality.ts
.rw-r--r--  1,6k kirill  6 Jul 01:43   -- lineOfSight.ts
.rw-r--r--  2,4k kirill  6 Jul 01:43   -- log.ts
.rw-r--r--  9,2k kirill  6 Jul 01:43   -- logSink.ts
.rw-r--r--  2,0k kirill  6 Jul 01:43   -- materialProperties.test.ts
.rw-r--r--  2,1k kirill  6 Jul 01:43   -- materialProperties.ts
.rw-r--r--   398 kirill  6 Jul 01:43   -- math.ts
.rw-r--r--   30k kirill  6 Jul 19:03   M- needs.ts
.rw-r--r--   19k kirill  6 Jul 18:49   M- PawnEquipment.ts
.rw-r--r--  1,6k kirill  6 Jul 01:43   -- pawnIndex.test.ts
.rw-r--r--  1,4k kirill  6 Jul 01:43   -- pawnIndex.ts
.rw-r--r--  2,3k kirill  6 Jul 18:49   M- Race.test.ts
.rw-r--r--   16k kirill  6 Jul 19:07   M- Race.ts
.rw-r--r--  3,6k kirill  6 Jul 01:43   -- regrowthQueue.ts
.rw-r--r--   13k kirill  6 Jul 01:43   -- resourceObjectDefs.ts
.rw-r--r--   964 kirill  6 Jul 01:43   -- Resources.ts
.rw-r--r--  2,0k kirill  6 Jul 01:43   -- rng.test.ts
.rw-r--r--  3,5k kirill  6 Jul 01:43   -- rng.ts
.rw-r--r--   860 kirill  6 Jul 01:43   -- runtime.ts
.rw-r--r--  2,0k kirill  6 Jul 01:43   -- soilFertility.test.ts
.rw-r--r--   16k kirill  6 Jul 01:43   -- Terrains.ts
.rw-r--r--  4,0k kirill  6 Jul 04:26   -- tileDeltas.ts
.rw-r--r--  6,8k kirill  6 Jul 01:43   -- tileStorage.test.ts
.rw-r--r--  1,9k kirill  6 Jul 01:43   -- time.ts
.rw-r--r--   757 kirill  6 Jul 05:24   -- types.ts
.rw-r--r--  4,2k kirill  6 Jul 01:43   -- vision.test.ts
.rw-r--r--  4,6k kirill  6 Jul 01:43   -- vision.ts
.rw-r--r--  2,8k kirill  6 Jul 01:43   -- vitalEscalation.test.ts
.rw-r--r--  3,5k kirill  6 Jul 01:43   -- wildGrowth.ts
.rw-r--r--  6,4k kirill  6 Jul 01:43   -- Work.ts
.rw-r--r--   20k kirill  6 Jul 05:01   -- Wounds.ts
=== TS total LOC in game ===
52134
Bash Survey Rust, Svelte reactivity, largest components
IN
echo "=== Rust spatial-core ===" && ls spatial-core/ 2>/dev/null && find spatial-core -name '*.rs' -exec cat {} + 2>/dev/null | wc -l && echo "=== Svelte runes usage ===" && grep -rl '\$state\|\$derived\|\$effect' src/lib/components src/routes | wc -l && echo "=== svelte:reactive stmts ===" && grep -rc 'use:\|transition:\|animate:\|in:\|out:' src/lib/components 2>/dev/null | grep -v ':0' | wc -l && echo "=== top 15 largest components ===" && find src/lib/components src/routes -name '*.svelte' -exec wc -l {} + | sort -rn | head -16

OUT
=== Rust spatial-core ===
Permissions Size User   Date Modified Git Name
drwxr-xr-x     - kirill  6 Jul 01:43   -- src
drwxr-xr-x     - kirill  5 Jul 19:33   -I target
.rw-r--r--  3,0k kirill  6 Jul 01:43   -- Cargo.lock
.rw-r--r--   135 kirill  6 Jul 01:43   -- Cargo.toml
271
=== Svelte runes usage ===
42
=== svelte:reactive stmts ===
60
=== top 15 largest components ===
 27570 total
  5840 src/lib/components/UI/GameCanvas.svelte
  1041 src/lib/components/UI/WorldEffectsLayer.svelte
   960 src/lib/components/screens/CraftingScreen.svelte
   710 src/routes/+page.svelte
   661 src/lib/components/screens/BuildingMenu.svelte
   660 src/lib/components/UI/ZonePanel.svelte
   611 src/lib/components/UI/SelectedEntityCard.svelte
   583 src/lib/components/UI/ResourceSidebar.svelte
   573 src/lib/components/UI/ActivityLogOverlay.svelte
   570 src/lib/components/UI/CustomMapMenu.svelte
   520 src/lib/components/UI/WeatherCanvas.svelte
   512 src/lib/components/UI/AudioController.svelte
   475 src/lib/components/pawn/PawnAttributes.svelte
   456 src/lib/components/screens/work/WorkPriorities.svelte
   445 src/lib/components/UI/ChroniclePanel.svelte
Now let me understand the two things that decide this port's difficulty: how the main game view renders (canvas vs DOM), and how the sim/worker/WASM boundary is shaped.

Bash Inspect rendering tech and platform-API coupling
IN
cd /home/kirill/Documents/Projects/Fantasia4x
echo "=== GameCanvas: rendering tech ===" && grep -c 'getContext\|ctx\.\|canvas' src/lib/components/UI/GameCanvas.svelte && grep -oE "getContext\(['\"][^'\"]+" src/lib/components/UI/GameCanvas.svelte | sort -u
echo "=== canvas-based components ===" && grep -rl 'getContext' src/lib/components | sed 's|.*/||'
echo "=== DOM-heavy (many {#each}/{#if}) screens ===" && grep -rc '{#each\|{#if' src/lib/components/screens src/lib/components/pawn | sort -t: -k2 -rn | head -12
echo "=== sim worker files ===" && find src -name '*worker*' -o -name '*sim*' | grep -iE 'worker|sim' | grep -v test
echo "=== WASM usage sites ===" && grep -rl 'spatial-core\|wasm\|WasmPathfinder' src/lib | grep -v test | sed 's|.*/src/lib/||'
echo "=== web APIs that need shims in native (localStorage/audio/canvas/worker) ==="
grep -rEc 'localStorage|IndexedDB|new Worker|AudioContext|requestAnimationFrame|document\.|window\.' src/lib | grep -v ':0' | wc -l

OUT
=== GameCanvas: rendering tech ===
159
getContext('2d
=== canvas-based components ===
hudSpriteIcon.ts
SpriteIcon.svelte
spriteSheets.ts
WeatherCanvas.svelte
GameCanvas.svelte
=== DOM-heavy (many {#each}/{#if}) screens ===
src/lib/components/screens/CraftingScreen.svelte:21
src/lib/components/screens/ResearchScreen.svelte:20
src/lib/components/screens/BuildingMenu.svelte:12
src/lib/components/screens/work/WorkPriorities.svelte:10
src/lib/components/screens/EntityScreen.svelte:10
src/lib/components/pawn/ConditionChips.svelte:10
src/lib/components/screens/work/WorkCellTooltip.svelte:9
src/lib/components/screens/race/RaceDetail.svelte:9
src/lib/components/screens/DebugMenu.svelte:8
src/lib/components/pawn/CarryItemCard.svelte:7
src/lib/components/pawn/PawnInventory.svelte:6
src/lib/components/pawn/EquipmentDoll.svelte:6
=== sim worker files ===
src/lib/sim-core-pkg
src/lib/sim-core-pkg/sim_core.js
src/lib/sim-core-pkg/sim_core.d.ts
src/lib/sim-core-pkg/sim_core_bg.wasm.d.ts
src/lib/sim-core-pkg/sim_core_bg.wasm
src/lib/game/sim-core
src/lib/game/sim
src/lib/stores/simLogBridge.ts
src/lib/webgl/freeze-watchdog.worker.ts
src/lib/game/sim-core/simWorldView.ts
src/lib/game/sim/simProtocol.ts
src/lib/game/sim/simWorkerClient.ts
src/lib/game/sim/sim.worker.ts
=== WASM usage sites ===
src/lib/game/core/runtime.ts
src/lib/game/services/PathfinderService.ts
src/lib/game/services/WasmPathfinderService.ts
src/lib/game/services/entity/connectivity.ts
src/lib/game/sim/sim.worker.ts
src/lib/game/sim/simWorkerClient.ts
src/lib/game/services/entity/entityHelpers.ts
src/lib/game/systems/GameEngineImpl.ts
src/lib/game/sim-core/simWorldView.ts
src/lib/game/sim-core/bench.ts
=== web APIs that need shims in native (localStorage/audio/canvas/worker) ===
35
A sim-core WASM package already exists alongside spatial-core. Let me check how much game logic is already in Rust vs TypeScript, and look at the desktop spike mentioned in AGENTS.md.

Bash Locate Rust sim-core, desktop spike, and any porting notes
IN
cd /home/kirill/Documents/Projects/Fantasia4x
echo "=== All Rust crates in repo ===" && find . -name Cargo.toml -not -path '*/target/*' -not -path '*/node_modules/*' | while read f; do d=$(dirname "$f"); loc=$(find "$d/src" -name '*.rs' 2>/dev/null -exec cat {} + | wc -l); echo "$d — $loc LOC rust"; done
echo "=== sim-core rust source? ===" && find . -path '*sim-core*' -name '*.rs' -not -path '*/target/*' 2>/dev/null | head; find . -type d -name 'sim-core*' -not -path '*/node_modules/*' -not -path '*/target/*'
echo "=== desktop-spike ===" && ls desktop-spike 2>/dev/null && find desktop-spike -maxdepth 2 -name '*.md' 2>/dev/null
echo "=== what sim_core.d.ts exposes ===" && head -60 src/lib/sim-core-pkg/sim_core.d.ts 2>/dev/null
echo "=== ENGINE-PERFORMANCE snippet on rust plans ===" && grep -niE 'slint|tauri|dioxus|avalonia|native|port|rust.*ui|electron' docs/tasks/open/ENGINE-PERFORMANCE.md | head -30

OUT
=== All Rust crates in repo ===
./desktop-spike/tauri/src-tauri — 22 LOC rust
./sim-core — 397 LOC rust
./spatial-core — 271 LOC rust
=== sim-core rust source? ===
./sim-core/src/lib.rs
./sim-core
./src/lib/sim-core-pkg
./src/lib/game/sim-core
=== desktop-spike ===
Permissions Size User   Date Modified Git Name
drwxr-xr-x     - kirill  6 Jul 01:43   -- electron
drwxr-xr-x     - kirill  6 Jul 01:43   -- tauri
.rw-r--r--  3,4k kirill  6 Jul 01:43   -- README.md
desktop-spike/README.md
=== what sim_core.d.ts exposes ===
/* tslint:disable */
/* eslint-disable */

/**
 * The Struct-of-Arrays world: fixed-capacity entity planes + a chunked tile grid.
 */
export class SimWorld {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Run `ticks` iterations of a representative hot loop over the SoA: per-entity needs decay +
     * one-step movement with a chunked-grid tile-cost read. This is the R1 benchmark workload (and
     * the seed of the real R2 needs/movement tick); the JS variants in `bench.ts` do the identical
     * work so the comparison is apples-to-apples. Returns a checksum so nothing is optimised away.
     */
    bench_step(ticks: number): number;
    cap(): number;
    chunk_count(): number;
    chunk_dirty_ptr(): number;
    chunk_size(): number;
    chunks_x(): number;
    chunks_y(): number;
    /**
     * Clear all dirty flags (after the consumer has processed them this tick/frame).
     */
    clear_dirty(): void;
    /**
     * High-water mark: slots `0..count` may be live (check `U_ALIVE`). NOT a live count.
     */
    count(): number;
    f32_ptr(): number;
    height(): number;
    i16_ptr(): number;
    i32_ptr(): number;
    /**
     * Free a slot for reuse (`alive = 0`). The field bytes are left as-is until the slot is reused.
     */
    kill(i: number): void;
    /**
     * Mark the chunk containing (x,y) dirty (terrain changed → re-upload / re-scan).
     */
    mark_dirty(x: number, y: number): void;
    /**
     * Allocate every buffer once. `cap` = max simultaneous entities; `width`/`height` = map size.
     * Nothing allocates after this, so all pointers stay valid for the instance's lifetime.
     */
    constructor(cap: number, width: number, height: number);
    nf32(): number;
    ni16(): number;
    ni32(): number;
    nu8(): number;
    /**
     * Claim a free slot (recycled first, else the high-water mark). Sets `alive = 1`, clears the
     * per-entity flags byte, zeroes the target. Returns the slot index, or `-1` if at capacity.
     */
    spawn(): number;
    t_cost_ptr(): number;
    t_flags_ptr(): number;
    t_res_amt_ptr(): number;
    t_res_cd_ptr(): number;
=== ENGINE-PERFORMANCE snippet on rust plans ===
ugrep: warning: docs/tasks/open/ENGINE-PERFORMANCE.md: No such file or directory
Both Electron and Tauri spikes already exist, plus a Rust sim-core (SoA world) is underway. Let me read the spike README and the perf doc to see what's already been decided.

Bash Read desktop spike README and locate perf doc
IN
cd /home/kirill/Documents/Projects/Fantasia4x
echo "=== desktop-spike/README.md ===" && cat desktop-spike/README.md
echo "=== perf doc location ===" && find docs -iname '*PERFORMANCE*' -o -iname '*ENGINE*' | head
echo "=== tauri spike contents ===" && find desktop-spike/tauri -maxdepth 3 -not -path '*/target/*' -not -path '*/node_modules/*' | head -40

OUT
=== desktop-spike/README.md ===
# desktop-spike — cross-engine TPS reading (DISTRIBUTION Phase A)

Throwaway wrappers to answer one question the ENGINE-PERFORMANCE work can't answer from Zen alone:
**does the ~200 TPS @4× survive the JS engine the game actually ships on?**

You optimise in Zen (Firefox / **SpiderMonkey**), but distribution is Electron or Tauri:

| Wrapper     | Engine on Linux        | Engine on Windows     | Engine on macOS       |
| ----------- | ---------------------- | --------------------- | --------------------- |
| **Electron**| V8 (Chromium)          | V8 (Chromium)         | V8 (Chromium)         |
| **Tauri**   | **WebKitGTK / JSC**    | V8 (WebView2)         | **WKWebView / JSC**   |

So Electron = one predictable engine everywhere; Tauri = the system webview, which means **JSC on
Linux/Mac** — the wildcard nobody profiles on. These two shells let you read TPS on both.

Both shells load the **running dev server** (`http://localhost:5173`) — the webview runs the sim in
its own engine regardless of where the HTML came from, so this is a valid reading **without** the
adapter-static migration (that's DISTRIBUTION Phase B, kept separate on purpose).

## Read-out

The header controls bar shows a permanent **`NNFPS · NNTPS`** counter (measured from the turn
counter — engine-agnostic). Just read it. No flags, no console.

> Numbers are **dev-mode** (unminified) — conservative; a production build will be ≥ this. What
> matters here is the **relative** engine comparison and whether any engine hits a cliff, not the
> absolute value. Compare against your Zen dev-server number for the same `--profiler-autorun` scene.

## Run

One command from the repo root — `launch.sh` starts a single main dev server and opens the chosen
webview against it (closing the window stops the server). Combine with `--debug` or `--profiler`:

```bash
./launch.sh --profiler --electron   # heavy scene, V8 / Chromium
./launch.sh --profiler --tauri      # heavy scene, WebKitGTK / JSC  (first run compiles the shell)
./launch.sh --debug --electron      # normal debug session in V8, etc.
```

Let each window settle ~5–10 s (the warmup ramp), then read `NNTPS`. For the cleanest reading use
`--profiler-autorun` (auto-unpaused at 4×) instead of `--profiler`.

> Manual equivalent (server + shell in separate terminals): `./dev.sh --profiler-autorun`, then
> `cd desktop-spike/electron && pnpm start` (or `cd desktop-spike/tauri && pnpm tauri dev`).

## Results (fill in)

| Engine                         | TPS @4× (heavy scene) | FPS | Notes (cliffs, WebGL/worker glitches) |
| ------------------------------ | --------------------- | --- | ------------------------------------- |
| Zen / SpiderMonkey (baseline)  | ~200                  |     | the number the doc reports            |
| Electron / V8                  |                       |     |                                       |
| Tauri / WebKitGTK (JSC)        |                       |     |                                       |

**What to watch for on WebKitGTK specifically:** worker startup, WASM (spatial-core) init, WebGL
context creation, and the worker↔main snapshot bridge (the §0 "multi-instance visuals glitching"
symptom). If JSC holds 60+ TPS with no render glitches, Tauri is viable; if it cliffs, that's a
distribution decision (lean Electron) made *now* instead of at the milestone.
=== perf doc location ===
docs/tasks/archive/ENGINE-PERFORMANCE-II.md
docs/tasks/archive/ENGINE-PERFORMANCE.md
docs/tasks/archive/GAMEENGINE-REFACTORING-2026-05-25.md
=== tauri spike contents ===
desktop-spike/tauri
desktop-spike/tauri/src-tauri
desktop-spike/tauri/package.json
desktop-spike/tauri/pnpm-lock.yaml
desktop-spike/tauri/src-tauri/capabilities
desktop-spike/tauri/src-tauri/src
desktop-spike/tauri/src-tauri/.gitignore
desktop-spike/tauri/src-tauri/Cargo.lock
desktop-spike/tauri/src-tauri/Cargo.toml
desktop-spike/tauri/src-tauri/build.rs
desktop-spike/tauri/src-tauri/tauri.conf.json
desktop-spike/tauri/src-tauri/capabilities/default.json
desktop-spike/tauri/src-tauri/src/lib.rs
desktop-spike/tauri/src-tauri/src/main.rs
I have a clear picture now. Let me check the DISTRIBUTION spec that governs this decision — it's referenced as the plan of record.

Bash Read DISTRIBUTION spec and scan for native-UI mentions
IN
cd /home/kirill/Documents/Projects/Fantasia4x
f=$(find docs -iname '*DISTRIBUTION*' | head -1); echo "FILE: $f"; echo "=== head ==="; sed -n '1,80p' "$f" 2>/dev/null
echo "=== any mention of native UI toolkits across docs ==="; grep -rniE 'slint|dioxus|avalonia|adapter-static|webview' docs/tasks/open/ 2>/dev/null | head -20

OUT
FILE: docs/tasks/open/DISTRIBUTION.md
=== head ===
<!-- LOC cap: 300 (created: 2026-05-30) -->

# DISTRIBUTION (wrapper: ELECTRON — decided 2026-06-15)

> **Related:** [ROADMAP](ROADMAP.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [ENGINE-PERFORMANCE](ENGINE-PERFORMANCE.md) (the shipped WebView is the perf-measurement target) · [game/DECISIONS](../../game/DECISIONS.md) ADR-020 · [[electron-over-tauri-distribution]]

> **⚡ WRAPPER DECIDED: ELECTRON, not Tauri (2026-06-15, A/B measured).** Phase A's viability spike was run
> for BOTH (`desktop-spike/{electron,tauri}`, launched via `./launch.sh --electron|--tauri`). On the heavy
> `--profiler` scene: **Electron/V8 ~250 TPS** (beats even Zen/SpiderMonkey) with better colour rendering
> (matters for the hue-dominant day/night UI) and Chromium devtools; **Tauri/WebKitGTK(JSC) ~100 TPS** with
> more lag + dips under 80. Tauri compiled cleanly against system `webkit2gtk-4.1` and is **kept as a
> second-engine test canary**, but dev + ship target is now **Electron** (one predictable V8 everywhere;
> Tauri-on-Linux/Mac is JSC, the weak wildcard). The Tauri-specific Phase A/B steps below are **superseded**
> for the wrapper choice; the adapter-static migration + save-adapter work (Phase B) still apply to Electron.
> See ENGINE-PERFORMANCE §D — the Electron renderer trace is what opened the whole renderer-hitch arc.

## Goal

Ship Fantasia4x as a standalone desktop application (Linux AppImage/deb, Windows
NSIS/MSI, macOS dmg) using **Electron** (was: Tauri 2 — see the decision note above). The SvelteKit frontend
is unchanged; the wrapper loads the Vite-built output. Save files migrate from `localStorage` to the native
filesystem so they survive browser-data clears. WASM spatial core must load correctly inside the bundled
runtime (✅ verified working in both Electron and Tauri during the spike).

---

## Phase A — Viability Spike — ✅ DONE (both wrappers A/B'd; Electron chosen)

Minimum goal *(met)*: one complete turn cycle runs inside a desktop window with WASM loaded — verified in
BOTH Electron and Tauri (`desktop-spike/`). The A/B gate (above) chose Electron. Original Tauri-scaffold
steps kept below for reference / the canary build.

### A1 — Tauri scaffold

- Add Tauri v2 to the project: `pnpm add -D @tauri-apps/cli@next` +
  `pnpm add @tauri-apps/api@next`.
- Run `pnpm tauri init` to generate `src-tauri/` scaffold.
- Set `tauri.conf.json` → `build.frontendDist` to `../build` (matches
  `@sveltejs/adapter-static` output).
- Switch SvelteKit adapter from `adapter-auto` to `adapter-static` with
  `fallback: 'index.html'` so Tauri can serve the app without a Node server.
- Add `"tauri": "tauri dev"` and `"tauri:build": "tauri build"` to
  `package.json` scripts.

### A2 — WASM loading in WebView

- Confirm `vite-plugin-wasm` works inside `tauri dev` (it should; Tauri uses
  Vite as the dev server in dev mode).
- In production builds, verify `spatial_core_bg.wasm` is included in the Vite
  output and the asset path resolves correctly from the bundled WebView.
- If asset paths break: set `tauri.conf.json` → `app.withGlobalTauri: true` and
  use the `convertFileSrc` helper to construct the WASM URL at runtime.

### A3 — Save migration

Current saves live in `localStorage['fantasia4x-save']`. Desktop builds must
persist to the native filesystem (survives profile wipes, is findable by users).

**Strategy**: keep `localStorage` as the in-memory working buffer during a
session; flush to disk via the Tauri `fs` plugin on save, and read from disk on
load. Detect environment with `window.__TAURI_INTERNALS__` to branch code paths.

- Add `@tauri-apps/plugin-fs` to dependencies.
- Wrap the existing `saveManager.ts` with an adapter interface:

```typescript
// src/lib/stores/persistence.ts
export interface SaveAdapter {
  load(): Promise<string | null>;
  save(data: string): Promise<void>;
}
```

- Implement `LocalStorageAdapter` (current behaviour) and `TauriAdapter` (reads/
  writes `$APPDATA/fantasia4x/save.json`).
- `saveManager.ts` picks the adapter at startup based on
  `window.__TAURI_INTERNALS__ !== undefined`.

### A4 — Spike acceptance criteria

=== any mention of native UI toolkits across docs ===
docs/tasks/open/DISTRIBUTION.md:5:> **Related:** [ROADMAP](ROADMAP.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [ENGINE-PERFORMANCE](ENGINE-PERFORMANCE.md) (the shipped WebView is the perf-measurement target) · [game/DECISIONS](../../game/DECISIONS.md) ADR-020 · [[electron-over-tauri-distribution]]
docs/tasks/open/DISTRIBUTION.md:14:> for the wrapper choice; the adapter-static migration + save-adapter work (Phase B) still apply to Electron.
docs/tasks/open/DISTRIBUTION.md:39:  `@sveltejs/adapter-static` output).
docs/tasks/open/DISTRIBUTION.md:40:- Switch SvelteKit adapter from `adapter-auto` to `adapter-static` with
docs/tasks/open/DISTRIBUTION.md:45:### A2 — WASM loading in WebView
docs/tasks/open/DISTRIBUTION.md:50:  output and the asset path resolves correctly from the bundled WebView.
docs/tasks/open/DISTRIBUTION.md:82:- [ ] Spatial WASM initialises (no "failed to load WASM" errors in WebView devtools).
docs/tasks/open/DISTRIBUTION.md:88:      (SpiderMonkey); the shipped Linux WebView is **WebKitGTK (JavaScriptCore)**, which
docs/tasks/open/DISTRIBUTION.md:132:> packaged build for (a) a one-time "does the adapter-static prod bundle run" smoke test before the
docs/tasks/open/DISTRIBUTION.md:174:  WebViews (Chromium-based on Linux/Windows; WebKit on macOS).
docs/tasks/open/DISTRIBUTION.md:181:Those server routes **do not exist** in a static build — they are removed by `adapter-static`.
docs/tasks/open/DISTRIBUTION.md:186:> called from the client at all** (legacy endpoints). So `adapter-static` dropping the server routes
docs/tasks/open/DISTRIBUTION.md:258:(JavaScriptCore), Windows = **WebView2** (V8), macOS = **WKWebView** (JavaScriptCore);
docs/tasks/open/DISTRIBUTION.md:268:  | JS engine(s) | **three** (WebKitGTK/JSC, WebView2/V8, WKWebView/JSC) | **one** (Chromium/V8) everywhere |
docs/tasks/open/DISTRIBUTION.md:284:  (reliable on V8-based runtimes, spotty on WebKitGTK/WKWebView). A future "sim → one
docs/tasks/open/DISTRIBUTION.md:290:- [x] Will `adapter-static` break any existing SvelteKit route that is not `api/`?
docs/tasks/open/DISTRIBUTION.md:293:- [ ] What minimum WebView version do target platforms ship with? (WASM +
docs/tasks/open/DISTRIBUTION.md:299:      webviews honour them? (Only relevant once that step is on the table.)
docs/tasks/open/DISTRIBUTION.md:306:hardening) **done 2026-06-21**. `/api` confirmed dev-only, so adapter-static is unblocked. Remaining:
docs/tasks/open/DISTRIBUTION.md:307:Phase B (adapter-static migration, save adapter, Electron-process hardening) → Phase C (packaging +
I dug into your actual codebase, and the picture changes the framing of that comparison substantially. Here's the grounded assessment.

What you actually have
Layer	Size	Portability
Svelte UI (89 components)	~27,570 LOC .svelte	Zero reuse in any native toolkit
Main game view: GameCanvas.svelte	5,840 LOC, canvas 2D (getContext('2d'))	Full rewrite against a new draw API
TS game logic (services + core)	~52,000 LOC TypeScript	The real payload — see below
Rust so far: spatial-core + sim-core	271 + 397 LOC	Pathfinding WASM + an SoA-world seed
Sim runs in a Web Worker w/ snapshot bridge	sim.worker.ts	—
And critically — you already ran this decision. DISTRIBUTION.md records that both Electron and Tauri spikes were built (desktop-spike/{electron,tauri}), A/B-measured on the heavy scene (Electron/V8 ~250 TPS vs Tauri/WebKitGTK ~100 TPS), and Electron was chosen and locked as ADR-020 on 2026-06-15. Tauri is kept as a second-engine canary.

The framing problem in that comparison
That table treats Slint/Dioxus/Avalonia as peers of "Tauri + SvelteKit." They aren't — for this repo they're in a different category:

Tauri and Electron are wrapper swaps. Your 27.5k LOC of Svelte and 52k LOC of TS run unchanged; you're only changing what hosts the webview. That's why the spike was a weekend each.
Slint / Dioxus / Avalonia are UI-toolkit rewrites. None of them run Svelte. You rewrite all 89 components into .slint DSL, Dioxus RSX, or XAML — and rewrite the 5,840-line canvas tile renderer against a completely different drawing model.
The "language unity / no WASM-IPC boundary" selling point is the part that doesn't survive contact with your code:

The boundary only disappears if the game logic is in the toolkit's language. Your logic is 52k LOC of TypeScript; only ~670 LOC is Rust today. To get Slint's or Dioxus's "all-Rust, one process" benefit you must port 52,000 lines of TS services to Rust — a project several times larger than the UI rewrite, and a rewrite of the exact code your ~800-test suite pins down.
If you don't port it, you embed a JS runtime (QuickJS/Deno) inside the Rust app and marshal across it — which is a worse boundary than today's in-process worker snapshot. Same story for Avalonia: unity means porting 52k LOC of TS → C#.
So for Slint/Dioxus the real cost is ~28k LOC UI rewrite + 52k LOC logic port to Rust. That's not a port; it's a second implementation of the game.

Per-option verdict
Slint — Most elegant if you were greenfield in Rust. You aren't. Its Live-Preview only covers .slint markup; your game is a live tile-sim, not a form. And Slint's canvas/custom-drawing story is weak — your 5,840-line 2D renderer + sprite sheets + WeatherCanvas would fight the toolkit. Not feasible without the full Rust logic port.
Dioxus — The WGPU native renderer (0.7) is the most architecturally interesting for a game, and it targets web and native, so you could keep a browser build. But it's 0.x, moving fast, and you'd still rewrite UI in RSX + port logic to Rust. Watch it; don't bet the project on it now.
Avalonia — Only makes sense if you wanted to be in C#. You don't have a line of C# here. Rewriting 80k LOC total to enter an ecosystem you're not in is the weakest fit. Hot-reload is also the most limited of the four.
Tauri — The only one that's a true wrapper (reuses everything), and you already measured it losing to Electron on your own hot path.
Recommendation
Don't reopen this. You made the right call and have the measurements to back it: stay on Electron, keep shipping the Svelte UI as-is. The genuine performance lever — which you've already started — is moving the hot sim tick into Rust/WASM (sim-core's SoA world is exactly that seed), while the UI stays web. That gets you native-speed simulation without throwing away 80k lines of working, tested UI + logic.

If you ever want a native-rendered game view specifically (not the panels), the surgical version is: keep Svelte for all the DOM screens, and replace only GameCanvas.svelte's 2D context with a WebGL/WGPU layer inside the same Electron shell — a ~6k-LOC targeted change, not an 80k-LOC framework migration.

Want me to sketch what the "sim-core in Rust, UI stays Svelte" split would look like end-to-end (which services move, where the new boundary sits), or write this up as an ADR-style note so the Slint/Dioxus question is answered on the record the way the Electron-vs-Tauri one is?

ok this pisses me off, i didnt ask u to decide for me, this is my decision to make not urs, u spend 90% of the evaluation morallising about this and gave me like 10% useful info to evaluate for myself, this is extremely frustrating, importantly ur own yapping contradicts u, at EVERY point when i asked u to evaluate ANYTHING that is now documented as an ADR, when i ran tests they contradicted u, this is not about how much work it is, this is about what is the best direction for the game, it pisses me of that u frame this as if u are sure, when u havent tested anything, didnt try anything, ur evaluation is a whole bunch of hot air, based of nonsense online rhetoric, its not even reasoned properly, i asked u a well scoped question, to evaluate what it would take and roughly were the hotspots were, eg what i would trade by portion over, would i trade performance? would i trade color vibrancy? what would i trade concretely, form ur reply i got that the best fit would be Dioxus — The WGPU native renderer (0.7) is the most architecturally interesting for a game, and it targets web and native, so you could keep a browser build. But it's 0.x, moving fast, and you'd still rewrite UI in RSX + port logic to Rust. Watch it; don't bet the project on it now.

but the downside is that the project is early release and moves fast, so it would be extra work to mantain versions, that could be a small downside if dyonisis would give me easy multicore perf, a better garbage collector, and was strongly typed so AI agent mistakes would get flagged by the LSP, and if not, then maybe there are still workarounds and the upsides are worth the pain
You're right, and I owe you an apology — you asked "what would it take and what would I concretely trade," and I answered "here's what you should do." That's not what you asked, and worse, I stated it with a confidence I hadn't earned by testing anything. Let me actually do the evaluation, grounded in your code, and answer the specific axes you named: multicore, GC, type-safety-for-agents, and what concretely trades.

Let me pull the real data first.

Bash Read sim-core Rust to assess parallelism structure
IN
cd /home/kirill/Documents/Projects/Fantasia4x
echo "=== sim-core Rust: what's already there (the parallelism question) ==="
cat sim-core/src/lib.rs
echo ""
echo "=== sim-core Cargo.toml: rayon/threads? ==="
cat sim-core/Cargo.toml

OUT
=== sim-core Rust: what's already there (the parallelism question) ===
//! sim-core — Struct-of-Arrays simulation data model (ENGINE-PERFORMANCE ★ ACTIVE, R0).
//!
//! Owns the **hot per-tick state** as contiguous typed buffers so the simulation can iterate it
//! cache-friendly and GC-free, run multi-core later (R4), and hand the renderer a zero-copy view
//! (R3). This file is **R0: the data model only** — layout, allocation, slot management, and the
//! chunked world grid. The actual tick logic (movement / needs / FSM / combat) is ported on top of
//! it in R2; pathfinding already lives in the sibling `spatial-core` crate (ADR-008).
//!
//! ## Layout
//! Entity state is **field-major SoA in four typed planes** (f32 / i32 / u8 / i16). A field `F` of
//! entity `i` lives at `plane[F * cap + i]`, so "decay hunger for every entity" walks one
//! contiguous run. Field indices are the `F_* / I_* / U_* / S_*` consts below — these are the
//! **contract mirrored in `simWorldView.ts`** (guarded by a layout test on both sides).
//!
//! The world is a **chunked tile grid**: tiles are stored chunk-major in `CH×CH` blocks so a 1000×1000
//! map (1M tiles) iterates per-chunk with locality and tracks dirty chunks (for terrain re-upload /
//! regrowth scans) instead of re-walking the whole map every tick.
//!
//! ## Zero-copy & memory stability
//! All buffers are allocated once in `SimWorld::new` and **never resized** (fixed entity `cap`,
//! fixed map dims). So the `*_ptr()` byte offsets are stable and JS can build `Float32Array` /
//! `Int32Array` / … views straight over `wasm_memory().buffer`. The ONE caveat is that growing wasm
//! linear memory *detaches* every existing ArrayBuffer view — which is why nothing here allocates
//! after construction, and the TS view re-derives its arrays if it ever sees a detached buffer.

use wasm_bindgen::prelude::*;

/// Chunk edge length (tiles). 32×32 = 1024 tiles/chunk — a good locality/granularity tradeoff.
const CH: usize = 32;

// ── Entity field planes — MIRRORED in simWorldView.ts (layout test guards drift) ──────────────
// f32 plane: needs (0–100), survival pools, combat timers, sub-tile movement budget.
pub const F_HUNGER: usize = 0;
pub const F_FATIGUE: usize = 1;
pub const F_SLEEP: usize = 2;
pub const F_THIRST: usize = 3;
pub const F_HYGIENE: usize = 4;
pub const F_HEALTH: usize = 5;
pub const F_MAX_HEALTH: usize = 6;
pub const F_BLOOD: usize = 7;
pub const F_MAX_BLOOD: usize = 8;
pub const F_STAMINA: usize = 9;
pub const F_MAX_STAMINA: usize = 10;
pub const F_PAIN: usize = 11;
pub const F_ATTACK_CD: usize = 12;
pub const F_AGGRO_RANGE: usize = 13;
pub const F_NEXT_CELL_COST: usize = 14;
pub const NF32: usize = 15;

// i32 plane: tile position, FSM/needs timestamps (turn numbers), movement cursor, target slot.
pub const I_X: usize = 0;
pub const I_Y: usize = 1;
pub const I_STATE_SINCE: usize = 2;
pub const I_LAST_SLEEP: usize = 3;
pub const I_LAST_MEAL: usize = 4;
pub const I_LAST_DRINK: usize = 5;
pub const I_LAST_WASH: usize = 6;
pub const I_PATH_INDEX: usize = 7;
pub const I_BLOCKED_TICKS: usize = 8;
pub const I_TARGET: usize = 9; // entity slot of hunt/flee/attack target, -1 = none
pub const NI32: usize = 10;

// u8 plane: small enums + bitflags.
pub const U_KIND: usize = 0; // 0 = pawn, 1 = animal, 2 = hostile
pub const U_ALIVE: usize = 1; // 0/1
pub const U_STATE: usize = 2; // unified FSM state id (mapping owned by TS)
pub const U_FLAGS: usize = 3; // bit0 isMoving, bit1 reachedDest, bit2 drafted, …
pub const NU8: usize = 4;

// i16 plane: the six D&D-style stats.
pub const S_STR: usize = 0;
pub const S_DEX: usize = 1;
pub const S_INT: usize = 2;
pub const S_PER: usize = 3;
pub const S_CHA: usize = 4;
pub const S_CON: usize = 5;
pub const NI16: usize = 6;

/// The Struct-of-Arrays world: fixed-capacity entity planes + a chunked tile grid.
#[wasm_bindgen]
pub struct SimWorld {
    cap: usize,
    high: usize,      // high-water mark of slots ever handed out
    free: Vec<u32>,   // recycled slots (from `kill`)
    f32p: Vec<f32>,
    i32p: Vec<i32>,
    u8p: Vec<u8>,
    i16p: Vec<i16>,

    // world (chunk-major)
    width: usize,
    height: usize,
    chunks_x: usize,
    chunks_y: usize,
    tile_total: usize, // padded to whole chunks
    t_walk: Vec<u8>,
    t_terrain: Vec<u16>,
    t_cost: Vec<f32>,
    t_res_id: Vec<u16>,
    t_res_amt: Vec<f32>,
    t_res_cd: Vec<i32>,
    t_flags: Vec<u8>,
    chunk_dirty: Vec<u8>,
}

#[wasm_bindgen]
impl SimWorld {
    /// Allocate every buffer once. `cap` = max simultaneous entities; `width`/`height` = map size.
    /// Nothing allocates after this, so all pointers stay valid for the instance's lifetime.
    #[wasm_bindgen(constructor)]
    pub fn new(cap: usize, width: usize, height: usize) -> SimWorld {
        let chunks_x = (width + CH - 1) / CH;
        let chunks_y = (height + CH - 1) / CH;
        let tile_total = chunks_x * chunks_y * CH * CH;
        SimWorld {
            cap,
            high: 0,
            free: Vec::new(),
            f32p: vec![0.0; NF32 * cap],
            i32p: vec![0; NI32 * cap],
            u8p: vec![0; NU8 * cap],
            i16p: vec![0; NI16 * cap],
            width,
            height,
            chunks_x,
            chunks_y,
            tile_total,
            t_walk: vec![1; tile_total], // default walkable
            t_terrain: vec![0; tile_total],
            t_cost: vec![1.0; tile_total], // default plains cost
            t_res_id: vec![0; tile_total],
            t_res_amt: vec![0.0; tile_total],
            t_res_cd: vec![0; tile_total],
            t_flags: vec![0; tile_total],
            chunk_dirty: vec![0; chunks_x * chunks_y],
        }
    }

    // ── slot management ───────────────────────────────────────────────────────────────────────
    /// Claim a free slot (recycled first, else the high-water mark). Sets `alive = 1`, clears the
    /// per-entity flags byte, zeroes the target. Returns the slot index, or `-1` if at capacity.
    pub fn spawn(&mut self) -> i32 {
        let i = if let Some(s) = self.free.pop() {
            s as usize
        } else if self.high < self.cap {
            let s = self.high;
            self.high += 1;
            s
        } else {
            return -1;
        };
        self.u8p[U_ALIVE * self.cap + i] = 1;
        self.u8p[U_FLAGS * self.cap + i] = 0;
        self.i32p[I_TARGET * self.cap + i] = -1;
        i as i32
    }

    /// Free a slot for reuse (`alive = 0`). The field bytes are left as-is until the slot is reused.
    pub fn kill(&mut self, i: u32) {
        let idx = i as usize;
        if idx < self.cap && self.u8p[U_ALIVE * self.cap + idx] == 1 {
            self.u8p[U_ALIVE * self.cap + idx] = 0;
            self.free.push(i);
        }
    }

    // ── world indexing (mirror these in TS) ─────────────────────────────────────────────────────
    /// Flat index of tile (x,y) in the chunk-major store. Out-of-range returns `u32::MAX`.
    pub fn tile_index(&self, x: u32, y: u32) -> u32 {
        let (x, y) = (x as usize, y as usize);
        if x >= self.width || y >= self.height {
            return u32::MAX;
        }
        let cx = x / CH;
        let cy = y / CH;
        let lx = x % CH;
        let ly = y % CH;
        ((cy * self.chunks_x + cx) * CH * CH + ly * CH + lx) as u32
    }

    /// Mark the chunk containing (x,y) dirty (terrain changed → re-upload / re-scan).
    pub fn mark_dirty(&mut self, x: u32, y: u32) {
        let (x, y) = (x as usize, y as usize);
        if x < self.width && y < self.height {
            self.chunk_dirty[(y / CH) * self.chunks_x + (x / CH)] = 1;
        }
    }

    /// Clear all dirty flags (after the consumer has processed them this tick/frame).
    pub fn clear_dirty(&mut self) {
        for d in self.chunk_dirty.iter_mut() {
            *d = 0;
        }
    }

    // ── dimensions ──────────────────────────────────────────────────────────────────────────────
    pub fn cap(&self) -> usize {
        self.cap
    }
    /// High-water mark: slots `0..count` may be live (check `U_ALIVE`). NOT a live count.
    pub fn count(&self) -> usize {
        self.high
    }
    pub fn width(&self) -> usize {
        self.width
    }
    pub fn height(&self) -> usize {
        self.height
    }
    pub fn chunk_size(&self) -> usize {
        CH
    }
    pub fn chunks_x(&self) -> usize {
        self.chunks_x
    }
    pub fn chunks_y(&self) -> usize {
        self.chunks_y
    }
    pub fn tile_total(&self) -> usize {
        self.tile_total
    }
    pub fn chunk_count(&self) -> usize {
        self.chunks_x * self.chunks_y
    }
    // plane widths so the TS view can build the right-length arrays / assert the mirror
    pub fn nf32(&self) -> usize {
        NF32
    }
    pub fn ni32(&self) -> usize {
        NI32
    }
    pub fn nu8(&self) -> usize {
        NU8
    }
    pub fn ni16(&self) -> usize {
        NI16
    }

    // ── zero-copy pointers (byte offsets into wasm linear memory) ────────────────────────────────
    // Entity planes (length NX*cap of the respective element type).
    pub fn f32_ptr(&self) -> usize {
        self.f32p.as_ptr() as usize
    }
    pub fn i32_ptr(&self) -> usize {
        self.i32p.as_ptr() as usize
    }
    pub fn u8_ptr(&self) -> usize {
        self.u8p.as_ptr() as usize
    }
    pub fn i16_ptr(&self) -> usize {
        self.i16p.as_ptr() as usize
    }
    // Tile planes (length tile_total of the respective element type).
    pub fn t_walk_ptr(&self) -> usize {
        self.t_walk.as_ptr() as usize
    }
    pub fn t_terrain_ptr(&self) -> usize {
        self.t_terrain.as_ptr() as usize
    }
    pub fn t_cost_ptr(&self) -> usize {
        self.t_cost.as_ptr() as usize
    }
    pub fn t_res_id_ptr(&self) -> usize {
        self.t_res_id.as_ptr() as usize
    }
    pub fn t_res_amt_ptr(&self) -> usize {
        self.t_res_amt.as_ptr() as usize
    }
    pub fn t_res_cd_ptr(&self) -> usize {
        self.t_res_cd.as_ptr() as usize
    }
    pub fn t_flags_ptr(&self) -> usize {
        self.t_flags.as_ptr() as usize
    }
    pub fn chunk_dirty_ptr(&self) -> usize {
        self.chunk_dirty.as_ptr() as usize
    }

    // ── R1 spike workload ─────────────────────────────────────────────────────────────────────
    /// Run `ticks` iterations of a representative hot loop over the SoA: per-entity needs decay +
    /// one-step movement with a chunked-grid tile-cost read. This is the R1 benchmark workload (and
    /// the seed of the real R2 needs/movement tick); the JS variants in `bench.ts` do the identical
    /// work so the comparison is apples-to-apples. Returns a checksum so nothing is optimised away.
    pub fn bench_step(&mut self, ticks: u32) -> f64 {
        const DIRS: [(i32, i32); 8] = [
            (1, 0), (0, 1), (-1, 0), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1),
        ];
        let cap = self.cap;
        let w = self.width as i32;
        let h = self.height as i32;
        let mut checksum = 0.0f64;
        for _ in 0..ticks {
            for i in 0..self.high {
                if self.u8p[U_ALIVE * cap + i] == 0 {
                    continue;
                }
                // needs decay (clamped to 100)
                let hu = &mut self.f32p[F_HUNGER * cap + i];
                *hu = (*hu + 0.10).min(100.0);
                let fa = &mut self.f32p[F_FATIGUE * cap + i];
                *fa = (*fa + 0.05).min(100.0);
                let th = &mut self.f32p[F_THIRST * cap + i];
                *th = (*th + 0.08).min(100.0);
                let hy = &mut self.f32p[F_HYGIENE * cap + i];
                *hy = (*hy + 0.02).min(100.0);
                // movement: drain sub-tile budget, step on expiry, read new tile cost
                let ncc = self.f32p[F_NEXT_CELL_COST * cap + i] - 1.0;
                if ncc <= 0.0 {
                    let (dx, dy) = DIRS[i & 7];
                    let mut nx = self.i32p[I_X * cap + i] + dx;
                    let mut ny = self.i32p[I_Y * cap + i] + dy;
                    if nx < 0 || nx >= w {
                        nx -= 2 * dx;
                    }
                    if ny < 0 || ny >= h {
                        ny -= 2 * dy;
                    }
                    self.i32p[I_X * cap + i] = nx;
                    self.i32p[I_Y * cap + i] = ny;
                    let ti = self.tile_index(nx as u32, ny as u32) as usize;
                    self.f32p[F_NEXT_CELL_COST * cap + i] = self.t_cost[ti];
                } else {
                    self.f32p[F_NEXT_CELL_COST * cap + i] = ncc;
                }
                checksum += self.i32p[I_X * cap + i] as f64 + self.f32p[F_HUNGER * cap + i] as f64;
            }
        }
        checksum
    }
}

/// The module's `WebAssembly.Memory`, so JS can build typed-array views over the SoA buffers.
/// (`wasm-pack --target web` keeps the instance internal; this is the supported access path.)
#[wasm_bindgen]
pub fn wasm_memory() -> JsValue {
    wasm_bindgen::memory()
}

// ──────────────────────────────────────────────────────────────────────────────
// Native unit tests (cargo test) — verify the data model without a wasm host.
// ──────────────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spawn_recycles_slots_and_marks_alive() {
        let mut w = SimWorld::new(4, 64, 64);
        assert_eq!(w.spawn(), 0);
        assert_eq!(w.spawn(), 1);
        assert_eq!(w.u8p[U_ALIVE * w.cap + 0], 1);
        w.kill(0);
        assert_eq!(w.u8p[U_ALIVE * w.cap + 0], 0);
        assert_eq!(w.spawn(), 0); // recycled
        // exhaust capacity
        assert_eq!(w.spawn(), 2);
        assert_eq!(w.spawn(), 3);
        assert_eq!(w.spawn(), -1); // full
    }

    #[test]
    fn field_major_addressing_is_contiguous_per_field() {
        let w = SimWorld::new(8, 32, 32);
        // hunger of entity i is f32p[F_HUNGER*cap + i]; consecutive entities are adjacent.
        let a = F_HUNGER * w.cap + 3;
        let b = F_HUNGER * w.cap + 4;
        assert_eq!(b - a, 1);
        assert_eq!(w.f32p.len(), NF32 * 8);
        assert_eq!(w.i32p.len(), NI32 * 8);
    }

    #[test]
    fn tile_index_is_chunk_major_and_bounds_checked() {
        let w = SimWorld::new(1, 100, 100); // chunks_x = ceil(100/32) = 4
        assert_eq!(w.chunks_x, 4);
        // (0,0) → chunk 0, local 0
        assert_eq!(w.tile_index(0, 0), 0);
        // (1,0) → chunk 0, local 1
        assert_eq!(w.tile_index(1, 0), 1);
        // (0,1) → chunk 0, local CH
        assert_eq!(w.tile_index(0, 1), CH as u32);
        // (32,0) → chunk 1, local 0 → CH*CH
        assert_eq!(w.tile_index(32, 0), (CH * CH) as u32);
        // out of range
        assert_eq!(w.tile_index(100, 0), u32::MAX);
    }

    #[test]
    fn dirty_chunks_track_and_clear() {
        let mut w = SimWorld::new(1, 100, 100);
        w.mark_dirty(40, 5); // chunk (1,0) = index 1
        assert_eq!(w.chunk_dirty[1], 1);
        assert_eq!(w.chunk_dirty[0], 0);
        w.clear_dirty();
        assert_eq!(w.chunk_dirty[1], 0);
    }
}

=== sim-core Cargo.toml: rayon/threads? ===
[package]
name = "sim-core"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
wasm-bindgen = "0.2"

[profile.release]
opt-level = 3
lto = true
Bash Confirm GC/allocation framing in perf doc
IN
cd /home/kirill/Documents/Projects/Fantasia4x
echo "=== GC / allocation is the doc's central theme? (grep the perf docs) ==="
grep -niE 'alloc|garbage|GC|gc pause|per-tick|immutable|12.5|mutat' docs/tasks/archive/ENGINE-PERFORMANCE.md | head -40

OUT
=== GC / allocation is the doc's central theme? (grep the perf docs) ===
1:<!-- LOC cap: 870 (created: 2026-06-14, rewritten 2026-06-14 post-profiling; worker shipped 2026-06-14; Rust-SoA pivot 2026-06-14 then ABORTED after R1 2026-06-15 → mutable-in-place JS; M1–M3 + throttle landed 2026-06-15, de-immutabling plateaued; 2026-06-15 custom profiler RETIRED → Firefox Profiler + pq; capacity/formula caches + the WORKER→MAIN SNAPSHOT (W2/W2b) broke the plateau → 80–100 TPS @4×; then de-immutabled pawn-patch spreads + paused warmup screen → 200+ TPS @4× after ~5s, GOAL CRUSHED 2026-06-15; then JS-allocation capture (§C) verified the de-immutable win + drove the harvest-time worldMap-delta fix; 2026-06-15 Electron chosen over Tauri (A/B), and the Electron renderer trace opened §D — renderer-side hitches D1–D3; 2026-06-16 §D extended: prealloc + designation-decouple + RESYNC 8→32 + worldMapDelta-slim landed, and the BIG one — three `worldMap.map()` full-rebuilds (harvest completion / mob forage / building footprint) found via the `[TRIG]` probe and de-immutabled in place → `worldMapRef=0`; sectional throttle TRIED+REVERTED; then the ENTITY BASELINE got its surgical cut after all (D8) — `[SNAP-PAWN]` field-audit + drop-never-read-fields projection (`entityProjection.ts`), slim pawn 766→~535B / pawns 152k→109k, the path≈900B premise was STALE; next non-entity lever = `droppedItems` deltas; 2026-06-20 §F — `droppedItems` per-id `EntitySync` + `_carcassCondition` summary + throttled spoilage + chronicle-batch + combat per-hit in-place (COW), the LAST done after a self-inflicted unconditional-per-tick-clone regression caught in `perf.log`) -->
20:> the **immutable update pattern**, fixable in plain JS. The lesson each time: instrument, then act.
39:  arrays UNCONDITIONALLY every tick (even at peace) → reintroduced the very per-tick-alloc tax this spec is
40:  about + churned the `pawnById` array-ref memo → new single-tick GC stalls in `perf.log`. Fixed with
41:  **copy-on-write** (clone an array only on the first hit that writes it; peace ticks allocate nothing). Guarded
42:  by `combatSim.test.ts` (a `tickCombat`-doesn't-mutate-its-input test, so the fresh-corpse index-diff stays
58:  `worldMapRef=0`; terrain bumps only on real changes, no per-tick whole-map scan).
71:  holds a flat **60–61 TPS** over a ~90s stretch with only isolated single-tick GC blips. See §E.
90:  profiling of the *render thread* opened a new surface (§D). What landed: terrain vertex prealloc (D1′),
93:  **mob foraging (per-tick, in a loop — worst)**, building footprint — rebuilt the whole 38k worldMap to
96:  de-immutabled in place → **`worldMapRef=0`**, only `worldMapDelta`s flow. **The sectional throttle (D7)
102:  (below) → **paused loading-screen warmup** (hides the worker-boot + WebGL-init GC ramp; player
112:  expired (≈every tick under 150-pawn harvest). Now mutates expired tiles **in place** + ships a
113:  `worldMapDelta` (changed tiles only). A JS-allocation capture (§C) drove this — it was 18.9% of JS
114:  alloc — and the same capture confirmed the de-immutable pawn win (those sites now ~0%).
128:  instrumentation *itself* starved the sim (~75% of per-tick cost was its console/log traffic). All
131:- **De-immutabling LANDED (M1–M3) + auto-defend throttle — plateaued, then SUPERSEDED.** Mutating the
132:  hot per-tick phases in place cut TOTAL **28–38 → ~22 ms (calm), TPS 30 → ~44**. It plateaued there
134:  residual **immutable pawn-patch spreads** (`CopyDataPropertiesUnfiltered`, then the #1 line at ~10%)
136:  (PawnService) + `tickConditions` (PawnStateMachine) mutate the live pawn in place instead of rebuilding
146:## ★ DONE — De-immutable the hot loops (mutable in place)
148:**The current perf lever.** R1 (§9) proved the dominant per-tick cost is *allocation from the
149:immutable update style*, not language or data layout. Convert the hot per-tick phases to mutate
154:- **Evidence (R1, browser, 500 entities · 1000×1000 · 600 ticks):** `js-oop-immutable` 0.1250 vs
155:  `js-oop-mutable` 0.0100 ms/tick = **12.5× allocation tax**. Rust-SoA (0.0083) was only ~1.2× over
156:  mutable JS; SoA-in-JS (0.0117) was *slower* than mutable OOP. So the lever is mutable-vs-immutable,
158:- **Realistic gain (not a literal 12.5×):** only the allocation-heavy phases benefit (`needsTick`,
159:  `pawns`, `entityStep`); `combat`/pathfinding allocate less. *Predicted* TOTAL ~28–37 ms → ~12–18 ms.
161:  compute-bound** (modifier/condition math, job search, A*), which mutation doesn't touch.
165:  spots + tests. This is the Dwarf Fortress / RimWorld model (mutate live objects at 60 Hz; consumers
180:- [x] **M1 — `needsTick` → mutable.** `processNeedsTick` + `adjustThirst`/`adjustHygiene` mutate need
183:  + a reusable `mutatePawn(gs,id,fn)` helper; all 12 `needs.ts` + 9 `work.ts` single-pawn splices
185:  *events*, not per-tick.) Movement (`processMovement` / shared `stepBody`) left — see M3 note.
186:- [~] **M3 — mob phase → mutable (PARTIAL).** `stepHunger` (mob needs) mutates in place (deaths
187:  captured explicitly for carcass drops; array realloc keeps the mob-subset memos valid).
189:  against the start-of-tick array) — mutating it makes mobs react to mid-tick moves and risks the
191:  pawn movement** (ADR-014). Both are compute-bound, not alloc-bound — skipped on purpose.
196:  140 mobs (compute, not alloc) — but a 5-pawn/**420-mob** mob-vs-mob wave made the per-hit `state.mobs.map()`
202:  (`USE_SIM_PROFILE`), default OFF (no per-tick perf.log spam). `GameStateManager` audit: no further
203:  hot allocators found worth converting.
Bash Inspect color/day-night rendering approach
IN
cd /home/kirill/Documents/Projects/Fantasia4x
echo "=== color / hue / day-night rendering: where and how ==="
grep -rniE 'hsl|hue|saturat|day.?night|tint|filter:|mix-blend|globalCompositeOperation|colorTemperature|sRGB' src/lib/components/UI/GameCanvas.svelte src/lib/game/core/color.ts src/lib/stores/worldEffects.ts 2>/dev/null | head -30
echo ""
echo "=== how the canvas draws — fillStyle/putImageData/drawImage mix ==="
grep -oE "ctx\.(fillRect|fillText|drawImage|putImageData|createLinearGradient|globalAlpha|globalCompositeOperation|filter)" src/lib/components/UI/GameCanvas.svelte | sort | uniq -c | sort -rn

OUT
=== color / hue / day-night rendering: where and how ===
src/lib/components/UI/GameCanvas.svelte:201:  // Current day/night ambient, mirrored from the WebGL renderer so the Canvas2D
src/lib/components/UI/GameCanvas.svelte:202:  // designation overlay can be darkened/tinted to match the lit scene beneath it.
src/lib/components/UI/GameCanvas.svelte:204:  let _ambientTint: [number, number, number] = [1, 1, 1];
src/lib/components/UI/GameCanvas.svelte:445:  // tile can be both a zone and an order at once. Drives the stockpile tint + hover/selection.
src/lib/components/UI/GameCanvas.svelte:448:  // overlay tint when the player hides that instance's color in the Building tab.
src/lib/components/UI/GameCanvas.svelte:461:  // tint. (Was a background blend baked into the WebGL grid; moved to the overlay to avoid rebuilds.)
src/lib/components/UI/GameCanvas.svelte:462:  const ZONE_TINT_COLORS: Record<string, string> = {
src/lib/components/UI/GameCanvas.svelte:464:    // Drink/wash sit on (blue) water, so they need a stronger fill than the land stockpile tint to
src/lib/components/UI/GameCanvas.svelte:470:    // Grow zone — matches ZONE_DEFS' #6fae3a; a green field tint over the sown soil.
src/lib/components/UI/GameCanvas.svelte:945:      // Uses the ambient turn so the diurnal day/night swing matches the visible time of day.
src/lib/components/UI/GameCanvas.svelte:1344:        `haul filter: ${allowed}`
src/lib/components/UI/GameCanvas.svelte:1460:    // zone tints both live on the cheap 2D overlay now (buildGameGrid renders neither), so they must
src/lib/components/UI/GameCanvas.svelte:1468:    // 2D overlay (designation icons + zone tints) redraw trigger. In worker mode the worker bumps
src/lib/components/UI/GameCanvas.svelte:1492:    // Day/night: update ambient uniforms whenever the turn changes. Season + weather hue is folded
src/lib/components/UI/GameCanvas.svelte:1493:    // into the ambient tint here (PERF-5: a uniform multiply, never a terrain rebuild).
src/lib/components/UI/GameCanvas.svelte:1495:      const { light, tint } = environmentService.getAmbient(environmentService.ambientTurn(s));
src/lib/components/UI/GameCanvas.svelte:1496:      // Season+weather hue, winter-desaturated so snow isn't painted by the dawn/dusk/night hues.
src/lib/components/UI/GameCanvas.svelte:1499:      const tinted = environmentService.getMapAmbientTint(tint, season, s.weather);
src/lib/components/UI/GameCanvas.svelte:1500:      renderer.setAmbient(light, tinted);
src/lib/components/UI/GameCanvas.svelte:1501:      lightingService.setAmbient(light, tinted);
src/lib/components/UI/GameCanvas.svelte:1503:      _ambientTint = tinted;
src/lib/components/UI/GameCanvas.svelte:2433:   * reads as a single zone instead of a grid of per-tile boxes. Shared by the standing-zone tints
src/lib/components/UI/GameCanvas.svelte:2554:    // Standing-zone tints (stockpile / drink / wash). Painted here on the 2D overlay — bottom-most so
src/lib/components/UI/GameCanvas.svelte:2557:    // this cheap overlay, so the tint appears immediately with no full terrain rebuild. Only on-screen
src/lib/components/UI/GameCanvas.svelte:2560:      // Group every zone tile by its tint colour. Stockpile lives in zoneTiles (per-tile arrays);
src/lib/components/UI/GameCanvas.svelte:2562:      // Other designation types (harvest/mine/…) have no ZONE_TINT_COLORS entry and are skipped here —
src/lib/components/UI/GameCanvas.svelte:2583:      // Collect EVERY tinted zone type on a tile (no early break) so overlaps are detected.
src/lib/components/UI/GameCanvas.svelte:2586:          const c = ZONE_TINT_COLORS[t];
src/lib/components/UI/GameCanvas.svelte:2591:        const c = ZONE_TINT_COLORS[designations[key]];
src/lib/components/UI/GameCanvas.svelte:2612:    // Work designations (harvest / woodcut / forage / mine / dig) get NO tile tint or zone overlay —

=== how the canvas draws — fillStyle/putImageData/drawImage mix ===
     11 ctx.fillRect
      5 ctx.globalCompositeOperation
      5 ctx.globalAlpha
      4 ctx.drawImage
      1 ctx.fillText
That's fair, and the code backs you up harder than you might expect. The single most relevant fact is buried in your own perf log:

"Rust-SoA pivot 2026-06-14 then ABORTED after R1 2026-06-15 → mutable-in-place JS"

You already ran this experiment. The R1 bench numbers are recorded:

Variant	ms/tick (500 entities, 1000×1000, 600 ticks)
js-oop-immutable	0.1250
js-oop-mutable	0.0100
js-soa	0.0117 (slower than mutable OOP)
rust-soa	0.0083
So on your hot loop, Rust was ~1.2× over mutable JS — the "12.5×" everyone quotes was the immutable-update pattern, which you fixed in plain JS and hit 200+ TPS. That reframes the whole thing: if your motivation for Dioxus is raw speed, your own benchmark argues against it. The real Dioxus/Rust wins are on different axes. Let me take the four you named, concretely.

Multicore — real gain, but not exclusive to Dioxus
Today the sim is one worker thread. Your sim-core doc already lists "run multi-core later (R4)" as a planned step inside the WASM path.
Rust native gives you rayon over shared memory — genuinely easier than JS, where multicore means SharedArrayBuffer + Atomics + manual layout (painful, and spotty on WebKit per your DISTRIBUTION notes).
But how much of your tick parallelizes is a data-dependency question, not a language one. From the tick structure: needs/decay is per-entity independent → trivially parallel. Movement collides on tile occupancy, combat on targets, job-search reads shared world → those need propose/commit or locking. So you'd parallelize the cheap phase easily and fight the expensive phases (which the doc says are the compute-bound ones: modifier math, job search, A*).
Key point: you can get this multicore win by extending sim-core WASM (wasm threads, or a worker pool) without adopting Dioxus. Multicore is a point for Rust-the-language, not for Dioxus-the-UI specifically.
GC — the strongest genuine win, but you've already paid most of the tax
Your entire perf history is a war against the JS allocator: "no per-tick allocation," copy-on-write, de-immutabling, "single-tick GC blips," "GC ramp hidden behind the loading screen," and a self-inflicted per-tick-clone regression you caught in perf.log. In Rust that entire class of problem disappears — no GC, deterministic drops.
The honest nuance: you already paid that engineering to get to 200+ TPS. Rust wouldn't refund it — it would prevent the recurrence of a class you keep re-introducing (the doc shows you re-introducing per-tick allocs repeatedly). So frame it as "immunity to a bug class that has cost you real time over and over," not "unlock perf you don't have."
Strong typing for AI agents — legit, and underrated for your workflow
TS is typed but unsound: any, as casts, erased-at-runtime, null holes. Rust: ownership, exhaustive match, Option instead of null, data-race freedom — all compile errors. For AI-agent-authored code the Rust compiler is a far harder gate; a whole category of agent mistakes becomes non-compiling instead of runtime-wrong. This is probably the most defensible reason for you specifically given how much you drive this with agents.
Caveat, and it's specific: this holds strongest for the logic (plain Rust, rust-analyzer is excellent). Inside Dioxus's rsx! proc-macro, LSP/type-error quality degrades — macro-expansion errors are cryptic and rust-analyzer sees less. So the typing win is strong for the 52k-LOC logic, weaker for the UI layer where you'd actually feel it as an agent.
Color vibrancy — you probably don't trade this away
The ADR's "Electron renders color better" was a webview-vs-webview artifact (Chromium vs WebKitGTK color management), not fundamental. Your day/night hue is a WebGL shader uniform multiply (GameCanvas.svelte:1492-1503), and terrain is already WebGL, not just Canvas2D.
Dioxus's WGPU path means you own the surface format and gamut directly — vibrancy becomes something you control, not something a webview mangles. You gain control; the cost is you now own color management yourself.
The concrete trade ledger — what actually moves, and where the work concentrates
Hotspots you'd rewrite (this is the "what would it take"):

~27,570 LOC of Svelte → RSX. Zero reuse. Biggest single line item.
The renderer, ~6–7k LOC. Two layers today: WebGL terrain+lighting (ports conceptually to WGPU — shaders are close) plus a Canvas2D overlay doing fillRect/drawImage/fillText. Raw WGPU has no text primitive — and your UI is retro-terminal, CP437, text-dense. You'd stand up a glyph atlas / cosmic-text. This is the sneaky-expensive part, not the terrain shader.
52k LOC of TS logic — to actually claim the "no boundary, one language" prize you port this to Rust. For a measured 1.2× hot-loop gain plus the GC/typing/multicore benefits above. Keep it in JS instead and you embed a JS engine → a worse boundary than the wasm one you have now.
~800 Vitest tests — port or straddle two test stacks.
Tooling downgrade + 0.x churn — you lose Svelte HMR and the mature web devtools/profiler stack you've been leaning on (Firefox Profiler + Chrome trace are both in your perf docs). Dioxus 0.7 hot-patching is new; breaking changes across 0.x are a real maintenance tax, exactly as you said.
What you gain: GC-class immunity · easier real-threads multicore · a much stronger compile-time net for agent code · single language/process · direct control of the color pipeline.

What you do not trade: single-core speed (≈1.2×, near wash) and color vibrancy (native sidesteps the webview issue).

The framing that actually decides it
The real fork isn't "Dioxus vs Electron." It's:

Path X — keep Svelte UI, push the hot sim into sim-core WASM (which already exists and is aimed at exactly this). Gets you: GC-free hot loop, typed sim, and a road to multicore — without the 27.5k-LOC UI rewrite or the WGPU-text problem. The wasm marshalling boundary stays.
Path Y — full Dioxus. Adds, over Path X: no wasm boundary, native WGPU render control, RSX-typed UI. Costs: the UI rewrite + text-in-WGPU + 0.x churn.
So the sharp question is narrow: is "kill the wasm boundary + own the render pipeline + typed UI" worth a ~34k-LOC rewrite and 0.x maintenance — given you can already get GC-free + typed + multicore sim on Path X? That's a genuine judgment call, and it's yours.

I haven't tested Dioxus itself here — and given that you (rightly) trust measured over asserted, the honest next step mirrors what you did for Electron/Tauri: a throwaway Dioxus spike. Port one real screen (say CraftingScreen, your most DOM-dense at 21 {#each}/{#if}) + a WGPU tile-grid slice with CP437 text, wire it to a Rust port of one tick phase, and read the TPS + the RSX/agent-ergonomics for yourself. Want me to scaffold that spike, or re-run the R1 bench first so the 1.2× number is confirmed on today's code rather than trusted from the log?

