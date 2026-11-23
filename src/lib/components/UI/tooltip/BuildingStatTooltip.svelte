<script lang="ts">
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';
  import type { Building } from '$lib/game/core/types';
  import { recipeService } from '$lib/game/services/RecipeService';
  import { itemService } from '$lib/game/services/ItemService';
  import { getMaterialProperty, aggregateMaterialMods } from '$lib/game/core/defs/materials';

  interface Props {
    building: Building;
    materials?: Record<string, string>;
    x: number;
    y: number;
  }
  let { building, materials = {}, x, y }: Props = $props();

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

<HoverTip {x} {y}>
  <h5>
    {building.name}
    <span class="tip-eff">{headline}</span>
  </h5>
  {#if building.description}<p class="tip-desc">{building.description}</p>{/if}

  {#each infoRows as r}
    <div class="kv"><em>{r.label}</em><span>{r.val}</span></div>
  {/each}

  {#if effectRows.length > 0}
    <div class="tip-sep">EFFECTS</div>
    {#each effectRows as r}
      <div class="kv"><em>{r.label}</em><span>{r.val}</span></div>
    {/each}
  {/if}

  {#if propRows.length > 0}
    <div class="tip-sep">PROPERTIES</div>
    {#each propRows as r}
      <div class="kv"><em>{r.label}</em><span>{r.val}</span></div>
    {/each}
  {/if}

  {#if matRows.length > 0}
    <div class="tip-sep">MATERIAL · {matNames}</div>
    {#each matRows as r}
      <div class="kv">
        <em>{r.label}</em>
        <span style="color:{r.good ? 'var(--pos)' : 'var(--neg)'}">{r.val}</span>
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
</HoverTip>

<style>
  .tip-enables {
    line-height: 16px;
    color: var(--text-muted);
  }
</style>
