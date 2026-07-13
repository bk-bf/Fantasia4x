<!--
  KingdomDetail.svelte — detail pane of the Kingdoms pokédex (KINGDOMS-TRADE §2).
  Renders only the lore tiers the colony has EARNED (hidden knowledge xp); locked tiers show as
  teasers. Mutable facets (leader/wealth/famed items) render from the known-facts snapshot and grey
  out once contact goes stale ("as last you knew") — immutable tiers don't rot.
-->
<script lang="ts">
  import type { Culture, Kingdom, KingdomRelation } from '$lib/game/core/types';
  import { COLONY_RELATION_ID } from '$lib/game/core/types';
  import { knowledgeTier, WEALTH_BAND_LABEL } from '$lib/game/core/Kingdom';
  import { kingdomService } from '$lib/game/services/KingdomService';

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

  const DISPOSITION_COLOR: Record<KingdomRelation['disposition'], string> = {
    allied: 'var(--pos)',
    friendly: 'var(--accent-hi)',
    neutral: 'var(--text-dim)',
    wary: 'var(--text-muted)',
    hostile: 'var(--neg)'
  };

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
      .filter((r) => (r.a === kingdom.id || r.b === kingdom.id) && r.a !== COLONY_RELATION_ID && r.b !== COLONY_RELATION_ID)
      .map((r) => ({
        other: knownKingdoms.find((k) => k.id === (r.a === kingdom.id ? r.b : r.a)),
        rel: r
      }))
      .filter((v) => v.other && v.other.discovered)
      .sort((a, b) => b.rel.score - a.rel.score)
  );
</script>

