<script lang="ts">
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import SettingRow from '$lib/components/UI/menu/SettingRow.svelte';
  import PanelTitle from '$lib/components/UI/widget/PanelTitle.svelte';
  import { copyText } from '$lib/components/util/copyText';
  import { FLUID_IDS } from '$lib/webgl/painted/fluids';
  import { fluidFile, fluidTuning } from '$lib/stores/fluidTuning';
  import { FLUID_SLIDERS, TINT_SLIDERS, readout, snap } from './fluidSliders';

  let copied = $state(false);
  async function copy() {
    await copyText(fluidFile($fluidTuning));
    copied = true;
    setTimeout(() => (copied = false), 1200);
  }
</script>

<div class="fluids">
  <div class="tools">
    <ChromeButton on={copied} onclick={copy}>{copied ? 'Copied' : 'Copy values'}</ChromeButton>
    <ChromeButton onclick={() => fluidTuning.reset()}>Reset</ChromeButton>
  </div>
  <div class="cols">
    {#each FLUID_IDS as id (id)}
      {@const def = $fluidTuning[id]}
      <section>
        <PanelTitle>{def.name}</PanelTitle>
        {#each FLUID_SLIDERS.filter((s) => def[s.key] !== undefined) as s (s.key)}
          <SettingRow
            type="slider"
            label={s.label}
            min={s.min}
            max={s.max}
            step={s.step}
            sliderValue={def[s.key] ?? 0}
            readout={readout(def[s.key] ?? 0, s.step)}
            onInput={(v) => fluidTuning.setValue(id, s.key, snap(v, s.step))}
          />
        {/each}
        {#each TINT_SLIDERS as s, i (s.label)}
          <SettingRow
            type="slider"
            label={s.label}
            min={s.min}
            max={s.max}
            step={s.step}
            sliderValue={def.tint[i]}
            readout={readout(def.tint[i], s.step)}
            onInput={(v) => fluidTuning.setTint(id, i, snap(v, s.step))}
          />
        {/each}
      </section>
    {/each}
  </div>
</div>

<style>
  .fluids {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .tools {
    display: flex;
    gap: 6px;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
</style>
