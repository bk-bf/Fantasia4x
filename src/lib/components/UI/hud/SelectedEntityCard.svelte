<script lang="ts" module>
  import type { ConditionView } from '$lib/components/util/conditionInfo';
  import type { ItemPillView } from '../widget/ItemPills.svelte';
  import type { StatPillView } from '../widget/StatPills.svelte';

  export interface EntityStat {
    label: string;
    value: string | number;
    warn?: boolean;
  }

  export interface EntityBar {
    label: string;
    value: number;
    max?: number;
    warn?: boolean;
    color?: string;
    valueText?: string;
    title?: string;
  }

  export interface EntityButton {
    label: string;
    onClick: () => void;
    active?: boolean;
  }

  export interface SelectedEntityModel {
    name: string;
    flavor?: string;
    status?: string;
    selected?: boolean;
    dismissable?: boolean;
    mood?: number;
    stats?: EntityStat[];
    conditionViews?: ConditionView[];
    itemPills?: ItemPillView[];
    bars?: EntityBar[];
    job?: { text: string; idle?: boolean };
    progress?: number;
    note?: string;
    pos?: { x: number; y: number };
    posMeta?: string;
    lines?: string[];
    growthPct?: number;
    buttons?: EntityButton[];
    health?: HealthModel;
    moodModel?: MoodModel;
    armor?: ArmorModel;
    onSelect?: () => void;
  }

  export interface MoodContribution {
    label: string;
    value: number;
  }

  export interface MoodModel {
    mood: number;
    target: number;
    contributions: MoodContribution[];
  }

  export interface HealthWound {
    text: string;
    warn?: boolean;
    treated?: boolean;
  }

  export interface HealthPart {
    label: string;
    health: number;
    maxHp: number;
    missing?: boolean;
    bleedRate?: number;
    wounds: HealthWound[];
  }

  export interface HealthLimb {
    label: string;
    health: number;
    missing?: boolean;
    bleedRate?: number;
    parts: HealthPart[];
  }

  export interface HealthModel {
    blood?: { current: number; max: number };
    bleedRate?: number;
    pain?: number;
    coldExposure?: number;
    heatExposure?: number;
    pills?: StatPillView[];
    limbs: HealthLimb[];
  }

  export interface ArmorPart {
    label: string;
    armor: number;
    weak?: boolean;
  }

  export interface ArmorLimb {
    label: string;
    parts: ArmorPart[];
  }

  export interface ArmorModel {
    limbs: ArmorLimb[];
  }
</script>

<script lang="ts">
  import StatBar from '../widget/StatBar.svelte';
  import ConditionChips from '../../pawn/ConditionChips.svelte';
  import ItemPills from '../widget/ItemPills.svelte';
  import HealthPanel from '../canvas/HealthPanel.svelte';
  import { healthToggle } from '../canvas/healthToggle.svelte';
  import MoodPanel from '../canvas/MoodPanel.svelte';
  import { moodToggle } from '../canvas/moodToggle.svelte';
  import ArmorPanel from '../canvas/ArmorPanel.svelte';
  import { armorToggle } from '../canvas/armorToggle.svelte';
  import { debugMode } from '$lib/stores/uiPrefs';
  import HoverTip from '../tooltip/HoverTip.svelte';
  import { createPinnable } from '../../util/pinnable.svelte';

  const flavorPin = createPinnable<string>();

  let {
    model,
    embedded = false,
    body
  }: { model: SelectedEntityModel; embedded?: boolean; body?: import('svelte').Snippet } = $props();

  const damaged = $derived(
    !!model.health &&
      (model.health.limbs.length > 0 ||
        (model.health.pain ?? 0) > 0 ||
        (model.health.coldExposure ?? 0) > 0 ||
        (model.health.heatExposure ?? 0) > 0 ||
        (!!model.health.blood && model.health.blood.current < model.health.blood.max))
  );

  const BAR_WARN = '#ee8844';
  const BAR_OK = '#68a030';
</script>

<div
  class="tile-hud-wrap"
  class:tile-hud-wrap--embedded={embedded}
  onmousedown={(e) => {
    e.stopPropagation();
    if (!model.selected) model.onSelect?.();
  }}
  onmouseup={(e) => e.stopPropagation()}
  onclick={(e) => e.stopPropagation()}
