<script lang="ts">
  import type { Snippet } from 'svelte';
  import { chrome } from '$lib/pixelArt/chrome';
  import SpriteIcon from '../widget/SpriteIcon.svelte';
  import PixelGlyph from '../widget/PixelGlyph.svelte';
  import ChromeButton from '../widget/ChromeButton.svelte';
  import HoverTip from '../tooltip/HoverTip.svelte';
  import ScrollArea from '../widget/ScrollArea.svelte';
  import ItemStatTooltip from '../tooltip/ItemStatTooltip.svelte';
  import BuildingStatTooltip from '../tooltip/BuildingStatTooltip.svelte';
  import type { GlyphName } from '$lib/pixelArt/glyphs';
  import type { Item, Recipe, Building } from '$lib/game/core/types';

  type CharSpan = { sheet?: string; id?: number; from?: number; to?: number; literal?: string };

  let {
    name,
    charSpans = undefined,
    glyph = null,
    description = null,
    badge = null,
    workAmount = null,
    station = null,
    toolTier = null,
    toolMet = true,
    requiredTool = null,
    requiredToolMet = true,
    actionLabel,
    actionGlyph,
    actionEnabled = true,
    variant = 'ok',
    onAction,
    quantities = null,
    onQuantity = null,
    statItem = null,
    statRecipe = null,
    statIngredients = {},
    buildingDef = null,
    statMaterials = {},
    jobLabel = null,
    children
  }: {
    name: string;
    charSpans?: CharSpan[];
    glyph?: GlyphName | null;
    description?: string | null;
    badge?: string | null;
    workAmount?: number | null;
    station?: string | null;
    toolTier?: number | null;
    toolMet?: boolean;
    requiredTool?: string | null;
    requiredToolMet?: boolean;
    actionLabel: string;
    actionGlyph?: GlyphName;
    actionEnabled?: boolean;
    variant?: 'ok' | 'missing' | 'blocked' | 'pending';
    onAction: () => void;
    quantities?: number[] | null;
    onQuantity?: ((n: number) => void) | null;
    statItem?: Item | null;
    statRecipe?: Recipe | null;
    statIngredients?: Record<string, string>;
    buildingDef?: Building | null;
    statMaterials?: Record<string, string>;
    jobLabel?: string | null;
    children?: Snippet;
  } = $props();

  let descTip = $state<{ x: number; y: number } | null>(null);
  let itemTip = $state<{ x: number; y: number } | null>(null);
  let below = $state<{ x: number; y: number } | null>(null);

  const hasItemStats = $derived(
    !!statItem &&
      (!!statItem.weaponProperties ||
        !!statItem.armorProperties ||
        (statItem.type === 'tool' && !!statItem.toolBoost) ||
        statItem.nutrition != null ||
        statItem.medicineQuality != null ||
        statItem.decaySeconds != null ||
        Object.keys(statItem.effects ?? {}).length > 0)
  );
  const showItemTip = $derived(!!statItem && (hasItemStats || !!jobLabel));
  const short = $derived(variant === 'missing' || variant === 'blocked');
  const lines = $derived(station || toolTier || requiredTool ? 2 : 3);

  function enterCard(e: MouseEvent) {
    if (!buildingDef) return;
    const card = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const win = (e.currentTarget as HTMLElement).closest('[data-window]')?.getBoundingClientRect();
    below = { x: card.left, y: (win?.bottom ?? card.bottom) + 6 };
  }
  function enterDesc(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    if (!buildingDef && el.scrollHeight > el.clientHeight + 1)
      descTip = { x: e.clientX, y: e.clientY };
  }
</script>

<article
  class="bcard"
  class:short
  class:hover={!!below}
  onmouseenter={enterCard}
  onmouseleave={() => (below = null)}
  {@attach chrome('well')}
