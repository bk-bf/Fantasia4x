<script lang="ts" module>
  import type { ConditionView } from '$lib/utils/conditionInfo';

  export interface EntityStat {
    label: string;
    value: string | number;
    warn?: boolean;
  }

  export interface EntityBar {
    label: string;
    /** Current value (0–max). */
    value: number;
    /** Maximum (defaults to 100). */
    max?: number;
    warn?: boolean;
    /** Explicit bar colour. Falls back to warn-red / default-green when omitted. */
    color?: string;
    /** Right-hand readout. Defaults to `<rounded>%`. */
    valueText?: string;
  }

  export interface EntityButton {
    label: string;
    onClick: () => void;
    /** Highlighted/active state (e.g. UNFOLLOW, DRAFTED). */
    active?: boolean;
  }

  export interface SelectedEntityModel {
    /** Display name shown in the header. */
    name: string;
    /** Bracketed status label, e.g. the current state. */
    status?: string;
    /** Gold-highlighted "selected/locked" styling. */
    selected?: boolean;
    /** Show the ◈ dismiss hint (Esc to deselect). */
    dismissable?: boolean;
    /** Pawn mood 0–100, shown right-aligned in the header (next to the name). */
    mood?: number;
    /** Inline stat readouts (STR, MOVE, …). */
    stats?: EntityStat[];
    /** Active conditions (persistent + transient) rendered as icon chips with a hover panel. */
    conditionViews?: ConditionView[];
    /** Block-character meter bars (Food, Blood, …). */
    bars?: EntityBar[];
    /** Activity / job line. `idle` greys it out. */
    job?: { text: string; idle?: boolean };
    /** Active-task completion fraction (0–1), rendered as a StatBar aligned with the need bars. */
    progress?: number;
    /** Extra descriptive line (e.g. behaviour tags). */
    note?: string;
    /** Map position footer. */
    pos?: { x: number; y: number };
    /** Free-form text lines rendered below the header (description, progress, refund, etc.). */
    lines?: string[];
    /** Action buttons shown in a 3-column grid. Only rendered on selected cards. */
    buttons?: EntityButton[];
    /** Body health for the toggleable HEALTH popup (NT-U1). `undefined` hides the HEALTH button
     *  entirely (entity has no body model); a present-but-undamaged model shows "no damage". */
    health?: HealthModel;
    /** Called when a non-selected hover card is clicked (to select the entity). */
    onSelect?: () => void;
  }

  /** One wound line on a body part, or an active condition. */
  export interface HealthWound {
    text: string; // "crush (serious)" / "puncture · infected"
    warn?: boolean;
  }

  /** A damaged sub-part (organ/bone/finger) inside a limb, with its own HP and wounds. */
  export interface HealthPart {
    label: string; // "skull"
    health: number; // current HP
    maxHp: number;
    wounds: HealthWound[];
  }

  /** A single damaged limb: rolled-up health + bleed, plus its injured sub-parts. */
  export interface HealthLimb {
    label: string; // "L.Arm"
    health: number; // 0–100 (rolled up from parts)
    missing?: boolean;
    bleedRate?: number; // blood points/second while > 0
    parts: HealthPart[]; // injured sub-parts only
  }

  /** A compact combat-stat row (label + formatted value) shown beside blood/pain. */
  export interface CombatStat {
    label: string;
    value: string;
    title?: string;
  }

  /** Whole-body health snapshot rendered by the HEALTH popup. Active conditions are no longer shown
   *  here — they live in the main card's condition chips (see `conditionViews`). */
  export interface HealthModel {
    /** Whole-body blood pool. */
    blood?: { current: number; max: number };
    /** Whole-body pain 0–100. */
    pain?: number;
    /** SEASONS_WEATHER tracked exposure meters 0–100 (cold/heat); shown as % next to Blood. */
    coldExposure?: number;
    heatExposure?: number;
    /** Combat-readiness stats (hit/dodge/crit), reflecting current injuries. Pawns/mobs only. */
    combat?: CombatStat[];
    /** Damaged limbs only — intact, full-health, non-bleeding limbs are omitted. */
    limbs: HealthLimb[];
  }
</script>

