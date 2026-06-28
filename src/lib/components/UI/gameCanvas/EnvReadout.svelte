<!--
  EnvReadout — the shared, colour-coded environment line (light · temp · wet · wind) used by EVERY
  tile/building info panel (hover tile, hover building, clicked building) so they can't drift. Tile-
  specific extras (fertility, snow, growth, roofed) stay in their own panel; this is just the common
  weather atoms. `nowrap` so temp never wraps under the rest.

  `debugTemp` (Settings → Debug mode): the season-baked base the SIM actually reads (`seasonBakedTemp`)
  shown as `(N°)` next to the temp — a one-glance check that the simulation and the displayed temp agree.
-->
<script lang="ts">
  let {
    light,
    temp,
    wet,
    wind,
    debugTemp = null
  }: {
    /** 0–1 ambient light at the tile. */
    light: number;
    /** Effective °C shown in the panel (already rounded by the caller). */
    temp: number;
    /** 0–100 tile wetness. */
    wet: number;
    /** Wind word ("somewhat" / "slightly" / …) or '' for calm. Rendered as "<word> windy". */
    wind: string;
    /** Debug-only: the sim's season-baked base °C, or null to hide. */
    debugTemp?: number | null;
  } = $props();
</script>

<div class="env-readout">
  <span
    style="color:{light >= 0.8 ? '#68b030' : light >= 0.4 ? '#b09030' : '#c83018'}"
    >light {Math.round(light * 100)}%</span
  >
  <span style="color:{temp <= 0 ? '#5aa0e0' : temp >= 30 ? '#e07a2a' : '#b0a060'}"
    >temp {temp}°C{#if debugTemp != null}<span class="dbg"> ({debugTemp}°)</span>{/if}</span
  >
  <span style="color:{wet >= 60 ? '#3a9ed0' : wet >= 30 ? '#6aa0a0' : '#a08a5a'}"
    >wet {Math.round(wet)}%</span
  >
  {#if wind}<span style="color:#8fc8a0">{wind} windy</span>{/if}
</div>

<style>
  .env-readout {
    display: flex;
    flex-wrap: nowrap;
    white-space: nowrap;
    gap: 8px;
    font-size: 9px;
    margin-top: 1px;
  }
  .dbg {
    color: #6a7a4a;
  }
</style>
