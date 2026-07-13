<script lang="ts">
  import { recentActivity, clearActivityLog } from '$lib/stores/Log';
  import { uiState } from '$lib/stores/uiState';
  import { hideSidebars, chronicleMinimized } from '$lib/stores/uiPrefs';
  import type { ActivityLogEntry } from '$lib/game/core/Events';
  import CombatBreakdown from './CombatBreakdown.svelte';
  import HoverTip from './HoverTip.svelte';
  import ScrollArea from './ScrollArea.svelte';

  const TYPE_ABBR: Record<string, string> = {
    work: 'WRK',
    building: 'BLD',
    crafting: 'CRF',
    event: 'EVT',
    pawn_action: 'PWN',
    research: 'RSH',
    exploration: 'EXP',
    system: 'SYS',
    combat: 'CBT',
    entity: 'ENT',
    social: 'SOC',
    weather: 'WTR',
    season: 'SEA'
  };

  // Readable, in-world category names for the hover panel (the compact row keeps the
  // 3-letter tag; the tooltip speaks the chronicler's language).
  const CATEGORY_LABEL: Record<string, string> = {
    work: 'Labour',
    building: 'Construction',
    crafting: 'Crafting',
    event: 'Event',
    pawn_action: 'Colonist',
    research: 'Discovery',
    exploration: 'Expedition',
    system: 'Chronicle',
    combat: 'Battle',
    entity: 'Wildlife',
    social: 'Company',
    weather: 'Weather',
    season: 'Season'
  };

  function categoryLabel(e: ActivityLogEntry) {
    return CATEGORY_LABEL[e.type] ?? 'Chronicle';
  }

  const SEV_CLASS: Record<string, string> = {
    info: '',
    success: 'sev-ok',
    warning: 'sev-warn',
    error: 'sev-err',
    critical: 'sev-crit'
  };

  function abbr(e: ActivityLogEntry) {
    return TYPE_ABBR[e.type] ?? '???';
  }

  let expandedId: string | null = null;

  // SOCIAL-LAYER: an assembled conversation carried in `details.lines` — expandable like combat.
  function socialLines(entry: ActivityLogEntry): { name: string; text: string }[] {
    if (entry.type !== 'social') return [];
    const lines = entry.details?.lines;
    return Array.isArray(lines) ? lines : [];
  }

  function handleClick(entry: ActivityLogEntry) {
    // Toggle combat breakdown expansion
    if (entry.type === 'combat' && entry.combatBreakdown && entry.combatBreakdown.length > 0) {
      expandedId = expandedId === entry.id ? null : entry.id;
    }
    // Toggle conversation expansion
    if (socialLines(entry).length > 0) {
      expandedId = expandedId === entry.id ? null : entry.id;
    }
    // Focus map on the event location. If the entry names an entity we select it by id below, so pan
    // only (selectTile=false) to avoid the tile-pick overriding that id; otherwise let the jump
    // select-by-tile (click-here semantics) so the location still gets a highlight.
    const willSelectEntity = !!(entry.entityIds && entry.entityIds.length > 0);
    if (entry.focusX !== undefined && entry.focusY !== undefined) {
      uiState.focusMapOn(entry.focusX, entry.focusY, !willSelectEntity);
    }
    // Select first entity involved
    if (willSelectEntity) {
      const firstId = entry.entityIds![0];
      // Heuristic: pawn IDs usually don't start with 'mob-'
      if (firstId.startsWith('mob-')) {
        uiState.selectMob(firstId);
      } else {
        uiState.selectPawn(firstId);
      }
    }
  }

  // Immersive hover panel (reuses the shared HoverTip styling) — replaces the old raw
  // `title` dump of ids / severity / pixel coords that read like a debug print.
  let hoverEntry: ActivityLogEntry | null = null;
  let hoverX = 0;
  let hoverY = 0;
  function onEntryEnter(e: MouseEvent, entry: ActivityLogEntry) {
    hoverEntry = entry;
    hoverX = e.clientX;
    hoverY = e.clientY;
  }
  function onEntryMove(e: MouseEvent) {
    if (hoverEntry) {
      hoverX = e.clientX;
      hoverY = e.clientY;
    }
  }
  function onEntryLeave() {
    hoverEntry = null;
  }
</script>

