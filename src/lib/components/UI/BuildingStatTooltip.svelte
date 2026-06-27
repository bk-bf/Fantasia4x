<!-- BuildingStatTooltip.svelte — hover breakdown for a building card: build info, effects (sleep
     regen / crafting bonus / comfort…), key properties, and the crafting recipes the building
     enables as a workstation. Reuses the work-tab job-priority tooltip format (WorkCellTooltip). -->
<script lang="ts">
  import type { Building } from '$lib/game/core/types';
  import { recipeService } from '$lib/game/services/RecipeService';
  import { itemService } from '$lib/game/services/ItemService';
  import {
    getMaterialProperty,
    aggregateMaterialMods
  } from '$lib/game/core/materialProperties';

  interface Props {
    building: Building;
    /** Chosen `category:` build materials (costKey → itemId) — drives the per-material stat section. */
    materials?: Record<string, string>;
    x: number;
    y: number;
  }
  let { building, materials = {}, x, y }: Props = $props();

  // §M Per-material stat deltas for the CHOSEN build materials: durability (multiplier) plus additive
  // beauty / comfort / insulation. Empty when nothing is picked (the slot is still "any …").
  let matIds = $derived(Object.values(materials).filter(Boolean));
  let matNames = $derived(
    matIds.map((id) => getMaterialProperty(id)?.label ?? id.replace(/_/g, ' ')).join(', ')
  );
  let matMods = $derived(matIds.length ? aggregateMaterialMods(matIds, 'building') : null);
  // Rows for the MATERIAL section: a signed/×-formatted line per non-neutral stat.
  let matRows = $derived.by(() => {
    const out: { label: string; val: string; good: boolean }[] = [];
    if (!matMods) return out;
    const dur = matMods.durability ?? 1;
    if (Math.abs(dur - 1) > 0.001)
      out.push({ label: 'Durability', val: `×${dur.toFixed(2)}`, good: dur >= 1 });
    const add: [string, number][] = [
      ['Beauty', matMods.beauty ?? 0],
      ['Comfort', matMods.comfort ?? 0],
      ['Insulation', matMods.insulation ?? 0]
    ];
    for (const [label, v] of add)
      if (Math.abs(v) > 0.001)
        out.push({ label, val: `${v > 0 ? '+' : ''}${v.toFixed(2)}`, good: v >= 0 });
    return out;
  });

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  }

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const humanize = (s: string) =>
    cap(
      s
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .trim()
        .toLowerCase()
    );
  // Fractions (0.8, 0.2) read as percentages; integers (population, knowledge) stay raw.
  const fmt = (v: number) => (Number.isInteger(v) ? `${v}` : `${Math.round(v * 100)}%`);

  // Internal/bookkeeping effect keys that shouldn't surface as player-facing rows.
  const SKIP_EFFECTS = new Set(['tier', 'movementCost', 'roof', 'window']);

  // Build-cost-independent info rows.
  let infoRows = $derived.by(() => {
    const out: { label: string; val: string }[] = [];
    if (building.workAmount != null) out.push({ label: 'Work', val: `${building.workAmount}` });
    if (building.toolTierRequired && building.toolTierRequired > 0)
      out.push({ label: 'Tool tier', val: `${building.toolTierRequired}` });
    if (building.populationRequired > 0)
      out.push({ label: 'Population', val: `${building.populationRequired}` });
    if (building.maxFuel && building.maxFuel > 0)
      out.push({ label: 'Fuel capacity', val: `${building.maxFuel}` });
    return out;
  });

  // Effects → labelled rows. *Enabled flags become capability tags; numeric effects format above.
  let effectRows = $derived.by(() => {
    const out: { label: string; val: string }[] = [];
    for (const [key, v] of Object.entries(building.effects ?? {})) {
      if (SKIP_EFFECTS.has(key)) continue;
      if (key.endsWith('Enabled')) {
        if (v) out.push({ label: humanize(key.replace(/Enabled$/, '')), val: '✓' });
        continue;
      }
      if (!v) continue;
      out.push({ label: humanize(key), val: fmt(v) });
    }
    return out;
  });

  // Curated building properties (housing / knowledge / production…).
  let propRows = $derived.by(() => {
    const p = building.buildingProperties;
    if (!p) return [] as { label: string; val: string }[];
    const out: { label: string; val: string }[] = [];
    if (p.populationCapacity) out.push({ label: 'Housing', val: `+${p.populationCapacity}` });
    if (p.knowledgeGeneration)
      out.push({ label: 'Knowledge/hr', val: `+${p.knowledgeGeneration}` });
    if (p.foodProduction) out.push({ label: 'Food/hr', val: `+${p.foodProduction}` });
    if (p.defensiveStrength) out.push({ label: 'Defense', val: `+${p.defensiveStrength}` });
    if (p.craftingSpeed) out.push({ label: 'Crafting speed', val: fmt(p.craftingSpeed) });
    if (p.preservationBonus) out.push({ label: 'Preservation', val: fmt(p.preservationBonus) });
    if (p.tradeBonus) out.push({ label: 'Trade', val: fmt(p.tradeBonus) });
    if (p.magicalPower) out.push({ label: 'Magic', val: `+${p.magicalPower}` });
    return out;
  });

  // Recipes this building enables as a workstation → the items it lets you craft.
  let enables = $derived.by(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const r of recipeService.getAllRecipes()) {
      if (r.station !== building.id) continue;
      const outId = Object.keys(r.outputs ?? {})[0];
      if (!outId) continue;
      const name = itemService.getItemById(outId)?.name ?? outId.replace(/_/g, ' ');
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    return names;
  });
  const ENABLES_CAP = 10;

  let headline = $derived(building.category ? humanize(building.category) : 'building');

  let flipX = $derived(typeof window !== 'undefined' && x > window.innerWidth - 280);
  let flipY = $derived(typeof window !== 'undefined' && y > window.innerHeight - 280);
  let style = $derived(
    `${flipX ? `right:${window.innerWidth - x + 14}px` : `left:${x + 16}px`};` +
      `${flipY ? `bottom:${window.innerHeight - y + 14}px` : `top:${y + 16}px`};`
  );
