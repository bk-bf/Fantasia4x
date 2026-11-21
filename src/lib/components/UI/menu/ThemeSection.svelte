<script lang="ts">
  import SettingRow from './SettingRow.svelte';
  import SettingSection from './SettingSection.svelte';
  import { uiTheme } from '$lib/stores/uiPrefs';
  import { THEMES, THEME_IDS, isThemeId } from '$lib/components/UI/theme/themes';

  const options = THEME_IDS.map((id) => ({ value: id, label: THEMES[id].name }));
</script>

<SettingSection title="Theme">
  <SettingRow
    type="select"
    label="Panels"
    value={$uiTheme}
    {options}
    onSelect={(v) => isThemeId(v) && uiTheme.set(v)}
  />
</SettingSection>
