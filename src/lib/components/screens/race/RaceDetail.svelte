<script lang="ts">
  import type { Race, RaceRelation } from '$lib/game/core/types';
  import { workAxisLabel } from '$lib/utils/pawnUtils';
  import StatBar from '$lib/components/UI/StatBar.svelte';

  export let race: Race;
  export let knownRaces: Race[];
  export let relations: RaceRelation[];
  export let headcount = 0;

  const STAT_ORDER = [
    'strength',
    'dexterity',
    'constitution',
    'intelligence',
    'perception',
    'charisma'
  ];

  // Sum of racial-trait stat bonuses for a given stat (so the screen can show the effective
  // range a pawn actually rolls into). Mirrors applyRacialTraitBonuses' summation.
  function traitStatBonus(r: Race, stat: string): number {
    let b = 0;
    for (const t of r.racialTraits) {
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

  const DISPOSITION_COLOR: Record<RaceRelation['disposition'], string> = {
    allied: '#4CAF50',
    friendly: '#8BC34A',
    neutral: '#9E9E9E',
    wary: '#FFA726',
    hostile: '#E53935'
  };

  // Relations from this race to OTHER known races (never reveal undiscovered ones).
  $: relViews = relations
    .filter((rel) => rel.a === race.id || rel.b === race.id)
    .map((rel) => {
      const otherId = rel.a === race.id ? rel.b : rel.a;
      const other = knownRaces.find((r) => r.id === otherId);
      return other ? { other, score: rel.score, disposition: rel.disposition } : null;
    })
    .filter(
      (v): v is { other: Race; score: number; disposition: RaceRelation['disposition'] } => !!v
    )
    .sort((a, b) => b.score - a.score);

  // Format a single trait effect entry the way the old screen did (kept verbatim).
  function fmtEffect(name: string, value: unknown): string {
    if (typeof value === 'number') {
      if (name.includes('Bonus')) return `+${value} ${name.replace('Bonus', '').toLowerCase()}`;
      if (name.includes('Penalty')) return `-${value} ${name.replace('Penalty', '').toLowerCase()}`;
      if (value > 1) return `+${Math.round((value - 1) * 100)}% ${name}`;
      if (value < 1 && value > 0) return `${Math.round(value * 100)}% ${name}`;
      return `${name}: ${value}`;
    }
    return name;
  }
</script>

<div class="detail">
  <!-- Lore -->
  <div class="section-hdr">| {race.name.toUpperCase()} — {race.lore.epithet}</div>
  <p class="lore-desc">{race.lore.description}</p>
  <div class="row"><span class="lbl">ARCHETYPE</span><span class="val">{race.archetype}</span></div>
  <div class="row"><span class="lbl">COLONY</span><span class="val">{headcount} living</span></div>
  <div class="row">
    <span class="lbl">HOMELAND</span><span class="val">{race.lore.homeland}</span>
  </div>
  <div class="row">
    <span class="lbl">TEMPERAMENT</span><span class="val">{race.lore.temperament}</span>
  </div>
  <div class="row">
    <span class="lbl">BELIEF</span><span class="val small">{race.lore.belief}</span>
  </div>

  <!-- Physique ranges -->
  <div class="section-hdr">| PHYSIQUE <span class="hint">(rolled per pawn)</span></div>
  <div class="row">
    <span class="lbl">BUILD</span><span class="val">{race.physicalTraits.size}</span>
  </div>
  <div class="row">
    <span class="lbl">HEIGHT</span>
    <span class="val"
      >{race.physicalTraits.heightRange[0]}–{race.physicalTraits.heightRange[1]} cm</span
    >
  </div>
  <div class="row">
    <span class="lbl">WEIGHT</span>
    <span class="val"
      >{race.physicalTraits.weightRange[0]}–{race.physicalTraits.weightRange[1]} kg</span
    >
  </div>

  <!-- Stat ranges + trait boosts -->
  <div class="section-hdr">| STATS <span class="hint">(each pawn rolls in range)</span></div>
  {#each STAT_ORDER as stat}
    {#if race.statRanges[stat]}
      {@const range = race.statRanges[stat]}
      {@const bonus = traitStatBonus(race, stat)}
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

  <!-- Traits -->
  <div class="section-hdr">| TRAITS ({race.racialTraits.length})</div>
  {#each race.racialTraits as trait}
    <div class="trait-name">{trait.name.toUpperCase()}</div>
    {#if trait.flavorLine}<div class="flavor">“{trait.flavorLine}”</div>{/if}
    <div class="effects">
      {#each Object.entries(trait.effects) as [name, value]}
        {#if value && typeof value === 'object'}
          {#each Object.entries(value) as [cat, mul]}
            <span class="eff {mul >= 1 ? 'pos' : 'neg'}"
              >{mul >= 1 ? '+' : ''}{Math.round((mul - 1) * 100)}% {cat} {workAxisLabel(name)}</span
            >
          {/each}
        {:else}
          <span class="eff {name.includes('Penalty') ? 'neg' : 'pos'}"
            >{fmtEffect(name, value)}</span
          >
        {/if}
      {/each}
    </div>
  {/each}

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
    font-family: 'Courier New', monospace;
    font-size: 11px;
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
  .trait-name {
    padding: 3px 8px 1px;
    color: var(--accent-hi);
    letter-spacing: 0.04em;
    margin-top: 2px;
  }
  .flavor {
    padding: 0 8px 2px 16px;
    color: var(--text-muted);
    font-style: italic;
  }
  .effects {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    padding: 2px 8px 4px 16px;
    border-bottom: 1px solid var(--border);
  }
  .eff {
    font-size: 10px;
  }
  .pos {
    color: var(--pos);
  }
  .neg {
    color: var(--neg);
  }
</style>
