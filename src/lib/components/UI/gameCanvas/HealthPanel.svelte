<!--
  HealthPanel — pop-up body-health readout for a selected pawn/mob (NT-U1). Mirrors
  BuildingFuelPanel: it floats above the info card and the parent owns the open/close toggle
  (passed as `open`) and the HEALTH button that flips it. Read-only — it just renders the
  HealthModel built in selectionCard.ts (blood + pain for the whole body, then every damaged limb
  with its bleed rate and injured sub-parts' HP + wounds, then conditions).
-->
<script lang="ts">
  import type { HealthModel } from '$lib/components/UI/SelectedEntityCard.svelte';
  import { healthPctColor, bloodColor, painColor } from './healthColors';
  import { TURNS_PER_DAY } from '$lib/game/services/EnvironmentService';

  let { health, open = false }: { health: HealthModel | undefined; open?: boolean } = $props();

  // Scrollbar hidden until actively scrolling (mirrors ChroniclePanel/ResourceSidebar) — a `.scrolling`
  // flag set on scroll and cleared after a beat reveals/hides the thin thumb.
  let scrolling = $state(false);
  let scrollTimer: ReturnType<typeof setTimeout>;
  function onScroll() {
    scrolling = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => (scrolling = false), 700);
  }

  // bleedRate is blood/REAL-second; 1 in-game day = TURNS_PER_DAY real seconds → 24 in-game hours.
  // So in-game hours to bleed out = (blood ÷ bleedRate) × 24 / TURNS_PER_DAY.
  const HOURS_PER_BLOODSEC = 24 / TURNS_PER_DAY;
  function bleedOutLabel(blood: number, bleedRate: number): string {
    const h = (blood / bleedRate) * HOURS_PER_BLOODSEC;
    return h >= 10 ? `(~${Math.round(h)}h to 0)` : `(~${h.toFixed(1)}h to 0)`;
  }

  const damaged = $derived(
    !!health &&
      (health.limbs.length > 0 ||
        (health.pain ?? 0) > 0 ||
        (health.coldExposure ?? 0) > 0 ||
        (health.heatExposure ?? 0) > 0 ||
        (!!health.blood && health.blood.current < health.blood.max))
  );
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="health-panel"
  class:open
  class:scrolling
  onmousedown={(e) => e.stopPropagation()}
  onmouseup={(e) => e.stopPropagation()}
  onwheel={(e) => e.stopPropagation()}
  onscroll={onScroll}
