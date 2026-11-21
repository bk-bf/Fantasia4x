<script lang="ts">
  import SettingRow from './SettingRow.svelte';
  import { masterVolume, musicVolume, sfxVolume, ambientVolume } from '$lib/stores/uiPrefs';
</script>

<div class="section">Audio</div>
<SettingRow
  type="slider"
  label="Master volume"
  sliderValue={$masterVolume}
  onInput={masterVolume.set}
/>
<SettingRow
  type="slider"
  label="Music volume"
  sliderValue={$musicVolume}
  onInput={musicVolume.set}
/>
<SettingRow
  type="slider"
  label="Ambient volume"
  sub="— weather, nature, fire"
  sliderValue={$ambientVolume}
  onInput={ambientVolume.set}
/>
<SettingRow
  type="slider"
  label="SFX volume"
  sub="— creatures, work, combat, UI"
  sliderValue={$sfxVolume}
  onInput={sfxVolume.set}
/>
