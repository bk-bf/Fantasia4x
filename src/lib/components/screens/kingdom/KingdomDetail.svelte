<script lang="ts">
  import { DISPOSITION_TONE } from '$lib/components/util/dispositionTone';
  import type { Culture, Kingdom, KingdomRelation } from '$lib/game/core/types';
  import { COLONY_RELATION_ID } from '$lib/game/core/types';
  import { knowledgeTier, WEALTH_BAND_LABEL } from '$lib/game/core/gen/kingdom';
  import { kingdomService } from '$lib/game/services/KingdomService';
  import PanelTitle from '$lib/components/UI/widget/PanelTitle.svelte';
  import Well from '$lib/components/UI/widget/Well.svelte';
  import KvRow from '$lib/components/UI/widget/KvRow.svelte';
  import MeterRow from '$lib/components/UI/widget/MeterRow.svelte';

  let {
    kingdom,
    knownKingdoms,
    relations,
    cultures,
    turn
  }: {
    kingdom: Kingdom;
    knownKingdoms: Kingdom[];
    relations: KingdomRelation[];
    cultures: Culture[];
    turn: number;
  } = $props();

  const tier = $derived(knowledgeTier(kingdom.knowledge));
  const stale = $derived(kingdomService.isKnowledgeStale(kingdom, turn));
  const known = $derived(kingdom.known);

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const settlementsLabel = $derived.by(() => {
    const s = kingdom.lore.settlements;
    if (s.towns === 0 && s.villages <= 1) return 'a single settlement';
    const parts = [
      s.towns > 0 ? plural(s.towns, 'town', 'towns') : null,
      s.villages > 0 ? plural(s.villages, 'village', 'villages') : null
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'no holdings to speak of';
  });

  const cultureName = (id: string) =>
    cultures.find((c) => c.id === id)?.discovered
      ? (cultures.find((c) => c.id === id)?.name ?? 'an unfamiliar people')
      : 'an unfamiliar people';

  const colonyRel = $derived(
    relations.find(
      (r) =>
        (r.a === COLONY_RELATION_ID && r.b === kingdom.id) ||
        (r.b === COLONY_RELATION_ID && r.a === kingdom.id)
    )
  );
  const otherRels = $derived(
    relations
      .filter(
        (r) =>
          (r.a === kingdom.id || r.b === kingdom.id) &&
          r.a !== COLONY_RELATION_ID &&
          r.b !== COLONY_RELATION_ID
      )
      .map((r) => ({
        other: knownKingdoms.find((k) => k.id === (r.a === kingdom.id ? r.b : r.a)),
        rel: r
      }))
      .filter((v) => v.other && v.other.discovered)
      .sort((a, b) => b.rel.score - a.rel.score)
  );
</script>

<PanelTitle
  >{kingdom.name}{#if colonyRel}<em style:color={DISPOSITION_TONE[colonyRel.disposition]}
      >{colonyRel.disposition}</em
    >{/if}</PanelTitle
>
<p class="lore">
  {kingdom.lore.epithet}; {kingdom.lore.temperament}.
  <i
    >{#if kingdom.knownVia}remembered by {kingdom.knownVia}{#if stale}, out of date{/if}{:else}known
      through contact{/if}.</i
  >
</p>

<div class="g2">
  <Well title="Peoples">
    {#each kingdom.cultureMix as share (share.cultureId)}
      <MeterRow wide label={cultureName(share.cultureId)} value={share.weight}>
        {Math.round(share.weight * 100)}%
      </MeterRow>
    {/each}
  </Well>

  <Well title="Court & coffers">
    {#if tier >= 1 && known}
      <KvRow label="Ruler" muted={stale}>{known.leaderName}</KvRow>
      <KvRow label="Wealth" muted={stale}>{WEALTH_BAND_LABEL[known.wealthBand]}</KvRow>
      {#if stale}<p class="it">as last you knew, word may be out of date</p>{/if}
    {:else}
      <p class="it">Who rules, and how deep the coffers run, unknown.</p>
    {/if}
  </Well>

  <Well title="Lands">
    {#if tier >= 2}
      <KvRow label="Seat">{kingdom.lore.capitalName}</KvRow>
      <KvRow label="Holdings">{settlementsLabel}</KvRow>
    {:else}
      <p class="it">Their seat and holdings, unknown.</p>
    {/if}
  </Well>

  {#if otherRels.length > 0}
    <Well title="Standing">
      {#each otherRels as { other, rel } (other!.id)}
        <KvRow label={other!.name}>
          <span style:color={DISPOSITION_TONE[rel.disposition]}>{rel.disposition}</span>
        </KvRow>
      {/each}
    </Well>
  {/if}

  <Well title="Chronicle">
    {#if tier >= 3}
      {#if kingdom.lore.history.length === 0 && kingdom.lore.figures.length === 0}
        <p class="it">A quiet place, with little of note remembered.</p>
      {:else}
        {#each kingdom.lore.history as line, i (i)}
          <p class="line">{line}</p>
        {/each}
        {#if kingdom.lore.figures.length > 0}
          <h5>Notable figures</h5>
          {#each kingdom.lore.figures as fig, i (i)}
            <p class="line">{fig}</p>
          {/each}
        {/if}
      {/if}
    {:else}
      <p class="it">Their past, and the names that shaped it, unknown.</p>
    {/if}
  </Well>

  <Well title="Famed works">
    {#if tier >= 4 && known}
      {#if known.famedItems.created.length === 0 && known.famedItems.held.length === 0}
        <p class="it">Nothing famed to its name.</p>
      {:else}
        <div class:stale>
          {#if known.famedItems.created.length > 0}
            <h5>Forged by their hands</h5>
            {#each known.famedItems.created as item, i (i)}
              <p class="line">{item}</p>
            {/each}
          {/if}
          {#if known.famedItems.held.length > 0}
            <h5>Held in their vaults</h5>
            {#each known.famedItems.held as item, i (i)}
              <p class="line">{item}</p>
            {/each}
          {/if}
        </div>
        {#if stale}<p class="it">as last you knew, treasures change hands</p>{/if}
      {/if}
    {:else}
      <p class="it">What treasures they forge and hoard, unknown.</p>
    {/if}
  </Well>
</div>

<style>
  .lore i {
    font-style: normal;
    color: var(--text-muted);
  }
  p {
    margin: 0;
  }
  .line {
    color: var(--text-dim);
    margin-bottom: 3px;
  }
  .it {
    color: var(--text-muted);
  }
  .stale .line {
    color: var(--text-muted);
  }
</style>
