<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import BuildCard from '$lib/components/UI/hud/BuildCard.svelte';
  import ItemPills, { type ItemPillView } from '$lib/components/UI/widget/ItemPills.svelte';
  import { itemService } from '$lib/game/services/ItemService';
  import RecipeCost from './RecipeCost.svelte';
  import {
    costOf,
    jobLabelOf,
    recipeOf,
    requiredToolOf,
    stationNameOf,
    type CraftEntry
  } from './craftData';

  let {
    entry,
    picked,
    onpick
  }: {
    entry: CraftEntry;
    picked: Record<string, string>;
    onpick: (slotKey: string, ingredientId: string) => void;
  } = $props();

  const gs = $derived($gameState);
  const stock = $derived(gs?.stockpile ?? {});
  const amount = (id: string): number => stock[id] || 0;

  const item = $derived(entry.item);
  const recipe = $derived(recipeOf(item.id));
  const toolReq = $derived(requiredToolOf(item.id, gs));
  const toolReqMet = $derived(toolReq?.met ?? true);
  const isCarcass = $derived(item.category === 'carcass');
  const isPlaceholder = $derived(!!recipe?.dynamicRecipe && !entry.selectedIngredients);
  const cost = $derived(isCarcass ? {} : { ...costOf(item.id), ...entry.dynamicCost });
  const stationReady = $derived(
    !!gs &&
      itemService.hasRequiredBuilding(item.id, gs) &&
      itemService.hasRequiredTools(item.id, gs)
  );
  const affordable = $derived(
    isCarcass
      ? amount(item.id) > 0
      : !isPlaceholder && Object.entries(cost).every(([id, n]) => amount(id) >= n)
  );
  const craftable = $derived(
    toolReqMet &&
      (isCarcass ? !!gs && itemService.canCraftItem(item.id, gs) : stationReady && affordable)
  );
  const canQueue = $derived(!!gs && itemService.canQueueCraft(item.id, gs) && toolReqMet);
  const useQty = $derived(!isCarcass && !isPlaceholder);
  const intact = $derived(gs?._carcassCondition?.[item.id] ?? 100);

  const verdict = $derived.by((): ['ok' | 'pending' | 'missing' | 'blocked', string] => {
    if (useQty)
      return !canQueue
        ? ['blocked', 'Blocked']
        : affordable
          ? ['ok', 'Craft']
          : ['pending', 'Queue'];
    if (!affordable) return ['missing', 'Short of stock'];
    if (!craftable) return ['blocked', 'Blocked'];
    return ['ok', isCarcass ? 'Butcher' : 'Craft'];
  });

  const yields = $derived.by((): ItemPillView[] => {
    if (!isCarcass || !gs) return [];
    const r = itemService.resolveCarcassRecipe(item.id, gs);
    return Object.entries(r?.outputs ?? {}).map(([itemId, qty]) => ({
      itemId,
      qty: `${Math.max(1, Math.round(((qty as number) * intact) / 100))}`
    }));
  });

  function craft(quantity = 1) {
    if (!gs) return;
    gameState.command({
      type: 'craftItem',
      payload: { itemId: item.id, quantity, selectedIngredients: entry.selectedIngredients },
      save: true
    });
  }
</script>

<BuildCard
  name={entry.name}
  charSpans={item.charSpans}
  description={entry.description}
  statItem={item}
  statRecipe={recipe}
  statIngredients={entry.slots ? picked : (entry.selectedIngredients ?? {})}
  jobLabel={jobLabelOf(item)}
  workAmount={recipe?.workAmount ?? null}
  station={stationNameOf(item.id)}
  toolTier={recipe?.toolTierRequired ?? null}
  toolMet={!!gs && itemService.hasRequiredTools(item.id, gs)}
  requiredTool={toolReq?.name ?? null}
  requiredToolMet={toolReqMet}
  badge={isCarcass ? `${Math.round(intact)}%` : null}
  actionLabel={verdict[1]}
  actionEnabled={useQty ? canQueue : craftable}
  variant={verdict[0]}
  quantities={useQty ? [3, 5, 10] : null}
  onQuantity={useQty ? (n) => craft(n) : null}
  onAction={() => craft()}
>
  {#if isCarcass}
    <ItemPills rows pills={yields} />
  {:else}
    <RecipeCost {entry} {cost} {isPlaceholder} {picked} {onpick} />
  {/if}
</BuildCard>
