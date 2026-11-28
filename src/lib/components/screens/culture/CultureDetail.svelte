<script lang="ts">
  import { DISPOSITION_TONE } from '$lib/components/util/dispositionTone';
  import type { Culture, CultureRelation } from '$lib/game/core/types';
  import { CORE_STATS } from '$lib/game/core/types';
  import type { RampName } from '$lib/pixelArt/palette';
  import TraitCards from '$lib/components/pawn/TraitCards.svelte';
  import PanelTitle from '$lib/components/UI/widget/PanelTitle.svelte';
  import Well from '$lib/components/UI/widget/Well.svelte';
  import KvRow from '$lib/components/UI/widget/KvRow.svelte';
  import MeterRow from '$lib/components/UI/widget/MeterRow.svelte';

  let {
    culture,
    knownCultures,
    relations,
    headcount = 0
  }: {
    culture: Culture;
    knownCultures: Culture[];
    relations: CultureRelation[];
    headcount?: number;
  } = $props();

  function traitStatBonus(c: Culture, stat: string): number {
    let b = 0;
    for (const t of c.guaranteedTraits)
      b += (t.effects as Record<string, number>)[`${stat}Bonus`] ?? 0;
    return b;
  }

  const statRamp = (avg: number): RampName => (avg >= 15 ? 'leaf' : avg >= 12 ? 'honey' : 'ember');

  let relViews = $derived(
    relations
      .filter((rel) => rel.a === culture.id || rel.b === culture.id)
      .map((rel) => {
        const otherId = rel.a === culture.id ? rel.b : rel.a;
        const other = knownCultures.find((c) => c.id === otherId);
        return other ? { other, score: rel.score, disposition: rel.disposition } : null;
      })
      .filter((v) => !!v)
      .sort((a, b) => b.score - a.score)
  );

  let body = $derived(culture.physicalTraits);
</script>

<PanelTitle>{culture.name}<em>— {culture.lore.epithet}</em></PanelTitle>
<p class="lore">{culture.lore.description}</p>

<div class="g2">
  <Well title="People">
    <KvRow label="Archetype">{culture.archetype}</KvRow>
    <KvRow label="Colony">{headcount} living</KvRow>
    {#if culture.discoveredVia}<KvRow label="Known via">{culture.discoveredVia}</KvRow>{/if}
    <KvRow label="Homeland">{culture.lore.homeland}</KvRow>
    <KvRow label="Temperament">{culture.lore.temperament}</KvRow>
    <KvRow label="Belief">{culture.lore.belief}</KvRow>
    <h5>Physique</h5>
    <KvRow label="Build">{body.size}</KvRow>
    <KvRow label="Height">{body.heightRange[0]}–{body.heightRange[1]} cm</KvRow>
    <KvRow label="Weight">{body.weightRange[0]}–{body.weightRange[1]} kg</KvRow>
  </Well>

  <Well title="Stats" hint="each born within">
    {#each CORE_STATS as { id: stat, abbr } (stat)}
      {@const range = culture.statRanges[stat]}
      {#if range}
        {@const bonus = traitStatBonus(culture, stat)}
        <MeterRow
          label={abbr}
          value={(range[1] + bonus) / 22}
          ramp={statRamp((range[0] + range[1]) / 2 + bonus)}
          title={bonus ? `${range[0] + bonus}–${range[1] + bonus} with traits` : undefined}
        >
          {range[0]}–{range[1]}{#if bonus}&nbsp;<b class:good={bonus > 0} class:neg={bonus < 0}
              >{bonus > 0 ? '+' : ''}{bonus}</b
            >{/if}
        </MeterRow>
      {/if}
    {/each}
  </Well>
</div>

<Well
  title="Traits"
  hint="{culture.guaranteedTraits.length} shared · {culture.culturalTraitPool.length} possible"
>
  <TraitCards
    traits={[...culture.guaranteedTraits, ...culture.culturalTraitPool]}
    guaranteedCount={culture.guaranteedTraits.length}
  />
</Well>

{#if relViews.length > 0}
  <Well title="Relations">
    {#each relViews as rv (rv.other.id)}
      <KvRow label={rv.other.name}>
        <span style:color={DISPOSITION_TONE[rv.disposition]}
          >{rv.disposition} ({rv.score > 0 ? '+' : ''}{rv.score})</span
        >
      </KvRow>
    {/each}
  </Well>
{/if}

<style>
  b {
    font-weight: normal;
  }
  .good {
    color: var(--pos);
  }
  .neg {
    color: var(--neg);
  }
</style>