<script lang="ts">
  import StatBar from './StatBar.svelte';
  import ConditionChips from '../pawn/ConditionChips.svelte';
  import HealthPanel from './gameCanvas/HealthPanel.svelte';
  import { healthToggle } from './gameCanvas/healthToggle.svelte';

  // `embedded`: render as an in-flow flex item instead of self-anchoring to the canvas.
  // Used when a parent (e.g. the building row, which also hosts the fuel-settings panel)
  // already owns the absolute positioning and lays the card out in a flex row.
  let { model, embedded = false }: { model: SelectedEntityModel; embedded?: boolean } = $props();

  // NT-U1: the HEALTH button opens a pop-up health panel (like the fuel panel) above the card.
  // The open/closed flag is SHARED (healthToggle) so it persists across every selected/hovered
  // entity — flip it once and it stays on for all pawns and mobs.
  // Any damage to show? (blood loss, pain, broken limbs, or active conditions.)
  const damaged = $derived(
    !!model.health &&
      (model.health.limbs.length > 0 ||
        (model.health.pain ?? 0) > 0 ||
        (model.health.coldExposure ?? 0) > 0 ||
        (model.health.heatExposure ?? 0) > 0 ||
        (!!model.health.blood && model.health.blood.current < model.health.blood.max))
  );

  // Bar colours when an EntityBar doesn't specify its own: red on warn, green otherwise.
  const BAR_WARN = '#ee8844';
  const BAR_OK = '#68a030';
</script>

<!--
  Always stop mousedown/mouseup from reaching the canvas so canvas drag/click
  handlers never fire when the user interacts with any HUD card (fixes the
  FOLLOW/UNFOLLOW glitch that deselected the pawn via handleTileClick).
  Hover cards use onSelect to forward the "select entity" action instead.