>
  <div class="tile-hud tile-hud--pawn" class:tile-hud--selected={model.selected}>
    <div class="tile-hud-body">
      <div class="pawn-header">
        <div class="pawn-meta">
          <span
            class="pawn-name"
            class:has-flavor={model.flavor}
            role="note"
            onmouseenter={(e) => model.flavor && flavorPin.open(model.flavor, 'flavor', e)}
            onmousemove={(e) => flavorPin.move(e)}
            onmouseleave={() => flavorPin.close()}>{model.name}</span
          >
          {#if model.status}<span class="pawn-state">[{model.status}]</span>{/if}
          {#if model.dismissable}<span class="pawn-dismiss" title="Press Esc to deselect">◈</span
            >{/if}
        </div>
      </div>

      {#if model.flavor}
        {@const fv = model.flavor}
        <div
          class="pawn-flavor"
          role="note"
          onmouseenter={(e) => flavorPin.open(fv, 'flavor', e)}
          onmousemove={(e) => flavorPin.move(e)}
          onmouseleave={() => flavorPin.close()}
        >
          {fv}
        </div>
      {/if}

      {#if flavorPin.active}
        <HoverTip x={flavorPin.x} y={flavorPin.y} pinned={flavorPin.pinned}>
          <div class="flavor-tip">{flavorPin.active}</div>
        </HoverTip>
      {/if}

      {#if body}
        {@render body()}
      {:else if model.lines && model.lines.length > 0}
        <div class="text-lines">
          {#each model.lines as line}
            <div class="text-line">{line}</div>
          {/each}
        </div>
      {/if}

      {#if model.growthPct != null}
        {@const gpct = Math.round(model.growthPct)}
        <div
          class="growth-line"
          style="color:{gpct >= 100 ? '#68b030' : gpct >= 50 ? '#9aac3a' : '#c89a3a'}"
          title="resource maturity — scales harvest yield; crops grow only with enough fertility, warmth, water and light"
        >
          growth {gpct}%
        </div>
      {/if}

      {#if model.stats && model.stats.length > 0}
        <div class="pawn-row">
          {#each model.stats as stat (stat.label)}
            <span class="pawn-stat">
              <span class="pawn-stat-label">{stat.label}</span>
              <span class="pawn-stat-val" class:pawn-warn={stat.warn}>{stat.value}</span>
            </span>
          {/each}
        </div>
      {/if}

      {#if model.conditionViews && model.conditionViews.length > 0}
        <ConditionChips views={model.conditionViews} showHeader={false} iconPx={12} />
      {/if}

      {#if model.itemPills && model.itemPills.length > 0}
        <ItemPills pills={model.itemPills} />
      {/if}

      {#if model.bars && model.bars.length > 0}
        <div class="bar-rows">
          {#each model.bars as bar (bar.label)}
            <StatBar
              label={bar.label}
              value={bar.value}
              max={bar.max ?? 100}
              color={bar.color ?? (bar.warn ? BAR_WARN : BAR_OK)}
              valueText={bar.valueText ?? `${Math.floor(bar.value)}%`}
              title={bar.title ?? null}
            />
          {/each}
        </div>
      {/if}

      {#if model.job}
        <div class="pawn-job" class:pawn-idle={model.job.idle}>{model.job.text}</div>
      {/if}
      {#if model.progress != null}
        <div class="job-progress">
          <StatBar
            label=""
            value={model.progress * 100}
            max={100}
            color={BAR_OK}
            valueText={`${Math.round(model.progress * 100)}%`}
          />
        </div>
      {/if}
      {#if model.note}
        <div class="pawn-job">{model.note}</div>
      {/if}
      {#if model.pos || model.posMeta}
        <div class="pawn-pos">
          {#if model.pos}<span>pos ({model.pos.x},{model.pos.y})</span>{/if}
          {#if model.posMeta}<span class="pawn-pos-meta">{model.posMeta}</span>{/if}
        </div>
      {/if}
    </div>
  </div>

  {#if model.health}
    <HealthPanel health={model.health} open={healthToggle.open} />
  {/if}

  {#if model.moodModel}
    <MoodPanel mood={model.moodModel} open={moodToggle.open} />
  {/if}

  {#if model.armor && $debugMode}
    <ArmorPanel armor={model.armor} open={armorToggle.open} />
  {/if}

  {#if (model.buttons && model.buttons.length > 0) || ((model.health || model.moodModel || model.armor) && model.selected)}
    <div class="btn-col">
      {#if model.health && model.selected}
        <button
          class="hud-btn"
          class:hud-btn--active={healthToggle.open}
          class:hud-btn--warn={damaged}
          onmousedown={(e) => e.stopPropagation()}
          onmouseup={(e) => e.stopPropagation()}
          onclick={(e) => {
            e.stopPropagation();
            healthToggle.open = !healthToggle.open;
          }}
        >
          <span class="hud-btn-lbl">HEALTH</span>
        </button>
      {/if}
      {#if model.moodModel && model.selected}
        <button
          class="hud-btn"
          class:hud-btn--active={moodToggle.open}
          class:hud-btn--warn={model.moodModel.target < model.moodModel.mood - 0.5}
          onmousedown={(e) => e.stopPropagation()}
          onmouseup={(e) => e.stopPropagation()}
          onclick={(e) => {
            e.stopPropagation();
            moodToggle.open = !moodToggle.open;
          }}
        >
          <span class="hud-btn-lbl">MOOD</span>
        </button>
      {/if}
      {#if model.armor && model.selected && $debugMode}
        <button
          class="hud-btn"
          class:hud-btn--active={armorToggle.open}
          onmousedown={(e) => e.stopPropagation()}
          onmouseup={(e) => e.stopPropagation()}
          onclick={(e) => {
            e.stopPropagation();
            armorToggle.open = !armorToggle.open;
          }}
        >
          <span class="hud-btn-lbl">GEAR</span>
        </button>
      {/if}
      {#each model.buttons ?? [] as btn (btn.label)}
        <button
          class="hud-btn"
          class:hud-btn--active={btn.active}
          onmousedown={(e) => e.stopPropagation()}
          onmouseup={(e) => e.stopPropagation()}
          onclick={(e) => {
            e.stopPropagation();
            btn.onClick();
          }}
        >
          <span class="hud-btn-lbl">{btn.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tile-hud-wrap {
    position: absolute;
    bottom: 6px;
    left: 6px;
    display: flex;
    align-items: flex-start;
    gap: 4px;
    pointer-events: auto;
    z-index: 10;
  }
  .tile-hud-wrap--embedded {
    position: static;
    bottom: auto;
    left: auto;
    align-items: stretch;
  }
  .tile-hud {
    position: relative;
    background: transparent;
    border: 1px solid transparent;
    color: #a07840;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.25;
    padding: 2px 7px;
    pointer-events: auto;
  }
  .tile-hud::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    background: rgba(28, 16, 6, 0.92);
    box-shadow: inset 0 0 0 1px #6b4a2a;
    filter: url(#ambient-tint);
    pointer-events: none;
  }
  .tile-hud-body {
    position: relative;
    z-index: 1;
    filter: url(#ambient-tint-legible);
  }
  .tile-hud--pawn {
    width: 340px;
    box-sizing: border-box;
  }
  .pawn-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 2px;
  }
  .pawn-meta {
    display: flex;
    align-items: baseline;
    gap: 5px;
    flex-wrap: nowrap;
  }
  .pawn-name {
    color: #c8a060;
    font-weight: bold;
    font-size: 13px;
  }
  .pawn-name.has-flavor {
    cursor: help;
  }
  .pawn-flavor {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: italic;
    font-size: 11px;
    color: #9a7a48;
    margin: 8px 0;
    cursor: help;
  }
  .flavor-tip {
    font-style: italic;
    color: #c8b088;
    line-height: 1.45;
  }
  .pawn-state {
    color: #7a6030;
    font-size: 12px;
    white-space: nowrap;
  }
  .pawn-dismiss {
    color: #886630;
    font-size: 12px;
  }
  .btn-col {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex-shrink: 0;
    pointer-events: auto;
  }
  .hud-btn {
    background: transparent;
    border: 1px solid transparent;
    color: #a07840;
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 1px 5px;
    cursor: pointer;
    pointer-events: auto;
    line-height: 1.3;
    position: relative;
    z-index: 20;
    white-space: nowrap;
  }
  .hud-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    background: #2a1a0a;
    box-shadow: inset 0 0 0 1px #6b4a2a;
    filter: url(#ambient-tint);
    pointer-events: none;
  }
  .hud-btn-lbl {
    position: relative;
    z-index: 1;
    display: inline-block;
    filter: url(#ambient-tint-legible);
  }
  .hud-btn:hover {
    color: #c8a060;
  }
  .hud-btn:hover::before {
    box-shadow: inset 0 0 0 1px #c8a060;
  }
  .hud-btn--active {
    color: #ee8844;
  }
  .hud-btn--active::before {
    background: #4a2010;
    box-shadow: inset 0 0 0 1px #ee8844;
  }
  .hud-btn--active:hover {
    color: #ffaa66;
  }
  .hud-btn--active:hover::before {
    background: #5a2814;
    box-shadow: inset 0 0 0 1px #ffaa66;
  }
  .hud-btn--warn:not(.hud-btn--active) {
    color: #ee8844;
  }
  .hud-btn--warn:not(.hud-btn--active)::before {
    box-shadow: inset 0 0 0 1px #b5532a;
  }
  .text-lines {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-bottom: 2px;
  }
  .text-line {
    color: #c0a040;
    font-size: 12px;
    white-space: normal;
    overflow-wrap: break-word;
  }
  .growth-line {
    font-size: 12px;
    margin-bottom: 2px;
  }
  .pawn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    align-items: baseline;
    font-size: 12px;
  }
  .pawn-stat {
    display: inline-flex;
    gap: 3px;
    align-items: baseline;
  }
  .pawn-stat-label {
    color: #7a6030;
  }
  .pawn-stat-val {
    color: #c08040;
  }
  .pawn-warn {
    color: #ee8844 !important;
  }
  .bar-rows {
    margin-top: 2px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .pawn-job {
    color: #8a7040;
    font-size: 12px;
    margin-top: 1px;
    white-space: normal;
    overflow-wrap: break-word;
  }
  .job-progress {
    margin-top: 1px;
  }
  .tile-hud--selected {
    color: #e8c870;
  }
  .tile-hud--selected::before {
    background: rgba(20, 14, 4, 0.96);
    box-shadow: inset 0 0 0 1px #f0c060;
  }
  .tile-hud--selected .pawn-name {
    color: #ffe890;
  }
  .tile-hud--selected .pawn-state {
    color: #c0a040;
  }
  .pawn-idle {
    color: #887040;
  }
  .pawn-pos {
    display: flex;
    gap: 8px;
    color: #776040;
    font-size: 12px;
  }
  .pawn-pos-meta {
    color: #8a7040;
  }
</style>
