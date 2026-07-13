<script lang="ts">
  import type { Culture, CultureRelation } from '$lib/game/core/types';
  import StatBar from '$lib/components/UI/StatBar.svelte';
  import TraitCards from '$lib/components/pawn/TraitCards.svelte';

  export let culture: Culture;
  export let knownCultures: Culture[];
  export let relations: CultureRelation[];
  export let headcount = 0;

  const STAT_ORDER = [
    'strength',
    'dexterity',
    'constitution',
    'intelligence',
    'perception',
    'charisma'
  ];

  // Sum of cultural-trait stat bonuses for a given stat (so the screen can show the effective
  // range a pawn actually rolls into). Mirrors applyCulturalTraitBonuses' summation.
  function traitStatBonus(r: Culture, stat: string): number {
    let b = 0;
    // Only GUARANTEED identity traits shift the culture's baseline every member shares; pool traits are
    // per-pawn variety, so they don't move the culture-wide stat range shown here.
    for (const t of r.guaranteedTraits) {
      b += (t.effects as Record<string, number>)[`${stat}Bonus`] ?? 0;
      b -= (t.effects as Record<string, number>)[`${stat}Penalty`] ?? 0;
    }
    return b;
  }

  function statColor(avg: number): string {
    if (avg >= 15) return '#4CAF50';
    if (avg >= 12) return '#FFA726';
    return '#9E9E9E';
  }

  const DISPOSITION_COLOR: Record<CultureRelation['disposition'], string> = {
    allied: '#4CAF50',
    friendly: '#8BC34A',
    neutral: '#9E9E9E',
    wary: '#FFA726',
    hostile: '#E53935'
  };

  // Relations from this culture to OTHER known cultures (never reveal undiscovered ones).
  $: relViews = relations
    .filter((rel) => rel.a === culture.id || rel.b === culture.id)
    .map((rel) => {
      const otherId = rel.a === culture.id ? rel.b : rel.a;
      const other = knownCultures.find((r) => r.id === otherId);
      return other ? { other, score: rel.score, disposition: rel.disposition } : null;
    })
    .filter(
      (v): v is { other: Culture; score: number; disposition: CultureRelation['disposition'] } => !!v
    )
    .sort((a, b) => b.score - a.score);
</script>

<div class="detail">
  <!-- Lore -->
  <div class="section-hdr">| {culture.name.toUpperCase()} — {culture.lore.epithet}</div>
  <p class="lore-desc">{culture.lore.description}</p>
  <div class="row"><span class="lbl">ARCHETYPE</span><span class="val">{culture.archetype}</span></div>
  <div class="row"><span class="lbl">COLONY</span><span class="val">{headcount} living</span></div>
  {#if culture.discoveredVia}
    <div class="row">
      <span class="lbl">KNOWN VIA</span><span class="val">{culture.discoveredVia}</span>
    </div>
  {/if}
  <div class="row">
    <span class="lbl">HOMELAND</span><span class="val">{culture.lore.homeland}</span>
  </div>
  <div class="row">
    <span class="lbl">TEMPERAMENT</span><span class="val">{culture.lore.temperament}</span>
  </div>
  <div class="row">
    <span class="lbl">BELIEF</span><span class="val small">{culture.lore.belief}</span>
  </div>

  <!-- Physique ranges -->
  <div class="section-hdr">| PHYSIQUE <span class="hint">(rolled per pawn)</span></div>
  <div class="row">
    <span class="lbl">BUILD</span><span class="val">{culture.physicalTraits.size}</span>
  </div>
  <div class="row">
    <span class="lbl">HEIGHT</span>
    <span class="val"
      >{culture.physicalTraits.heightRange[0]}–{culture.physicalTraits.heightRange[1]} cm</span
    >
  </div>
  <div class="row">
    <span class="lbl">WEIGHT</span>
    <span class="val"
      >{culture.physicalTraits.weightRange[0]}–{culture.physicalTraits.weightRange[1]} kg</span
    >
  </div>

  <!-- Stat ranges + trait boosts -->
  <div class="section-hdr">| STATS <span class="hint">(each pawn rolls in range)</span></div>
  {#each STAT_ORDER as stat}
    {#if culture.statRanges[stat]}
      {@const range = culture.statRanges[stat]}
      {@const bonus = traitStatBonus(culture, stat)}
      {@const effMax = range[1] + bonus}
      {@const avg = (range[0] + range[1]) / 2 + bonus}
      <StatBar
        label={stat.slice(0, 3).toUpperCase()}
        value={effMax}
        max={22}
        color={statColor(avg)}
        valueText={bonus !== 0
          ? `${range[0]}–${range[1]} (${bonus > 0 ? '+' : ''}${bonus} → ${range[0] + bonus}–${effMax})`
          : `${range[0]}–${range[1]}`}
      />
    {/if}
  {/each}

  <!-- Traits: guaranteed identity every member shares, then the pool pawns may individually draw.
       Rendered by the SHARED TraitCards grid (same component the pawn status tab uses). -->
  <div class="section-hdr">
    | TRAITS ({culture.guaranteedTraits.length} identity + {culture.culturalTraitPool.length} possible)
  </div>
  <TraitCards
    traits={[...culture.guaranteedTraits, ...culture.culturalTraitPool]}
    guaranteedCount={culture.guaranteedTraits.length}
  />

  <!-- Relations -->
  {#if relViews.length > 0}
    <div class="section-hdr">| RELATIONS</div>
    {#each relViews as rv}
      <div class="row">
        <span class="lbl rel-name">{rv.other.name}</span>
        <span class="val" style="color: {DISPOSITION_COLOR[rv.disposition]}"
          >{rv.disposition} ({rv.score > 0 ? '+' : ''}{rv.score})</span
        >
      </div>
    {/each}
  {/if}
</div>

<style>
  .detail {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text);
  }
  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    margin-top: 1px;
  }
  .hint {
    color: var(--text-muted);
    font-style: italic;
    letter-spacing: 0;
  }
  .lore-desc {
    padding: 8px 10px;
    margin: 0;
    color: var(--text);
    line-height: 1.55;
    font-style: italic;
    border-bottom: 1px solid var(--border);
  }
  .row {
    display: flex;
    padding: 2px 8px;
    align-items: baseline;
    gap: 6px;
  }
  .row:hover {
    background: var(--bg-hover);
  }
  .lbl {
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    width: 110px;
    flex-shrink: 0;
  }
  .rel-name {
    text-transform: none;
    color: var(--text);
  }
  .val {
    margin-left: auto;
    text-align: right;
  }
  .val.small {
    font-style: italic;
    color: var(--text-muted);
  }
</style>