-->
<!-- NT-U2: the action buttons sit in their own column to the RIGHT of and OUTSIDE the
     bordered info box. NT-U3: the info box is a fixed-width skeleton so long descriptions
     wrap inside it instead of stretching the panel across the viewport. The wrapper carries
     the absolute positioning so both columns stay anchored together. -->
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
    <div class="pawn-header">
      <div class="pawn-meta">
        <span class="pawn-name">{model.name}</span>
        {#if model.status}<span class="pawn-state">[{model.status}]</span>{/if}
        {#if model.dismissable}<span class="pawn-dismiss" title="Press Esc to deselect">◈</span
          >{/if}
      </div>
      {#if model.mood != null}
        <span class="pawn-mood" class:pawn-warn={model.mood < 30}
          >Mood {Math.round(model.mood)}</span
        >
      {/if}
    </div>

    {#if model.lines && model.lines.length > 0}
      <div class="text-lines">
        {#each model.lines as line}
          <div class="text-line">{line}</div>
        {/each}
      </div>
    {/if}

    {#if model.stats && model.stats.length > 0}
      <div class="pawn-row">
        {#each model.stats as stat (stat.label)}
          <span class="pawn-stat-label">{stat.label}</span>
          <span class="pawn-stat-val" class:pawn-warn={stat.warn}>{stat.value}</span>
        {/each}
      </div>
    {/if}

    {#if model.conditionViews && model.conditionViews.length > 0}
      <ConditionChips views={model.conditionViews} showHeader={false} iconPx={12} />
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
          />
        {/each}
      </div>
    {/if}

    {#if model.job}
      <div class="pawn-job" class:pawn-idle={model.job.idle}>{model.job.text}</div>
    {/if}
    {#if model.progress != null}
      <!-- Task progress as a StatBar (empty label) so its track lines up with the need bars above. -->
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
    {#if model.pos}
      <div class="pawn-pos">pos ({model.pos.x},{model.pos.y})</div>
    {/if}
  </div>

  {#if model.health}
    <!-- NT-U1: HEALTH opens as a pop-up above the card (like the campfire fuel panel). -->
    <HealthPanel health={model.health} open={healthToggle.open} />
  {/if}

  {#if (model.buttons && model.buttons.length > 0) || (model.health && model.selected)}
    <div class="btn-col">
      {#if model.health && model.selected}
        <!-- NT-U1: HEALTH button only on the SELECTED card; the pop-up still shows on hover when the
             shared toggle is on. Warn-tinted on damage. -->
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
          HEALTH
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
          {btn.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Wrapper anchors the card to the canvas; the info box and the button column are its
     two children laid out side by side (NT-U2). */
  .tile-hud-wrap {
    position: absolute;
    bottom: 6px;
    left: 6px;
    display: flex;
    align-items: flex-start;
    gap: 4px;
    pointer-events: auto;
    z-index: 5;
    /* Same day/night hue + weather desaturation the chrome panels get (see +page.svelte
       #ambient-tint), so the selection/hover info card matches the lit scene beneath it. */
    filter: url(#ambient-tint);
  }
  /* In-flow variant: the parent owns positioning (and sizes itself to this card, which a
     sibling absolutely-positioned panel like fuel-settings depends on for its width). */
  .tile-hud-wrap--embedded {
    position: static;
    bottom: auto;
    left: auto;
  }
  .tile-hud {
    background: rgba(28, 16, 6, 0.92);
    border: 1px solid #6b4a2a;
    color: #a07840;
    font-family: 'Courier New', monospace;
    font-size: 9px;
    line-height: 1.25;
    padding: 2px 7px;
    pointer-events: auto;
  }
  /* NT-U3: fixed-width skeleton, identical for every object type, so long descriptions
     wrap inside the box instead of stretching it across the map. 300px is the building
     panel's reference width — every info panel (pawn/mob/resource/item/building, hover or
     selected) uses exactly this, so none is narrower or wider than another. */
  .tile-hud--pawn {
    width: 300px;
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
    flex-wrap: wrap;
  }
  .pawn-name {
    color: #c8a060;
    font-weight: bold;
    font-size: 10px;
  }
  .pawn-state {
    color: #7a6030;
    font-size: 9px;
  }
  .pawn-dismiss {
    color: #886630;
    font-size: 9px;
  }
  /* Mood pinned to the right of the header (next to the name). */
  .pawn-mood {
    color: #c0a040;
    font-size: 9px;
    flex-shrink: 0;
    white-space: nowrap;
  }
  /* ── Button column (NT-U2: outside the box, to the right) ────── */
  .btn-col {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex-shrink: 0;
    pointer-events: auto;
  }
  .hud-btn {
    background: #2a1a0a;
    border: 1px solid #6b4a2a;
    color: #a07840;
    font-family: 'Courier New', monospace;
    font-size: 9px;
    padding: 1px 5px;
    cursor: pointer;
    pointer-events: auto;
    line-height: 1.3;
    position: relative;
    z-index: 20;
    white-space: nowrap;
  }
  .hud-btn:hover {
    border-color: #c8a060;
    color: #c8a060;
  }
  .hud-btn--active {
    background: #4a2010;
    border-color: #ee8844;
    color: #ee8844;
  }
  .hud-btn--active:hover {
    background: #5a2814;
    border-color: #ffaa66;
    color: #ffaa66;
  }
  /* HEALTH button tint when the entity is damaged (overridden by --active when open). */
  .hud-btn--warn:not(.hud-btn--active) {
    border-color: #b5532a;
    color: #ee8844;
  }
  /* ── Text lines (description, progress, refund, etc.) ───────── */
  .text-lines {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-bottom: 2px;
  }
  .text-line {
    color: #c0a040;
    font-size: 9px;
    white-space: normal;
    overflow-wrap: break-word;
  }
  /* ── Stats / bars ─────────────────────────────────────────────── */
  .pawn-row {
    display: flex;
    gap: 6px;
    align-items: baseline;
    font-size: 9px;
  }
  .pawn-stat-label {
    color: #7a6030;
  }
  .pawn-stat-val {
    color: #c08040;
    min-width: 18px;
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
    font-size: 9px;
    margin-top: 1px;
    white-space: normal;
    overflow-wrap: break-word;
  }
  /* Task-progress StatBar row — slight gap so it reads as part of the bar stack above. */
  .job-progress {
    margin-top: 1px;
  }
  .tile-hud--selected {
    border-color: #f0c060;
    background: rgba(20, 14, 4, 0.96);
    color: #e8c870;
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
    color: #776040;
    font-size: 9px;
  }
</style>
