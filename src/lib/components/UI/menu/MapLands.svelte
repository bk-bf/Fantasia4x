<script lang="ts">
  import type { BiomeConfigEntry } from '$lib/game/core/defs/terrains';
  import CheckBox from '$lib/components/UI/widget/CheckBox.svelte';
  import Slider from '$lib/components/UI/widget/Slider.svelte';
  import Well from '$lib/components/UI/widget/Well.svelte';

  let {
    biomes,
    locked,
    water,
    onlock,
    onshare,
    onclimate,
    onwater
  }: {
    biomes: BiomeConfigEntry[];
    locked: Set<string>;
    water: number;
    onlock: (id: string) => void;
    onshare: (id: string, pct: number) => void;
    onclimate: (id: string, field: 'baseTemp' | 'baseMoisture', v: number) => void;
    onwater: (pct: number) => void;
  } = $props();
</script>

<Well title="Lands" hint="share of the map, warmth and wet">
  <div class="grid">
    <span></span><em>Share</em><em>Warmth</em><em>Wet</em>
    {#each biomes as b (b.id)}
      <span class="name" title="its share shifts with the others">
        <CheckBox checked={!locked.has(b.id)} onchange={() => onlock(b.id)}
          >{b.displayName}</CheckBox
        >
      </span>
      <Slider
        label="{b.displayName} share"
        value={Math.round(b.share * 100)}
        disabled={locked.has(b.id)}
        oninput={(v) => onshare(b.id, v)}
      />
      <Slider
        class="deg"
        label="{b.displayName} warmth"
        min={-20}
        max={40}
        value={b.baseTemp}
        oninput={(v) => onclimate(b.id, 'baseTemp', v)}>{b.baseTemp}°</Slider
      >
      <Slider
        label="{b.displayName} wet"
        value={b.baseMoisture}
        oninput={(v) => onclimate(b.id, 'baseMoisture', v)}
      />
    {/each}
    <span class="name water">Water</span>
    <Slider label="Water" max={80} value={water} oninput={onwater} />
    <em class="note">lakes and seas in the lowlands</em>
  </div>
</Well>

<style>
  .grid {
    display: grid;
    grid-template-columns: 110px 1fr 1fr 1fr;
    gap: 2px 12px;
    align-items: center;
  }
  em {
    font-style: normal;
    color: var(--text-muted);
  }
  .name {
    min-width: 0;
  }
  .water {
    padding-left: 18px;
    color: var(--text);
  }
  .note {
    grid-column: span 2;
  }
  .grid :global(.deg b) {
    width: 30px;
    text-align: right;
  }
</style>
