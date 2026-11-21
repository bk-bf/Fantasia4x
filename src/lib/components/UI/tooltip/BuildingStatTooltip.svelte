<script lang="ts">
  import type { Building } from '$lib/game/core/types';
  import { recipeService } from '$lib/game/services/RecipeService';
  import { itemService } from '$lib/game/services/ItemService';
  import { getMaterialProperty, aggregateMaterialMods } from '$lib/game/core/defs/materials';
  import { chrome } from '$lib/pixelArt/chrome';

  interface Props {
    building: Building;
    materials?: Record<string, string>;
    left: number;
    top: number;
  }
  let { building, materials = {}, left, top }: Props = $props();
  let h = $state(0);
  let y = $derived(Math.max(8, Math.min(top, window.innerHeight - h - 8)));

  let matIds = $derived(Object.values(materials).filter(Boolean));
  let matNames = $derived(
    matIds.map((id) => getMaterialProperty(id)?.label ?? id.replace(/_/g, ' ')).join(', ')
  );
  let matMods = $derived(matIds.length ? aggregateMaterialMods(matIds, 'building') : null);
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
    return { destroy: () => node.remove() };
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
  const fmt = (v: number) => (Number.isInteger(v) ? `${v}` : `${Math.round(v * 100)}%`);

  const SKIP_EFFECTS = new Set(['tier', 'movementCost', 'roof', 'window']);

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
</script>

<div
  class="tip"
  use:portal
  style:left="{left}px"
  style:top="{y}px"
  bind:offsetHeight={h}
  {@attach chrome('tip')}
>
  <div class="tip-hdr">
    <span class="tip-name">{building.name}</span>
    <span class="tip-eff">{headline}</span>
  </div>
  {#if building.description}<p class="tip-desc">{building.description}</p>{/if}

  {#each infoRows as r (r.label)}
    <div class="tip-row"><span class="tip-lbl">{r.label}</span><span>{r.val}</span></div>
  {/each}

  {#if effectRows.length > 0}
    <div class="tip-sep">EFFECTS</div>
    {#each effectRows as r, i (i)}
      <div class="tip-row"><span class="tip-lbl">{r.label}</span><span>{r.val}</span></div>
    {/each}
  {/if}

  {#if propRows.length > 0}
    <div class="tip-sep">PROPERTIES</div>
    {#each propRows as r (r.label)}
      <div class="tip-row"><span class="tip-lbl">{r.label}</span><span>{r.val}</span></div>
    {/each}
  {/if}

  {#if matRows.length > 0}
    <div class="tip-sep">MATERIAL · {matNames}</div>
    {#each matRows as r (r.label)}
      <div class="tip-row">
        <span class="tip-lbl">{r.label}</span>
        <span class:pos={r.good} class:neg={!r.good}>{r.val}</span>
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
    width: 270px;
    padding: 9px 12px;
    font: 16px/17px var(--font-pixel);
    color: var(--text);
    pointer-events: none;
  }
  .tip-hdr {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 2px;
  }
  .tip-name {
    color: var(--accent-hi);
    letter-spacing: 1.4px;
    text-transform: uppercase;
  }
  .tip-eff {
    color: var(--text-muted);
    white-space: nowrap;
  }
  .tip-desc {
    margin: 0 0 5px;
    color: var(--text-dim);
  }
  .tip-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .tip-lbl {
    color: var(--text-dim);
  }
  .tip-sep {
    margin-top: 5px;
    color: var(--text-muted);
    letter-spacing: 1.4px;
  }
  .tip-enables {
    color: var(--text-dim);
  }
  .pos {
    color: var(--pos);
  }
  .neg {
    color: var(--neg);
  }
</style>
