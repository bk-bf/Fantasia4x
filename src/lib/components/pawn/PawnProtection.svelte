<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import type { GlyphName } from '$lib/pixelArt/glyphs';
  import { buildStatContext, computeStatView } from '$lib/components/util/statView';
  import { gameCoordinator } from '$lib/game/systems/GameCoordinator';
  import { qualityPrefix } from '$lib/game/core/rules/gear/itemQuality';
  import PixelGlyph from '$lib/components/UI/widget/PixelGlyph.svelte';
  import SkinBar from '$lib/components/UI/widget/SkinBar.svelte';

  let { pawn }: { pawn: Pawn } = $props();

  const GUARDS: { id: string; label: string; glyph: GlyphName }[] = [
    { id: 'cutting_resistance', label: 'Cut', glyph: 'sword' },
    { id: 'piercing_resistance', label: 'Pierce', glyph: 'bow' },
    { id: 'blunt_resistance', label: 'Blunt', glyph: 'hammer' },
    { id: 'cold_resistance', label: 'Cold', glyph: 'snow' },
    { id: 'wetness_resistance', label: 'Rain', glyph: 'rain' }
  ];

  const rows = $derived.by(() => {
    const ctx = buildStatContext(pawn);
    return GUARDS.map((g) => ({ ...g, value: computeStatView(g.id, pawn, ctx)?.value ?? 0 }));
  });

  const hands = $derived(
    (['mainHand', 'offHand'] as const).flatMap((slot) => {
      const it = pawn.equipment?.[slot];
      const def = it ? gameCoordinator.getItemById(it.itemId) : undefined;
      if (!it || !def) return [];
      const maxDur = def.maxDurability ?? 100;
      return [
        {
          slot,
          name: def.name,
          quality: qualityPrefix(it.quality),
          wear: Math.round((it.durability / maxDur) * 100)
        }
      ];
    })
  );
</script>

{#each rows as r (r.id)}
  <div class="meter">
    <PixelGlyph name={r.glyph} />
    <em>{r.label}</em>
    <SkinBar value={Math.max(0, r.value) / 0.5} ramp={r.value < 0 ? 'ember' : 'water'} />
    <span class:neg={r.value < 0}>{Math.round(r.value * 100)}%</span>
  </div>
{/each}

<h5>In hand</h5>
{#each hands as h (h.slot)}
  <div class="kv"><em>{h.name}</em><span>{h.quality || `${h.wear}%`}</span></div>
{:else}
  <p class="none">Empty-handed.</p>
{/each}

<style>
  .meter {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 18px;
  }
  .meter em {
    flex: none;
    width: 50px;
    font-style: normal;
  }
  .meter span {
    flex: none;
    width: 40px;
    text-align: right;
  }
  .neg {
    color: var(--neg);
  }
  .kv {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .kv em {
    font-style: normal;
  }
  .kv span,
  .none {
    margin: 0;
    color: var(--text-dim);
  }
</style>