>
  <div class="health-hdr">◈ HEALTH</div>
  {#if health}
    {#if health.blood}
      <div class="hp-row">
        <span class="hp-k">Blood</span>
        <span style="color:{bloodColor((health.blood.current / health.blood.max) * 100)}"
          >{Math.round(health.blood.current)}/{Math.round(health.blood.max)} ({Math.round(
            (health.blood.current / health.blood.max) * 100
          )}%)</span
        >
        {#if health.bleedRate}
          <span
            class="hp-bleed-eta"
            title="estimated in-game time until blood reaches 0 at the current bleed rate"
            >▼ {health.bleedRate.toFixed(1)}/s · {bleedOutLabel(
              health.blood.current,
              health.bleedRate
            )}</span
          >
        {/if}
      </div>
    {/if}
    {#if (health.coldExposure ?? 0) > 0}
      <div class="hp-row">
        <span class="hp-k">Cold</span>
        <span style="color:#4fc3f7">{Math.round(health.coldExposure ?? 0)}%</span>
      </div>
    {/if}
    {#if (health.heatExposure ?? 0) > 0}
      <div class="hp-row">
        <span class="hp-k">Heat</span>
        <span style="color:#fb8c00">{Math.round(health.heatExposure ?? 0)}%</span>
      </div>
    {/if}
    {#if (health.pain ?? 0) > 0}
      <div class="hp-row">
        <span class="hp-k">Pain</span>
        <span style="color:{painColor(health.pain ?? 0)}">{Math.round(health.pain ?? 0)}%</span>
      </div>
    {/if}
    {#if health.combat && health.combat.length > 0}
      <div class="hp-combat">
        {#each health.combat as c (c.label)}
          <span class="hp-combat-item" title={c.title}>
            <span class="hp-k-inline">{c.label}</span>
            <span class="hp-combat-v">{c.value}</span>
          </span>
        {/each}
      </div>
    {/if}

    {#if !damaged}
      <div class="hp-ok">no damage</div>
    {:else}
      {#each health.limbs as limb (limb.label)}
        <div class="hp-limb">
          <div class="hp-limb-hdr">
            <span class="hp-limb-name">{limb.label}</span>
            {#if limb.missing}
              <span style="color:{healthPctColor(0, { missing: true })}">missing</span>
            {:else}
              <span style="color:{healthPctColor(limb.health)}">{Math.round(limb.health)}%</span>
              {#if limb.bleedRate && limb.bleedRate > 0}
                <span class="hp-bleed">▼ {limb.bleedRate.toFixed(1)} blood/s</span>
              {/if}
            {/if}
          </div>
          {#each limb.parts as part (part.label)}
            <div class="hp-part" class:hp-gone={part.health <= 0 || part.missing}>
              <span class="hp-part-name">{part.label}</span>
              <span
                class="hp-part-hp"
                style="color:{healthPctColor((part.health / part.maxHp) * 100, {
                  missing: part.missing
                })}">{Math.round(part.health)}/{Math.round(part.maxHp)}</span
              >
              {#if part.bleedRate && part.bleedRate > 0}
                <span class="hp-bleed" title="this sub-part's bleed"
                  >▼ {part.bleedRate.toFixed(1)}</span
                >
              {/if}
              {#each part.wounds as w (w.text)}
                <span class="hp-wound" class:hp-warn={w.warn}
                  >· {w.text}{#if w.treated}<span class="hp-treated" title="tended by a caretaker"
                      >+</span
                    >{/if}</span
                >
              {/each}
              {#if part.missing && part.wounds.length === 0}
                <span class="hp-wound">· gone</span>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
    {/if}
  {/if}
</div>

<style>
  /* Pop-up framing copied from BuildingFuelPanel so the two HUD pop-ups match. */
  .health-panel {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    width: 300px;
    box-sizing: border-box;
    opacity: 0;
    transform: translateY(6px);
    overflow-y: auto;
    max-height: 0;
    pointer-events: none;
    background: rgba(13, 9, 3, 0.98);
    border: 1px solid #7a5e28;
    color: #c0a040;
    font-family: 'Courier New', monospace;
    font-size: 9px;
    line-height: 1.5;
    z-index: 20;
    /* Scrollbar hidden until actively scrolling (the `.scrolling` flag reveals the thin thumb), so the
       bar never clutters the readout when it isn't needed. Gutter reserved so rows don't reflow. */
    scrollbar-gutter: stable;
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
    transition:
      opacity 140ms ease,
      transform 140ms ease,
      max-height 200ms ease,
      scrollbar-color 0.3s ease;
  }
  .health-panel.scrolling {
    scrollbar-color: #7a5e28 transparent;
  }
  .health-panel::-webkit-scrollbar {
    width: 8px;
  }
  .health-panel::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 4px;
  }
  .health-panel.scrolling::-webkit-scrollbar-thumb {
    background: #7a5e28;
  }
  .health-panel.open {
    opacity: 1;
    transform: translateY(0);
    max-height: 360px;
    pointer-events: all;
    padding: 5px 7px;
  }
  .health-hdr {
    color: #f0c060;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-bottom: 4px;
  }
  .hp-row {
    display: flex;
    gap: 6px;
  }
  .hp-k {
    color: #7a6030;
    display: inline-block;
    min-width: 42px;
  }
  .hp-ok {
    color: #68a030;
    padding-left: 2px;
  }
  /* Combat readiness sits with blood/pain in the summary block, set off by a faint rule.
     Hit / Dodge / Crit share one row. */
  .hp-combat {
    margin-top: 3px;
    padding-top: 2px;
    border-top: 1px solid rgba(122, 94, 40, 0.4);
    display: flex;
    gap: 14px;
  }
  .hp-combat-item {
    display: inline-flex;
    gap: 5px;
    align-items: baseline;
  }
  .hp-k-inline {
    color: #7a6030;
  }
  .hp-combat-v {
    color: #d0a850;
  }
  .hp-limb {
    margin-top: 3px;
    border-top: 1px solid rgba(122, 94, 40, 0.4);
    padding-top: 2px;
  }
  .hp-limb-hdr {
    color: #d0a850;
    display: flex;
    gap: 6px;
    align-items: baseline;
  }
  .hp-limb-name {
    color: #e0b860;
    min-width: 48px;
  }
  .hp-bleed {
    color: #ee8844;
  }
  .hp-bleed-eta {
    color: #ee5544;
    white-space: nowrap;
  }
  .hp-part {
    padding-left: 10px;
    color: #a08840;
  }
  .hp-part-name {
    color: #b89850;
    text-transform: capitalize;
  }
  .hp-part-hp {
    color: #8a7036;
    margin-left: 4px;
  }
  .hp-wound {
    margin-left: 4px;
  }
  .hp-warn {
    color: #ee8844;
  }
  /* A tended wound: a small green `+` after the wound text — at a glance, "a caretaker has treated this". */
  .hp-treated {
    color: #68a030;
    font-weight: bold;
    margin-left: 2px;
  }
  /* A destroyed sub-part (0 HP) is gone — grey the whole row so it reads as lost, not active. */
  .hp-gone,
  .hp-gone .hp-part-name,
  .hp-gone .hp-part-hp,
  .hp-gone .hp-wound,
  .hp-gone .hp-warn {
    color: var(--text-dim);
    opacity: 0.55;
  }
</style>
