<!--
  AudioNowPlaying — a small read-only "now playing" panel for the DEBUG menu. Subscribes to the
  audioService `nowPlaying` store and shows the live music scene + track and the active ambient (SFX)
  beds with their gains. Purely diagnostic — no transport controls (volume lives in Settings).
  Track/bed labels route through manifest label maps so no raw filename/id leaks into the UI.
-->
<script lang="ts">
  import StatBar from './StatBar.svelte';
  import { nowPlaying } from '$lib/audio/AudioService';
  import { SCENE_LABELS, AMBIENT_LABELS, trackLabel } from '$lib/audio/manifest';

  const PCT = (g: number) => `${Math.round(g * 100)}%`;
</script>

<section class="audio-np">
  <h4>Audio <span class="hint">(now playing)</span></h4>

  {#if !$nowPlaying.unlocked}
    <p class="locked">Audio locked — click anywhere in the game to start playback.</p>
  {:else}
    <!-- Music -->
    <div class="np-music">
      <span class="np-note">♪</span>
      <span class="np-title">{trackLabel($nowPlaying.track)}</span>
      {#if $nowPlaying.scene}<span class="np-scene">{SCENE_LABELS[$nowPlaying.scene]}</span>{/if}
    </div>

    <!-- Ambient / SFX beds -->
    <div class="np-group-label">Ambient SFX</div>
    {#if $nowPlaying.ambient.length === 0}
      <p class="np-none">— none —</p>
    {:else}
      {#each $nowPlaying.ambient as a (a.bed)}
        <StatBar
          label={AMBIENT_LABELS[a.bed]}
          value={a.gain * 100}
          max={100}
          valueText={PCT(a.gain)}
          color="var(--accent)"
          width={10}
        />
      {/each}
    {/if}

    <!-- Creature SFX (viewport/zoom audibility) -->
    <div class="np-group-label">Creatures (audibility)</div>
    {#if $nowPlaying.creatures.length === 0}
      <p class="np-none">— none in earshot —</p>
    {:else}
      {#each $nowPlaying.creatures as c (c.label)}
        <StatBar
          label={c.label}
          value={c.level * 100}
          max={100}
          valueText={PCT(c.level)}
          color="var(--accent)"
          width={10}
        />
      {/each}
    {/if}

    <!-- Work SFX (viewport/zoom audibility) -->
    <div class="np-group-label">Work (audibility)</div>
    {#if $nowPlaying.work.length === 0}
      <p class="np-none">— none in earshot —</p>
    {:else}
      {#each $nowPlaying.work as w (w.label)}
        <StatBar
          label={w.label}
          value={w.level * 100}
          max={100}
          valueText={PCT(w.level)}
          color="var(--accent)"
          width={10}
        />
      {/each}
    {/if}
    {#if $nowPlaying.fire > 0}
      <StatBar
        label="Fire"
        value={$nowPlaying.fire * 100}
        max={100}
        valueText={PCT($nowPlaying.fire)}
        color="var(--accent)"
        width={10}
      />
    {/if}

    <!-- Volume buses -->
    <div class="np-group-label">Volume</div>
    <StatBar
      label="Master"
      value={$nowPlaying.volumes.master * 100}
      valueText={PCT($nowPlaying.volumes.master)}
      color="var(--accent-hi)"
      width={10}
    />
    <StatBar
      label="Music"
      value={$nowPlaying.volumes.music * 100}
      valueText={PCT($nowPlaying.volumes.music)}
      color="var(--accent-hi)"
      width={10}
    />
    <StatBar
      label="Ambient"
      value={$nowPlaying.volumes.ambient * 100}
      valueText={PCT($nowPlaying.volumes.ambient)}
      color="var(--accent-hi)"
      width={10}
    />
    <StatBar
      label="SFX"
      value={$nowPlaying.volumes.sfx * 100}
      valueText={PCT($nowPlaying.volumes.sfx)}
      color="var(--accent-hi)"
      width={10}
    />
  {/if}
</section>

<style>
  .audio-np {
    margin-bottom: 14px;
  }
  h4 {
    margin: 0 0 6px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent-hi);
  }
  .hint {
    color: var(--text-dim);
    font-size: 9px;
    text-transform: none;
    letter-spacing: 0;
  }
  .locked,
  .np-none {
    margin: 2px 0;
    color: var(--text-dim);
    font-size: 10px;
  }
  .np-music {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 8px;
    font-family: var(--font-mono);
  }
  .np-note {
    color: var(--accent);
  }
  .np-title {
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
  }
  .np-scene {
    margin-left: auto;
    padding: 1px 6px;
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--accent);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .np-group-label {
    margin: 8px 0 3px;
    color: var(--text-dim);
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
</style>
