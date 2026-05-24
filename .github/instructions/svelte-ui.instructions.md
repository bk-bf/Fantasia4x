---
description: "Use when writing or modifying Svelte components, screens, or routes. Covers Svelte 5 runes, store subscriptions, UI navigation, and the retro terminal visual style."
applyTo: ["src/lib/components/**/*.svelte", "src/routes/**/*.svelte"]
---

# Svelte UI Conventions

## Svelte 5 Runes

This project uses Svelte 5 with runes syntax. Do not use the legacy `$:` reactive syntax.

```svelte
<script lang="ts">
  // ✅ Svelte 5 runes
  let count = $state(0);
  let doubled = $derived(count * 2);
  $effect(() => { console.log(count); });

  // ❌ legacy — do not use
  // $: doubled = count * 2;
</script>
```

## Reading Game Stores

Import from `src/lib/stores/`. Subscribe with `$` prefix in templates:

```svelte
<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
</script>

<p>Turn: {$gameState.turn}</p>
```

Do not read `localStorage` directly in components — the store handles persistence.

## Screen Navigation

Change the active screen via the `uiState` store, not with SvelteKit router navigation:

```typescript
import { uiState } from '$lib/stores/uiState';
uiState.setScreen('pawn');   // or 'building', 'research', 'work', etc.
```

## Calling Game Logic

Components never call `GameEngineImpl` or services directly. Route all mutations through store actions or call-through helpers exposed by the stores.

## Visual Style — Retro Terminal

- Monospace font throughout (`font-family: monospace`)
- Dark background, bright foreground (green/amber on near-black)
- ASCII box-drawing characters (`┌─┐│└─┘`) for panels and borders
- Labels in ALL-CAPS, values in normal case
- Avoid rounded corners, gradients, shadows, or icon fonts

```svelte
<!-- ✅ terminal style -->
<div class="panel">
  ┌─ PAWN STATUS ──────────┐
  <span>Hunger: {hunger}/100</span>
  └────────────────────────┘
</div>

<!-- ❌ not this style -->
<div class="card rounded shadow-md">...</div>
```

## Activity Log

Append messages to the activity log via the `Log` store:

```typescript
import { log } from '$lib/stores/Log';
log.add(`${pawn.name} completed carpentry task.`);
```
