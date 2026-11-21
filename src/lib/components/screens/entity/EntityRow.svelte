<script lang="ts">
  import type { Mob } from '$lib/game/core/types';
  import { getCreatureById } from '$lib/game/core/defs/creatures';
  import { uiState } from '$lib/stores/uiState';
  import { chrome } from '$lib/pixelArt/chrome';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import SpriteIcon from '$lib/components/UI/widget/SpriteIcon.svelte';
  import EntityLimbs from './EntityLimbs.svelte';
  import { bloodPct, bloodTone, healthTone, painPct, painTone, worstLimb } from './entityHealth';

  let { mob, expanded, ontoggle }: { mob: Mob; expanded: boolean; ontoggle: () => void } = $props();

  const def = $derived(getCreatureById(mob.creatureId));
  const hostile = $derived(mob.entityClass === 'mob');
  const bp = $derived(bloodPct(mob));
  const wl = $derived(worstLimb(mob));
  const pp = $derived(painPct(mob));
  const following = $derived($uiState.cameraFollowMobId === mob.id);

  const tone = (c: string | null) => (expanded ? null : c);

  const rgb = (c: [number, number, number]) =>
    `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;

  function focus() {
    uiState.focusMapOn(mob.x, mob.y, false);
    uiState.selectMob(mob.id);
  }
</script>

{#snippet line()}
  <button class="exp" onclick={ontoggle} title="health details">{expanded ? '▾' : '▸'}</button>
  <button class="cells" onclick={focus} title="jump camera to entity">
    <span class="thing">
      <SpriteIcon creature={mob.creatureId} px={18}>
        {#snippet fallback()}
          <i style:color={def ? rgb(def.fg) : 'var(--text-dim)'}>{hostile ? '✦' : '◆'}</i>
        {/snippet}
      </SpriteIcon>
    </span>
    <span class="name" class:hostile>{def?.name ?? mob.creatureId}</span>
    <em>{hostile ? 'hostile' : 'neutral'}</em>
    <b style:color={tone(bloodTone(bp))}>{bp}%</b>
    <em style:color={tone(wl ? healthTone(wl.health) : null)}
      >{wl ? `${wl.name} ${Math.round(wl.health)}%` : '—'}</em
    >
    <b style:color={tone(painTone(pp))}>{pp}%</b>
    <em>{mob.state}</em>
    <em>({mob.x},{mob.y})</em>
  </button>
{/snippet}

{#if expanded}
  <div class="tr on" {@attach chrome('cellOn')}>{@render line()}</div>
  <div class="expand">
    <ChromeButton
      glyph="eye"
      on={following}
      onclick={() => uiState.setFollowMob(following ? null : mob.id)}
      >{following ? 'Unfollow' : 'Follow'}</ChromeButton
    >
    {#if mob.limbs && mob.limbs.length > 0}<EntityLimbs limbs={mob.limbs} />{/if}
  </div>
{:else}
  <div class="tr">{@render line()}</div>
{/if}

<style>
  .tr {
    display: flex;
    align-items: stretch;
    height: 22px;
  }
  .exp,
  .cells {
    border: 0;
    background: none;
    color: var(--text-dim);
    font: inherit;
    letter-spacing: inherit;
    cursor: pointer;
  }
  .exp {
    flex: none;
    width: 16px;
    padding: 0;
    color: var(--text-muted);
  }
  .cells {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: var(--entity-cols);
    align-items: center;
    gap: 6px;
    padding: 0 6px 0 0;
    text-align: left;
    white-space: nowrap;
  }
  .cells > * {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tr:not(.on) .cells:hover {
    box-shadow: inset 0 0 0 1px var(--accent-hi);
  }
  .thing {
    display: grid;
    place-items: center;
    height: 20px;
  }
  .thing i,
  em {
    font-style: normal;
  }
  b {
    font-weight: normal;
    font-variant-numeric: tabular-nums;
  }
  .name {
    color: var(--text);
  }
  .name.hostile {
    color: var(--neg);
  }
  .on .exp,
  .on .cells,
  .on .name {
    color: var(--ember);
  }
  .expand {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    padding: 6px 10px 8px 46px;
  }
</style>