<div class="detail">
  <!-- Tier 0 — first contact -->
  <div class="hdr-row">
    <h2 class="k-name">{kingdom.name}</h2>
    {#if colonyRel}
      <span class="disp" style="color: {DISPOSITION_COLOR[colonyRel.disposition]}">
        {colonyRel.disposition}
      </span>
    {/if}
  </div>
  <p class="epithet">{kingdom.lore.epithet}</p>
  <p class="temperament">{kingdom.lore.temperament}</p>
  <p class="known-via">
    {#if kingdom.knownVia}remembered by {kingdom.knownVia}{#if stale}, out of date{/if}{:else}known
      through contact{/if}
  </p>

  <div class="section">
    <div class="sec-hdr">| PEOPLES</div>
    {#each kingdom.cultureMix as share}
      <div class="mix-row">
        <span class="mix-name">{cultureName(share.cultureId)}</span>
        <span class="mix-bar">{'█'.repeat(Math.max(1, Math.round(share.weight * 10)))}{'░'.repeat(
            10 - Math.max(1, Math.round(share.weight * 10))
          )}</span>
      </div>
    {/each}
  </div>

  <!-- Tier 1 — leader & wealth (mutable → known snapshot, greys when stale) -->
  <div class="section">
    <div class="sec-hdr">| COURT & COFFERS</div>
    {#if tier >= 1 && known}
      <div class="kv" class:stale>
        <span class="k">Ruler</span>
        <span class="v">{known.leaderName}</span>
      </div>
      <div class="kv" class:stale>
        <span class="k">Wealth</span>
        <span class="v">{WEALTH_BAND_LABEL[known.wealthBand]}</span>
      </div>
      {#if stale}<div class="stale-note">as last you knew, word may be out of date</div>{/if}
    {:else}
      <div class="teaser">Who rules, and how deep the coffers run, unknown.</div>
    {/if}
  </div>

  <!-- Tier 2 — seat & settlements (immutable) -->
  <div class="section">
    <div class="sec-hdr">| LANDS</div>
    {#if tier >= 2}
      <div class="kv"><span class="k">Seat</span><span class="v">{kingdom.lore.capitalName}</span></div>
      <div class="kv">
        <span class="k">Holdings</span>
        <span class="v">{settlementsLabel}</span>
      </div>
    {:else}
      <div class="teaser">Their seat and holdings, unknown.</div>
    {/if}
  </div>

  <!-- Tier 3 — history & figures (immutable). A small place has little of either. -->
  <div class="section">
    <div class="sec-hdr">| CHRONICLE</div>
    {#if tier >= 3}
      {#if kingdom.lore.history.length === 0 && kingdom.lore.figures.length === 0}
        <p class="lore-line muted">A quiet place, with little of note remembered.</p>
      {:else}
        {#each kingdom.lore.history as line}
          <p class="lore-line">{line}</p>
        {/each}
        {#if kingdom.lore.figures.length > 0}
          <div class="sub-hdr">Notable figures</div>
          {#each kingdom.lore.figures as fig}
            <p class="lore-line">{fig}</p>
          {/each}
        {/if}
      {/if}
    {:else}
      <div class="teaser">Their past, and the names that shaped it, unknown.</div>
    {/if}
  </div>

  <!-- Tier 4 — famed items (mutable → known snapshot, greys when stale). A hamlet has none. -->
  <div class="section">
    <div class="sec-hdr">| FAMED WORKS</div>
    {#if tier >= 4 && known}
      {#if known.famedItems.created.length === 0 && known.famedItems.held.length === 0}
        <p class="lore-line muted">Nothing famed to its name.</p>
      {:else}
        <div class:stale>
          {#if known.famedItems.created.length > 0}
            <div class="sub-hdr">Forged by their hands</div>
            {#each known.famedItems.created as item}
              <p class="lore-line">{item}</p>
            {/each}
          {/if}
          {#if known.famedItems.held.length > 0}
            <div class="sub-hdr">Held in their vaults</div>
            {#each known.famedItems.held as item}
              <p class="lore-line">{item}</p>
            {/each}
          {/if}
        </div>
        {#if stale}<div class="stale-note">as last you knew, treasures change hands</div>{/if}
      {/if}
    {:else}
      <div class="teaser">What treasures they forge and hoard, unknown.</div>
    {/if}
  </div>

  {#if otherRels.length > 0}
    <div class="section">
      <div class="sec-hdr">| STANDING AMONG KINGDOMS</div>
      {#each otherRels as { other, rel }}
        <div class="kv">
          <span class="k">{other!.name}</span>
          <span class="v" style="color: {DISPOSITION_COLOR[rel.disposition]}">{rel.disposition}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .detail {
    padding: 10px 14px 20px;
  }
  .hdr-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .k-name {
    color: var(--accent-hi);
    font-size: 15px;
    letter-spacing: 0.06em;
    margin: 0;
  }
  .disp {
    font-size: 11px;
    letter-spacing: 0.08em;
  }
  .epithet {
    color: var(--text-dim);
    font-style: italic;
    font-size: 12px;
    margin: 4px 0 0;
  }
  .temperament {
    color: var(--text-muted);
    font-size: 11px;
    margin: 2px 0 0;
  }
  .known-via {
    color: var(--text-muted);
    font-size: 10px;
    letter-spacing: 0.03em;
    margin: 5px 0 0;
  }
  .section {
    margin-top: 12px;
  }
  .sec-hdr {
    color: var(--accent);
    letter-spacing: 0.08em;
    font-size: 11px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 2px;
    margin-bottom: 5px;
  }
  .sub-hdr {
    color: var(--text-muted);
    font-size: 10px;
    letter-spacing: 0.06em;
    margin: 5px 0 2px;
  }
  .mix-row,
  .kv {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 1px 0;
  }
  .mix-name,
  .k {
    color: var(--text-dim);
  }
  .mix-bar,
  .v {
    color: var(--text);
  }
  .lore-line {
    color: var(--text-dim);
    font-size: 11px;
    line-height: 1.5;
    margin: 0 0 4px;
  }
  .lore-line.muted {
    color: var(--text-muted);
    font-style: italic;
  }
  .teaser {
    color: var(--text-muted);
    font-style: italic;
    font-size: 11px;
  }
  .stale,
  .stale .v,
  .stale .k {
    color: var(--text-muted);
    opacity: 0.75;
  }
  .stale-note {
    color: var(--text-muted);
    font-size: 10px;
    font-style: italic;
    margin-top: 3px;
  }
</style>