<aside class="panel" class:transparent={$hideSidebars} class:collapsed={$chronicleMinimized}>
  {#if $chronicleMinimized}
    <button
      class="restore-btn"
      title="Expand chronicle"
      aria-label="Expand chronicle"
      on:click={() => chronicleMinimized.set(false)}>‹</button
    >
  {:else}
    <div class="section-hdr">
      <span>| CHRONICLE</span>
      <span class="hdr-btns">
        <button
          class="hdr-icon-btn"
          title="Minimise chronicle"
          aria-label="Minimise chronicle"
          on:click={() => chronicleMinimized.set(true)}>›</button
        >
        <button
          class="clear-btn"
          title="Clear chronicle"
          aria-label="Clear chronicle"
          disabled={$recentActivity.length === 0}
          on:click={clearActivityLog}>✕</button
        >
      </span>
    </div>

    <ScrollArea class="log-list">
      {#if $recentActivity.length > 0}
        {#each $recentActivity as entry (entry.id)}
          <div
            class="entry {SEV_CLASS[entry.severity] || ''} {entry.focusX !== undefined
              ? 'clickable'
              : ''}"
            class:expanded={expandedId === entry.id}
            on:click={() => handleClick(entry)}
            on:mouseenter={(e) => onEntryEnter(e, entry)}
            on:mousemove={onEntryMove}
            on:mouseleave={onEntryLeave}
            role="button"
            tabindex="0"
            on:keydown={(e) => e.key === 'Enter' && handleClick(entry)}
          >
            <span class="turn">T{entry.turn}</span>
            <span class="type">{abbr(entry)}</span>
            <span class="msg">{entry.action}{entry.result ? ' · ' + entry.result : ''}</span>
          </div>
          {#if expandedId === entry.id && entry.combatBreakdown && entry.combatBreakdown.length > 0}
            <CombatBreakdown turns={entry.combatBreakdown} />
          {/if}
          {#if expandedId === entry.id && socialLines(entry).length > 0}
            <div class="convo">
              {#each socialLines(entry) as line}
                <div class="convo-line"><span class="convo-who">{line.name}:</span> “{line.text}”</div>
              {/each}
            </div>
          {/if}
        {/each}
      {/if}
    </ScrollArea>
  {/if}

  {#if hoverEntry}
    <HoverTip x={hoverX} y={hoverY}>
      <div class="tip-head">
        <span class="tip-cat">{categoryLabel(hoverEntry)}</span>
        <span class="tip-turn">Turn {hoverEntry.turn}</span>
      </div>
      <div class="tip-action" class:grave={SEV_CLASS[hoverEntry.severity] === 'sev-crit'}>
        {hoverEntry.action}
      </div>
      {#if hoverEntry.result}<div class="tip-result">{hoverEntry.result}</div>{/if}
      {#if hoverEntry.location}<div class="tip-loc">at {hoverEntry.location}</div>{/if}
      {#if hoverEntry.combatBreakdown && hoverEntry.combatBreakdown.length > 0}
        <div class="tip-hint">
          {hoverEntry.combatBreakdown.length} blows traded · click to relive the exchange
        </div>
      {/if}
      {#if socialLines(hoverEntry).length > 0}
        <div class="tip-hint">click to hear the exchange</div>
      {/if}
    </HoverTip>
  {/if}
</aside>

<style>
  .panel {
    height: 100%;
    width: 100%;
    background: var(--bg-panel);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* "Hide sidebars" mode (top-bar settings): float fully transparently over the map — no backdrop,
     so the viewport stays unobstructed. Warm ambient-tinted text, crispened by a thin 1px black
     outline and popped by a heavy dark drop shadow under the glyphs. The aside box is click-through
     (set in +page); the entries below re-enable pointer-events so they stay hoverable (HoverTip).
     Mirrors ResourceSidebar. */
  .panel.transparent {
    background: transparent;
    text-shadow:
      1px 0 0 #000,
      -1px 0 0 #000,
      0 1px 0 #000,
      0 -1px 0 #000,
      0 0 12px rgba(0, 0, 0, 0.95),
      0 0 20px rgba(0, 0, 0, 0.9),
      0 2px 4px rgba(0, 0, 0, 1),
      0 4px 6px rgba(0, 0, 0, 1),
      0 6px 10px rgba(0, 0, 0, 1),
      0 8px 16px rgba(0, 0, 0, 0.95),
      0 10px 24px rgba(0, 0, 0, 0.9);
  }
  .panel.transparent .section-hdr {
    background: transparent;
    border-bottom: none;
  }
  .panel.transparent .entry {
    border-bottom: none;
    /* Re-enable pointer events on entries so they stay hoverable (HoverTip) / clickable over the
       click-through aside; the empty gaps below still pass through to the map. */
    pointer-events: auto;
    /* A resting highlight behind every line — the same warm hover tint at ~1/3 strength, but faded
       to transparent at the left/right edges so it's a soft band, not a hard box. */
    background: linear-gradient(
      to right,
      transparent,
      color-mix(in srgb, var(--bg-hover) 33%, transparent) 10%,
      color-mix(in srgb, var(--bg-hover) 33%, transparent) 90%,
      transparent
    );
  }
  /* Hover still brightens to the full hover intensity (wins on specificity over the resting band). */
  .panel.transparent .entry:hover {
    background: var(--bg-hover);
  }
  /* Nested combat-breakdown rows are siblings of .entry (not .entry themselves), so the click-through
     aside leaves them with no pointer-events — re-enable so they stay hoverable like the parent lines
     (their own .line:hover then solidifies the background). */
  .panel.transparent :global(.breakdown) {
    pointer-events: auto;
  }
  /* Every control in the floating panel stays clickable over the click-through aside — the minimise
     (.hdr-icon-btn), clear (.clear-btn) and the collapsed restore arrow (.restore-btn). Listing
     buttons wholesale (not one class at a time) is what stops a new header button silently going dead
     in cinematic mode. */
  .panel.transparent button {
    pointer-events: auto;
  }

  .section-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 6px 3px 0;
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    flex-shrink: 0;
  }

  .hdr-btns {
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }

  .clear-btn,
  .hdr-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    padding: 0;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-dim);
    font-family: inherit;
    font-size: 11px;
    line-height: 1;
    letter-spacing: 0;
    cursor: pointer;
  }

  .clear-btn:hover:not(:disabled) {
    color: var(--neg);
    border-color: var(--neg);
    background: var(--bg-hover);
  }

  .hdr-icon-btn:hover {
    color: var(--accent-hi);
    border-color: var(--border-hi);
    background: var(--bg-hover);
  }

  .clear-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  /* ── Collapsed strip (minimised) — a thin bar with just the restore arrow. The right-panel
     column is narrowed to match by +page.svelte (.right-panel.minimized). ── */
  .panel.collapsed {
    align-items: center;
    padding-top: 4px;
    gap: 6px;
  }
  .restore-btn {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--accent-hi);
    font-family: inherit;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
  }
  .restore-btn:hover {
    border-color: var(--border-hi);
    background: var(--bg-hover);
  }
  /* .log-list is the ScrollArea viewport (overflow + auto-hiding bar live in ScrollArea). */
  .panel :global(.log-list) {
    flex: 1;
    padding: 2px 0;
  }

  .entry {
    display: grid;
    grid-template-columns: 36px 28px 1fr;
    gap: 3px;
    padding: 2px 6px;
    border-bottom: 1px solid var(--border);
    line-height: 1.4;
  }

  .entry:hover {
    background: var(--bg-hover);
  }

  .turn {
    color: var(--text-dim);
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .type {
    color: var(--accent-hi);
    font-size: 10px;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .msg {
    color: var(--text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
  }

  /* severity overrides */
  .sev-ok .msg {
    color: var(--pos);
  }
  .sev-warn .msg {
    color: var(--accent-hi);
  }
  .sev-err .msg,
  .sev-crit .msg {
    color: var(--neg);
  }
  .sev-crit .type {
    color: var(--neg);
  }

  .clickable {
    cursor: pointer;
  }

  .clickable:hover {
    background: var(--bg-hover);
  }

  .expanded {
    background: rgba(212, 168, 64, 0.08);
  }

  .entry.expanded {
    border-bottom: none;
  }

  /* Immersive hover panel — slotted into the shared HoverTip, so these styles ride along
     under the parent's scope. */
  .tip-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 3px;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .tip-cat {
    color: var(--accent-hi);
  }
  .tip-turn {
    color: var(--text-muted);
  }
  .tip-action {
    color: var(--text);
  }
  .tip-action.grave {
    color: var(--neg);
  }
  .tip-result {
    color: var(--text-dim);
    margin-top: 2px;
  }
  .tip-loc {
    color: var(--text-muted);
    margin-top: 2px;
    font-style: italic;
  }
  /* SOCIAL-LAYER: expanded conversation lines under a social entry. */
  .convo {
    padding: 3px 8px 5px 40px;
    border-bottom: 1px solid var(--border);
    background: rgba(255, 255, 255, 0.02);
  }
  .convo-line {
    font-style: italic;
    opacity: 0.9;
    line-height: 1.5;
  }
  .convo-who {
    font-style: normal;
    color: var(--accent-hi);
  }

  .tip-hint {
    margin-top: 5px;
    padding-top: 4px;
    border-top: 1px solid var(--border);
    color: var(--accent-hi);
    font-size: 10px;
    opacity: 0.85;
  }
</style>