>
  <header
    role="group"
    style:cursor={showItemTip ? 'help' : null}
    onmouseenter={(e) => showItemTip && (itemTip = { x: e.clientX, y: e.clientY })}
    onmousemove={(e) => itemTip && (itemTip = { x: e.clientX, y: e.clientY })}
    onmouseleave={() => (itemTip = null)}
  >
    {#if buildingDef}
      <span class="bspr"><SpriteIcon {charSpans} building={buildingDef.id} px={40} /></span>
    {:else if glyph}
      <span class="gly"><PixelGlyph name={glyph} ramp="honey" /></span>
    {:else}
      <span class="sq" {@attach chrome('well')}>
        <SpriteIcon {charSpans} item={statItem?.id} px={34} />
      </span>
    {/if}
    <div class="ttl">
      <h5>{name}</h5>
      {#if workAmount != null}
        <span class="work"><PixelGlyph name="hammer" />{workAmount}</span>
      {/if}
    </div>
    {#if badge}<span class="badge">{badge}</span>{/if}
  </header>
  {#if description}
    <p
      style="-webkit-line-clamp:{lines};height:{lines * 16}px;flex:none"
      onmouseenter={enterDesc}
      onmousemove={(e) => descTip && (descTip = { x: e.clientX, y: e.clientY })}
      onmouseleave={() => (descTip = null)}
    >
      {description}
    </p>
  {/if}
  {#if station}<div class="at"><PixelGlyph name="flag" /><span>{station}</span></div>{/if}
  {#if toolTier}
    <div class="at" class:neg={!toolMet}>
      <PixelGlyph name="axe" /><span>tier {toolTier} tools{toolMet ? '' : ' (locked)'}</span>
    </div>
  {/if}
  {#if requiredTool}
    <div class="at" class:neg={!requiredToolMet}>
      <PixelGlyph name="axe" /><span>needs {requiredTool}{requiredToolMet ? '' : ' (none)'}</span>
    </div>
  {/if}
  <ScrollArea class="cost">{@render children?.()}</ScrollArea>
  <div class="acts">
    <ChromeButton
      class="main {variant}"
      kind={short ? 'btnOff' : 'btn'}
      glyph={actionGlyph}
      disabled={!actionEnabled}
      onclick={onAction}>{actionLabel}</ChromeButton
    >
    {#if quantities && onQuantity && actionEnabled}
      {#each quantities as q (q)}
        <ChromeButton class="plus" title="queue {q}" onclick={() => onQuantity?.(q)}
          >+{q}</ChromeButton
        >
      {/each}
    {/if}
  </div>
</article>

{#if descTip && description}
  <HoverTip x={descTip.x} y={descTip.y}>{description}</HoverTip>
{/if}

{#if below && buildingDef}
  <BuildingStatTooltip building={buildingDef} materials={statMaterials} {...below} anchored />
{:else if itemTip && showItemTip && statItem}
  <ItemStatTooltip
    item={statItem}
    recipe={statRecipe}
    selectedIngredients={statIngredients}
    {jobLabel}
    x={itemTip.x}
    y={itemTip.y}
  />
{/if}

<style>
  .bcard {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding: 7px 9px 8px;
    font: 16px/16px var(--font-pixel);
  }
  .bcard.hover {
    outline: 1px solid var(--accent-hi);
    outline-offset: 1px;
  }
  header {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .bspr {
    flex: none;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: end center;
  }
  .sq {
    flex: none;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
  }
  .gly {
    flex: none;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
  }
  .gly :global(.glyph),
  .gly :global(img) {
    width: 26px !important;
    height: 26px !important;
  }
  .ttl {
    flex: 1;
    min-width: 0;
  }
  h5 {
    margin: 0;
    color: var(--text);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
  }
  .short h5 {
    color: var(--text-dim);
  }
  .work {
    display: inline-flex;
    gap: 5px;
    align-items: center;
    color: var(--text-muted);
  }
  .badge {
    align-self: flex-start;
    color: var(--accent-hi);
  }
  p {
    margin: 0;
    color: var(--text-dim);
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
  }
  .at {
    display: flex;
    gap: 5px;
    align-items: center;
    height: 17px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
  }
  .at.neg {
    color: var(--neg);
  }
  .bcard :global(.scroll-area.cost) {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    scrollbar-gutter: auto;
    color: var(--text-dim);
  }
  .acts {
    display: flex;
    gap: 2px;
    margin-top: auto;
    padding-top: 3px;
  }
  .acts :global(.main) {
    flex: 1;
  }
  .acts :global(.plus) {
    padding: 0 5px;
  }
  .acts :global(.missing),
  .acts :global(.blocked) {
    color: var(--text-muted);
  }
</style>