</script>

<div class="tip" use:portal {style}>
  <div class="tip-hdr">
    <span class="tip-name">{building.name}</span>
    <span class="tip-eff">{headline}</span>
  </div>

  {#each infoRows as r}
    <div class="tip-row"><span class="tip-lbl">{r.label}</span><span>{r.val}</span></div>
  {/each}

  {#if effectRows.length > 0}
    <div class="tip-sep">EFFECTS</div>
    {#each effectRows as r}
      <div class="tip-row"><span class="tip-lbl">{r.label}</span><span>{r.val}</span></div>
    {/each}
  {/if}

  {#if propRows.length > 0}
    <div class="tip-sep">PROPERTIES</div>
    {#each propRows as r}
      <div class="tip-row"><span class="tip-lbl">{r.label}</span><span>{r.val}</span></div>
    {/each}
  {/if}

  {#if matRows.length > 0}
    <div class="tip-sep">MATERIAL · {matNames}</div>
    {#each matRows as r}
      <div class="tip-row">
        <span class="tip-lbl">{r.label}</span>
        <span style="color:{r.good ? '#6bc' : '#e08'}">{r.val}</span>
      </div>
    {/each}
  {/if}

  {#if enables.length > 0}
    <div class="tip-sep">ENABLES CRAFTING</div>
    <div class="tip-enables">
      {enables.slice(0, ENABLES_CAP).join(', ')}{enables.length > ENABLES_CAP
        ? `, +${enables.length - ENABLES_CAP} more`
        : ''}
    </div>
  {/if}
</div>

<style>
  .tip {
    position: fixed;
    z-index: 1000;
    min-width: 190px;
    max-width: 260px;
    padding: 5px 7px;
    background: var(--bg-panel, #11151c);
    border: 1px solid var(--border-hi, #3a4656);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.55);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text);
    pointer-events: none;
  }
  .tip-hdr {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 3px;
    margin-bottom: 3px;
  }
  .tip-name {
    color: var(--accent-hi);
    letter-spacing: 0.04em;
  }
  .tip-eff {
    font-weight: bold;
    color: var(--accent);
    white-space: nowrap;
  }
  .tip-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    line-height: 1.5;
  }
  .tip-lbl {
    color: var(--text-dim);
  }
  .tip-sep {
    margin-top: 4px;
    padding-top: 3px;
    border-top: 1px solid var(--border);
    color: var(--text-muted, #555);
    font-size: 9px;
    letter-spacing: 0.08em;
  }
  .tip-enables {
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1.4;
  }
</style>
