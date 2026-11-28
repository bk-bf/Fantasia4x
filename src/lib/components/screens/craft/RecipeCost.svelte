<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import ItemPills, { type ItemPillView } from '$lib/components/UI/widget/ItemPills.svelte';
  import MaterialPick from '$lib/components/UI/widget/MaterialPick.svelte';
  import { recipeService } from '$lib/game/services/RecipeService';
  import { byproductsOf, dishSlotNote, primaryQtyOf, recipeOf, type CraftEntry } from './craftData';

  let {
    entry,
    cost,
    isPlaceholder,
    picked,
    onpick
  }: {
    entry: CraftEntry;
    cost: Record<string, number>;
    isPlaceholder: boolean;
    picked: Record<string, string>;
    onpick: (slotKey: string, ingredientId: string) => void;
  } = $props();

  const stock = $derived($gameState?.stockpile ?? {});
  const amount = (id: string): number => stock[id] || 0;
  const id = $derived(entry.item.id);

  const rows = $derived(
    Object.entries(cost).map(([itemId, n]) => {
      const have = amount(itemId);
      return { itemId, qty: `${n}`, sub: `${have}`, dim: have < n };
    }) satisfies ItemPillView[]
  );
  const anyNeed = $derived.by(() => {
    const dyn = recipeOf(id)?.dynamicRecipe;
    if (entry.slots || !isPlaceholder || !dyn) return null;
    return recipeService.slotCategories(Object.values(dyn)[0]).join('/');
  });
  const outputs = $derived.by((): ItemPillView[] => {
    const extra = byproductsOf(id);
    if (primaryQtyOf(id) <= 1 && extra.length === 0) return [];
    return [
      { itemId: id, qty: `×${primaryQtyOf(id)}` },
      ...extra.map(([bid, bq]) => ({ itemId: bid, qty: `×${bq}` }))
    ];
  });
</script>

{#each entry.slots ?? [] as s (s.key)}
  {@const sel = picked[s.key] ?? ''}
  <MaterialPick
    any={s.label}
    options={s.options.map((o) => ({ id: o.id, name: o.name, have: amount(o.id) }))}
    value={sel}
    qty={s.quantity}
    have={sel ? amount(sel) : null}
    short={!sel || amount(sel) < s.quantity}
    note={sel ? dishSlotNote(id, s.key, sel) : null}
    onpick={(v) => onpick(s.key, v)}
  />
{/each}
<ItemPills rows pills={rows} />
{#if anyNeed}
  <span class="line neg">any {anyNeed} <b>1</b></span>
{:else if rows.length === 0 && !entry.slots}
  <span class="line">free</span>
{/if}
{#if outputs.length > 0}
  <div class="out"><span>makes</span><ItemPills pills={outputs} /></div>
{/if}

<style>
  .line {
    display: flex;
    justify-content: space-between;
    height: 17px;
    color: var(--text-muted);
  }
  .line b {
    font-weight: normal;
    margin-right: 34px;
  }
  .neg {
    color: var(--neg);
  }
  .out {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 2px;
    color: var(--text-muted);
  }
</style>
