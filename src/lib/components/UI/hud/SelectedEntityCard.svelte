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
  import { chrome } from '$lib/pixelArt/chrome';

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

  const BAR_WARN = 'var(--accent-hi)';
  const BAR_OK = 'var(--pos)';
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
  <div
    class="tile-hud tile-hud--pawn"
    class:tile-hud--selected={model.selected}
    {@attach chrome('card')}
  >
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
          style="color:{gpct >= 100
            ? 'var(--pos)'
            : gpct >= 50
              ? 'var(--text)'
              : 'var(--accent-hi)'}"
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
          {@attach chrome(healthToggle.open ? 'btnOn' : 'btn')}
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
          {@attach chrome(moodToggle.open ? 'btnOn' : 'btn')}
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
          {@attach chrome(armorToggle.open ? 'btnOn' : 'btn')}
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
          {@attach chrome(btn.active ? 'btnOn' : 'btn')}
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
    color: var(--text);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
    padding: 9px 12px 10px;
    pointer-events: auto;
  }
  .tile-hud--pawn {
    width: 344px;
    box-sizing: border-box;
  }
  .pawn-header {
    margin-bottom: 2px;
  }
  .pawn-meta {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .pawn-name {
    font: calc(20px * var(--head-size, 1)) / 20px var(--font-head);
    text-transform: var(--head-case, uppercase);
    letter-spacing: 1px;
    color: var(--text);
  }
  .pawn-name.has-flavor {
    cursor: help;
  }
  .pawn-flavor {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-dim);
    margin: 2px 0 4px;
    cursor: help;
  }
  .flavor-tip {
    font-style: italic;
    color: var(--text-dim);
    line-height: 1.45;
  }
  .pawn-state,
  .pawn-dismiss,
  .pawn-stat-label,
  .pawn-pos {
    color: var(--text-dim);
  }
  .btn-col {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex-shrink: 0;
  }
  .hud-btn {
    height: 22px;
    padding: 0 8px;
    border: 0;
    background: none;
    color: var(--text);
    font: 16px/18px var(--font-pixel);
    cursor: pointer;
    white-space: nowrap;
  }
  .hud-btn-lbl {
    display: inline-block;
    text-transform: lowercase;
  }
  .hud-btn-lbl::first-letter {
    text-transform: uppercase;
  }
  .hud-btn--active,
  .hud-btn--warn {
    color: var(--ember, var(--accent-hi));
  }
  .text-lines {
    margin-bottom: 2px;
  }
  .text-line,
  .pawn-stat-val {
    color: var(--text);
    overflow-wrap: break-word;
  }
  .pawn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0 10px;
  }
  .pawn-stat {
    display: inline-flex;
    gap: 4px;
  }
  .pawn-warn {
    color: var(--accent-hi) !important;
  }
  .bar-rows {
    margin-top: 3px;
  }
  .pawn-job {
    color: var(--accent-hi);
    overflow-wrap: break-word;
  }
  .pawn-idle {
    color: var(--text-muted);
  }
  .tile-hud--selected .pawn-name {
    color: var(--accent-hi);
  }
  .pawn-pos {
    display: flex;
    gap: 8px;
  }
</style>
