<script lang="ts">
  let {
    light,
    temp,
    wet,
    wind,
    debugTemp = null
  }: {
    light: number;
    temp: number;
    wet: number;
    wind: string;
    debugTemp?: number | null;
  } = $props();
</script>

<div class="env-readout">
  <span style="color:{light >= 0.8 ? '#68b030' : light >= 0.4 ? '#b09030' : '#c83018'}"
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
    font-size: 10px;
    margin-top: 1px;
  }
  .dbg {
    color: #6a7a4a;
  }
</style>
