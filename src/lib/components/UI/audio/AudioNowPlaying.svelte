<script lang="ts">
  import MeterRow from '../widget/MeterRow.svelte';
  import { nowPlaying } from '$lib/audio/AudioService';
  import { SCENE_LABELS, AMBIENT_LABELS, trackLabel } from '$lib/audio/manifest';

  const PCT = (g: number) => `${Math.round(g * 100)}%`;

  const groups = $derived([
    {
      title: 'Ambience',
      ramp: 'water' as const,
      rows: $nowPlaying.ambient.map((a) => ({ label: AMBIENT_LABELS[a.bed], level: a.gain }))
    },
    { title: 'Creatures', ramp: 'leaf' as const, rows: $nowPlaying.creatures },
    {
      title: 'Work',
      ramp: 'ember' as const,
      rows: [
        ...$nowPlaying.work,
        ...($nowPlaying.fire > 0 ? [{ label: 'Fire', level: $nowPlaying.fire }] : [])
      ]
    }
  ]);
  const volumes = $derived([
    { label: 'Master', level: $nowPlaying.volumes.master },
    { label: 'Music', level: $nowPlaying.volumes.music },
    { label: 'Ambient', level: $nowPlaying.volumes.ambient },
    { label: 'Effects', level: $nowPlaying.volumes.sfx }
  ]);
</script>

<h5>Now playing</h5>
{#if !$nowPlaying.unlocked}
  <p>Silent until the first click in the game.</p>
{:else}
  <MeterRow label="Music" value={$nowPlaying.volumes.music}
    >{$nowPlaying.scene ? SCENE_LABELS[$nowPlaying.scene] : 'none'}</MeterRow
  >
  <p>{trackLabel($nowPlaying.track)}</p>
  {#each groups as g (g.title)}
    <h5>{g.title}</h5>
    {#each g.rows as r (r.label)}
      <MeterRow wide label={r.label} value={r.level} ramp={g.ramp}>{PCT(r.level)}</MeterRow>
    {:else}
      <p>none in earshot</p>
    {/each}
  {/each}
  <h5>Volume</h5>
  {#each volumes as v (v.label)}
    <MeterRow wide label={v.label} value={v.level}>{PCT(v.level)}</MeterRow>
  {/each}
{/if}

<style>
  p {
    margin: 0;
    line-height: 17px;
    color: var(--text-muted);
  }
</style>
