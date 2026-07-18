<script lang="ts" module>
  import type { ConditionView } from '$lib/components/util/conditionInfo';
  import type { ItemPillView } from './ItemPills.svelte';
  import type { StatPillView } from './StatPills.svelte';

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
    /** Optional hover tooltip on the row (e.g. a drying-rate breakdown). */
    title?: string;
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
    /** One-line flavour blurb — shown truncated under the header, full text as the name's hover title. */
    flavor?: string;
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
    /** Item-coloured pills (e.g. a resource's harvest yields) with a hover item-card panel. */
    itemPills?: ItemPillView[];
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
    /** Extra footer text shown beside the position (e.g. a pawn's sex + age). */
    posMeta?: string;
    /** Free-form text lines rendered below the header (description, progress, refund, etc.). */
    lines?: string[];
    /** Resource growth maturity 0–100, rendered with the same colour ramp + tooltip as the hover HUD. */
    growthPct?: number;
    /** Action buttons shown in a 3-column grid. Only rendered on selected cards. */
    buttons?: EntityButton[];
    /** Body health for the toggleable HEALTH popup (NT-U1). `undefined` hides the HEALTH button
     *  entirely (entity has no body model); a present-but-undamaged model shows "no damage". */
    health?: HealthModel;
    /** §M Mood drivers for the toggleable MOOD popup. `undefined` hides the MOOD button (entity has
     *  no mood model — mobs/resources). Distinct from `mood` (the header's numeric value). */
    moodModel?: MoodModel;
    /** Per-part natural armour for the toggleable GEAR popup (creatures only). `undefined` hides the
     *  GEAR button — an unarmoured creature (no hide worth reading) has no model. */
    armor?: ArmorModel;
    /** Called when a non-selected hover card is clicked (to select the entity). */
    onSelect?: () => void;
  }

  /** MOOD-REWORK — one signed contribution to the mood target (benefit if `value > 0`, debuff if `< 0`):
   *  weather, surroundings, a need, a condition, a trait, or an event "thought". */
  export interface MoodContribution {
    label: string;
    value: number;
  }

  /** MOOD-REWORK — the MOOD popup snapshot: the pawn's CURRENT (eased) value, the TARGET it is easing
   *  toward, and the itemised contributions behind that target. Sourced from
   *  `pawnService.getMoodBreakdown` (= `computeMoodTarget`). */
  export interface MoodModel {
    mood: number;
    target: number;
    contributions: MoodContribution[];
  }

  /** One wound line on a body part, or an active condition. */
  export interface HealthWound {
    text: string; // "crush (serious)" / "puncture · infected"
    warn?: boolean;
    treated?: boolean; // a caretaker has tended it (treatedAt set) → shows a green `+`
  }

  /** A damaged sub-part (organ/bone/finger) inside a limb, with its own HP and wounds. */
  export interface HealthPart {
    label: string; // "skull"
    health: number; // current HP
    maxHp: number;
    missing?: boolean; // severed/destroyed — or taken when its container was severed (containment cascade)
    bleedRate?: number; // this part's own bleed (Σ its wounds' bleeding), blood/s while > 0
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

  /** Whole-body health snapshot rendered by the HEALTH popup. Active conditions are no longer shown
   *  here — they live in the main card's condition chips (see `conditionViews`). */
  export interface HealthModel {
    /** Whole-body blood pool — kept for the "any-damage" gate; surfaced to the player via `pills`. */
    blood?: { current: number; max: number };
    /** Total active bleed across all limbs, in blood points per real second (0 if not bleeding). */
    bleedRate?: number;
    /** Whole-body pain 0–100 — kept for the gate; surfaced via `pills`. */
    pain?: number;
    /** SEASONS_WEATHER tracked exposure meters 0–100 (cold/heat) — kept for the gate; shown via `pills`. */
    coldExposure?: number;
    heatExposure?: number;
    /** Blood / pain / exposure / tolerance / combat-readiness, all as compact hover-breakdown pills. */
    pills?: StatPillView[];
    /** Damaged limbs only — intact, full-health, non-bleeding limbs are omitted. */
    limbs: HealthLimb[];
  }

  /** One hittable body part with its total natural armour points (natural-armour scalar × the part's
   *  share, plus any per-part armour mods). `weak` flags the thin spots relative to this creature. */
  export interface ArmorPart {
    label: string; // "throat"
    armor: number; // rounded armour points soaked at this part
    weak?: boolean; // a thin spot for this creature (well below its thickest plating)
  }

  /** Natural armour grouped by limb for the GEAR popup. */
  export interface ArmorLimb {
    label: string; // "Head"
    parts: ArmorPart[];
  }

  /** Whole-creature natural-armour map rendered by the GEAR popup. */
  export interface ArmorModel {
    limbs: ArmorLimb[];
  }
</script>

<script lang="ts">
  import StatBar from './StatBar.svelte';
  import ConditionChips from '../pawn/ConditionChips.svelte';
  import ItemPills from './ItemPills.svelte';
  import HealthPanel from './gameCanvas/HealthPanel.svelte';
  import { healthToggle } from './gameCanvas/healthToggle.svelte';
  import MoodPanel from './gameCanvas/MoodPanel.svelte';
  import { moodToggle } from './gameCanvas/moodToggle.svelte';
  import ArmorPanel from './gameCanvas/ArmorPanel.svelte';
  import { armorToggle } from './gameCanvas/armorToggle.svelte';
  import { debugMode } from '$lib/stores/uiPrefs';
  import HoverTip from './HoverTip.svelte';
  import { createPinnable } from '../util/pinnable.svelte';

  // Hover panel that shows the creature's full flavour text — the header/blurb only show a
  // truncated teaser, so hovering the name or the blurb reads out the whole line.
  const flavorPin = createPinnable<string>();

  // `embedded`: render as an in-flow flex item instead of self-anchoring to the canvas.
  // Used when a parent (e.g. the building row, which also hosts the fuel-settings panel)
  // already owns the absolute positioning and lays the card out in a flex row.
  // `body`: optional rich/colour-coded body snippet rendered in place of `model.lines` (e.g. the
  // building card passes <BuildingInfo>). Lets a type supply structured content while still getting the
  // shared shell — header, status, dismiss, the button column, health/mood pop-ups.
  let {
    model,
    embedded = false,
    body
  }: { model: SelectedEntityModel; embedded?: boolean; body?: import('svelte').Snippet } = $props();

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
    <!-- Text layer: lifted above the dimmed background/frame (which lives on .tile-hud::before) so the
         info font stays readable at night/in fog while the card chrome still darkens with the scene. -->
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
      {#if model.pos || model.posMeta}
        <div class="pawn-pos">
          {#if model.pos}<span>pos ({model.pos.x},{model.pos.y})</span>{/if}
          {#if model.posMeta}<span class="pawn-pos-meta">{model.posMeta}</span>{/if}
        </div>
      {/if}
    </div>
  </div>

  {#if model.health}
    <!-- NT-U1: HEALTH opens as a pop-up above the card (like the campfire fuel panel). -->
    <HealthPanel health={model.health} open={healthToggle.open} />
  {/if}

  {#if model.moodModel}
    <!-- §M MOOD opens as a pop-up above the card, mirroring HEALTH. -->
    <MoodPanel mood={model.moodModel} open={moodToggle.open} />
  {/if}

  {#if model.armor && $debugMode}
    <!-- GEAR opens the creature's natural-armour map above the card, mirroring HEALTH. Debug-only. -->
    <ArmorPanel armor={model.armor} open={armorToggle.open} />
  {/if}

  {#if (model.buttons && model.buttons.length > 0) || ((model.health || model.moodModel || model.armor) && model.selected)}
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
          <span class="hud-btn-lbl">HEALTH</span>
        </button>
      {/if}
      {#if model.moodModel && model.selected}
        <!-- MOOD button — only on the SELECTED card; the pop-up shows on hover when the shared
             toggle is on. Warn-tinted when mood is falling (target below the current value). -->
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
        <!-- GEAR button — only on the SELECTED card; opens the creature's natural-armour map. Debug-only. -->
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
    /* z-index 10 (not 5) so the card sits ABOVE the WorldEffectsLayer weather overlay (z-index 5),
       matching the GameCanvas hover HUD (.tile-hud, z-index 10). At z-index 5 the weather canvas —
       later in DOM, same root stacking context — painted over the on-click card, so fog/precip
       washed it more than the rest of the UI. */
    z-index: 10;
    /* No filter on the wrapper: the card's BACKGROUND + frame are dimmed by #ambient-tint (on
       .tile-hud::before) so the chrome darkens with the scene like every other panel, while the TEXT
       layer (.tile-hud-body) and the buttons (.btn-col) are lifted by #ambient-tint-legible so the font
       reads ABOVE the day/night+weather overlay. (The card is literal-coloured, not token-based, so it
       needs these two filters instead of the panels' bg/font token split.) */
  }
  /* In-flow variant: the parent owns positioning (and sizes itself to this card, which a
     sibling absolutely-positioned panel like fuel-settings depends on for its width). */
  .tile-hud-wrap--embedded {
    position: static;
    bottom: auto;
    left: auto;
    /* Embedded cards (building, stockpile zone) pair the info box with a button column the parent row
       lays out. Stretch both to a shared height so the box's bottom border lines up with the button
       column's bottom even when the buttons are taller than the card's content (the short zone card). */
    align-items: stretch;
  }
  .tile-hud {
    position: relative;
    /* Background + golden frame live on ::before below (dimmed via #ambient-tint); the box itself is
       transparent so the text layer (.tile-hud-body) can be lifted separately. A transparent 1px border
       preserves the exact box-model layout. */
    background: transparent;
    border: 1px solid transparent;
    color: #a07840;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.25;
    padding: 2px 7px;
    pointer-events: auto;
  }
  /* Dimmed chrome layer: card background + inset golden frame, darkened with the day/night+weather
     scene by #ambient-tint (matching the panels). The inset box-shadow keeps the frame just inside the
     edge, away from the filter's fringing boundary, so it stays solid gold on all sides. */
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
  /* Lifted text layer: the card's font sits above the dimmed chrome and above the overlay, hue-shifted
     but brightness-preserved by #ambient-tint-legible, so it stays readable at night / in fog. */
  .tile-hud-body {
    position: relative;
    z-index: 1;
    filter: url(#ambient-tint-legible);
  }
  /* NT-U3: fixed-width skeleton, identical for every object type, so long descriptions
     wrap inside the box instead of stretching it across the map. Every info panel
     (pawn/mob/resource/item/building, hover or selected) uses exactly this, so none is
     narrower or wider than another. Sized so the header (name + a long state tag like
     "[Moving To Resource]") stays on one line without wrapping. */
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
    /* Keep the name + state tag on a single line (the box is sized to fit them). */
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
  /* Truncated flavour teaser — one line, ellipsised; hovering it (or the name) opens the full text in a
     HoverTip. Generous top/bottom margin gives it an empty line of breathing room from the header above
     and the stats below. */
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
  /* Full flavour text inside the hover panel — no truncation, wraps to the panel width. */
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
  /* ── Button column (NT-U2: outside the box, to the right) ────── */
  .btn-col {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex-shrink: 0;
    pointer-events: auto;
  }
  /* Buttons use the same split as the card box: background + border on ::before (dimmed with the scene
     via #ambient-tint), the LABEL lifted above the overlay (.hud-btn-lbl, #ambient-tint-legible) so it
     stays readable while the chip's chrome darkens like every other panel. */
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
  /* HEALTH button tint when the entity is damaged (overridden by --active when open). */
  .hud-btn--warn:not(.hud-btn--active) {
    color: #ee8844;
  }
  .hud-btn--warn:not(.hud-btn--active)::before {
    box-shadow: inset 0 0 0 1px #b5532a;
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
    font-size: 12px;
    white-space: normal;
    overflow-wrap: break-word;
  }
  /* Growth maturity readout — colour set inline to match the hover HUD's ramp. */
  .growth-line {
    font-size: 12px;
    margin-bottom: 2px;
  }
  /* ── Stats / bars ─────────────────────────────────────────────── */
  .pawn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    align-items: baseline;
    font-size: 12px;
  }
  /* Keep each label+value glued together so a wrap never splits "STR" from its number. */
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
  /* Task-progress StatBar row — slight gap so it reads as part of the bar stack above. */
  .job-progress {
    margin-top: 1px;
  }
  .tile-hud--selected {
    color: #e8c870;
  }
  /* Selected card: brighter frame + slightly darker fill, on the dimmed chrome layer. */
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
  /* Sex + age riding alongside the position — plain muted tag, matching the mob card's tag line. */
  .pawn-pos-meta {
    color: #8a7040;
  }
</style>
