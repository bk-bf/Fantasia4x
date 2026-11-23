<script lang="ts">
  import type { Mob } from '$lib/game/core/types';
  import type { CreatureDefinition } from '$lib/game/core/defs/creatures';
  import { uiState } from '$lib/stores/uiState';
  import { debugMode } from '$lib/stores/uiPrefs';
  import { getActiveConditionViews } from '$lib/components/util/conditionInfo';
  import { getNeedDescription } from '$lib/components/util/pawnUtils';
  import ConditionRows from '../../pawn/ConditionRows.svelte';
  import ArmorPanel from '../canvas/ArmorPanel.svelte';
  import { armorToggle } from '../canvas/armorToggle.svelte';
  import ChromeButton from '../widget/ChromeButton.svelte';
  import MeterRow from '../widget/MeterRow.svelte';
  import SpriteIcon from '../widget/SpriteIcon.svelte';
  import HudCard from './HudCard.svelte';
  import {
    buildArmorModel,
    mobDisplayName,
    mobStateLabel,
    mobTemperament,
    toggleHuntMark
  } from '../canvas/selectionCard';

  let {
    mob,
    def,
    selected,
    colonyName
  }: { mob: Mob; def: CreatureDefinition; selected: boolean; colonyName?: string } = $props();

  const blood = $derived(
    Math.max(0, Math.min(1, (mob.bloodVolume ?? 1) / (mob.maxBloodVolume ?? mob.bloodVolume ?? 1)))
  );
  const pain = $derived(Math.round(mob.pain ?? 0));
  const conditions = $derived(getActiveConditionViews(mob));
  const following = $derived($uiState.cameraFollowMobId === mob.id);
  const bodyOpen = $derived($uiState.windows.includes('health'));
  const armor = $derived($debugMode ? buildArmorModel(mob, def) : undefined);

  function select(e: MouseEvent) {
    e.stopPropagation();
    if (selected) return;
    uiState.selectMob(mob.id);
    uiState.selectPawn(null);
  }

  function view() {
    uiState.selectMob(mob.id);
    uiState.openWindow('entities');
  }
</script>

<div
  class="card-wrap"
  role="presentation"
  onmousedown={select}
  onmouseup={(e) => e.stopPropagation()}
>
  {#if selected && armor}<ArmorPanel {armor} open={armorToggle.open} />{/if}
  <HudCard
    title={mobDisplayName(mob, def)}
    wellLabel="Look over {mobDisplayName(mob, def)}"
    onwell={selected ? view : undefined}
    verbs={selected ? creatureVerbs : undefined}
  >
    {#snippet well()}<SpriteIcon creature={def.id} px={40} />{/snippet}
    {#snippet lines()}
      <p title={mob.worldKinRelation ?? def.flavor}>{mobTemperament(mob, def)}</p>
      <p class="hot">{mobStateLabel(mob, colonyName)}</p>
    {/snippet}
    <div class="c-bars">
      <MeterRow label="Blood" value={blood} ramp="blood">{Math.round(blood * 100)}%</MeterRow>
      <MeterRow label="Pain" value={pain / 100} ramp="ember"
        >{getNeedDescription('pain', pain)}</MeterRow
      >
    </div>
    {#if conditions.length > 0}
      <div class="c-conds"><ConditionRows views={conditions} inline /></div>
    {/if}
  </HudCard>
</div>

{#snippet creatureVerbs()}
  <ChromeButton glyph="bow" on={!!mob.markedForHunt} onclick={() => toggleHuntMark(mob.id)}
    >Hunt</ChromeButton
  >
  <ChromeButton
    glyph="eye"
    on={following}
    onclick={() => uiState.setFollowMob(following ? null : mob.id)}>Follow</ChromeButton
  >
  <ChromeButton on={bodyOpen} onclick={() => uiState.toggleWindow('health')}>Body</ChromeButton>
  {#if armor}
    <ChromeButton on={armorToggle.open} onclick={() => (armorToggle.open = !armorToggle.open)}
      >Gear</ChromeButton
    >
  {/if}
{/snippet}

<style>
  .card-wrap {
    position: relative;
    pointer-events: auto;
  }
</style>
