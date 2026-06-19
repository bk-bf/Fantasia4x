<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { getCreatureById } from '$lib/game/core/Creatures';
  import type { Mob, LimbState } from '$lib/game/core/types';
  import FollowButton from '../UI/FollowButton.svelte';
  import SearchBar from '../UI/SearchBar.svelte';
  import { persisted, persist } from '$lib/stores/uiPersist';

  let mobs = $derived(($gameState.mobs ?? []).filter((m) => m.state !== 'Corpse'));
  let corpses = $derived(($gameState.mobs ?? []).filter((m) => m.state === 'Corpse'));

  // Live name/type/state search (the Crafting tab's filter, shared via SearchBar).
  let query = $state('');
  let term = $derived(query.trim().toLowerCase());
  let filteredMobs = $derived(
    term
      ? mobs.filter((m) => {
          const name = (getCreatureById(m.creatureId)?.name ?? m.creatureId).toLowerCase();
          const kind = m.entityClass === 'mob' ? 'hostile' : 'neutral';
          return (
            name.includes(term) ||
            kind.includes(term) ||
            (m.state ?? '').toLowerCase().includes(term)
          );
        })
      : mobs
  );

  let hostileCount = $derived(mobs.filter((m) => m.entityClass === 'mob').length);
  let neutralCount = $derived(mobs.filter((m) => m.entityClass === 'animal').length);

  // Expansion is controlled ONLY by the ▸ caret (toggleExpand). Selecting / camera-focusing a mob
  // (row click, or selecting it on the map) must NOT auto-expand its health panel. Persisted so the
  // expanded row survives toggling the tab.
  let expandedId = $state<string | null>(persisted('entities.expanded', null));
  $effect(() => persist('entities.expanded', expandedId));

  function rgb(c: [number, number, number]): string {
    return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
  }

  function focus(m: Mob) {
    // Pan only (selectTile=false) — we select this specific mob by id, which the map canvas mirrors;
    // a tile-pick could grab a different entity sharing the tile.
    uiState.focusMapOn(m.x, m.y, false);
    uiState.selectMob(m.id);
  }

  function bloodPct(m: Mob): number {
    if (!m.maxBloodVolume || m.maxBloodVolume <= 0) return 100;
    return Math.round(((m.bloodVolume ?? m.maxBloodVolume) / m.maxBloodVolume) * 100);
  }

  function bloodColor(v: number): string {
    if (v >= 80) return 'var(--pos)';
    if (v >= 60) return 'var(--text-dim)';
    if (v >= 40) return 'var(--accent-hi)';
    return 'var(--neg)';
  }

  function worstLimb(m: Mob): { name: string; health: number } | null {
    if (!m.limbs || m.limbs.length === 0) return null;
    let worst: LimbState | null = null;
    for (const l of m.limbs) {
      if (l.isMissing) return { name: l.id.replace('_', ' '), health: 0 };
      if (!worst || l.health < worst.health) worst = l;
    }
    if (!worst) return null;
    return { name: worst.id.replace('_', ' '), health: worst.health };
  }

  function limbColor(h: number): string {
    if (h <= 0) return 'var(--neg)';
    if (h < 25) return 'var(--neg)';
    if (h < 50) return 'var(--accent-hi)';
    if (h < 75) return 'var(--text-dim)';
    return 'var(--pos)';
  }

  function painPct(m: Mob): number {
    // Mobs don't track pain yet; derive from health loss as a proxy.
    if (!m.maxHealth || m.maxHealth <= 0) return 0;
    return Math.round(((m.maxHealth - m.health) / m.maxHealth) * 100);
  }

  function painColor(v: number): string {
    if (v >= 80) return 'var(--neg)';
    if (v >= 55) return 'var(--accent-hi)';
    if (v >= 30) return 'var(--text-dim)';
    return 'var(--pos)';
  }

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
  }
</script>

<div class="entity-screen">
  <div class="screen-hdr">
    | LIVE ENTITIES &nbsp;<span class="dim"
      >{hostileCount} hostile · {neutralCount} neutral · {corpses.length} corpses</span
    >
    <div class="hdr-tools">
      <SearchBar bind:value={query} placeholder="search entities…" cacheKey="entities" />
      <button class="hdr-btn" onclick={() => uiState.setScreen('main')}>BACK</button>
    </div>
  </div>

  {#if mobs.length === 0}
    <div class="empty">No creatures roaming the map right now.</div>
  {:else if filteredMobs.length === 0}
    <div class="empty">No entities match "{query}".</div>
  {:else}
    <div class="table">
      <!-- Header -->
      <div class="table-hdr">
        <span class="col-name">ENTITY</span>
        <span class="col-type">TYPE</span>
        <span class="col-blood">BLOOD</span>
        <span class="col-limb">WORST LIMB</span>
        <span class="col-pain">PAIN</span>
        <span class="col-state">STATE</span>
        <span class="col-pos">POS</span>
      </div>

      {#each filteredMobs as m (m.id)}
        {@const def = getCreatureById(m.creatureId)}
        {@const bp = bloodPct(m)}
        {@const wl = worstLimb(m)}
        {@const pp = painPct(m)}
        {@const expanded = expandedId === m.id}
        <div class="table-row" class:expanded>
          <div class="row-line">
            <button class="row-toggle" onclick={() => toggleExpand(m.id)} title="health details">
              {expanded ? '▾' : '▸'}
            </button>
            <button class="row-main" onclick={() => focus(m)} title="jump camera to entity">
              <span class="col-name">
                <span class="glyph" style="color: {def ? rgb(def.fg) : 'var(--text-dim)'}"
                  >{m.entityClass === 'mob' ? '✦' : '◆'}</span
                >
                <span class="ename">{def?.name ?? m.creatureId}</span>
              </span>
              <span class="col-type col-type--{m.entityClass}"
                >{m.entityClass === 'mob' ? 'hostile' : 'neutral'}</span
              >
              <span class="col-blood" style="color:{bloodColor(bp)}">{bp}%</span>
              <span
                class="col-limb"
                style="color:{wl ? limbColor(wl.health) : 'var(--text-muted)'}"
              >
                {wl ? `${wl.name} ${Math.round(wl.health)}%` : '—'}
              </span>
              <span class="col-pain" style="color:{painColor(pp)}">{pp}%</span>
              <span class="col-state">{m.state}</span>
              <span class="col-pos">({m.x},{m.y})</span>
            </button>
          </div>

          {#if expanded}
            <div class="row-expand">
              <div class="expand-actions">
                <FollowButton
                  isActive={$uiState.cameraFollowMobId === m.id}
                  onToggle={() => {
                    const isFollowing = $uiState.cameraFollowMobId === m.id;
                    uiState.setFollowMob(isFollowing ? null : m.id);
                  }}
                />
              </div>
              {#if m.limbs && m.limbs.length > 0}
                <div class="expand-limbs">
                  {#each m.limbs as limb}
                    <div class="expand-limb">
                      <span class="expand-limb-name">{limb.id.replace('_', ' ')}</span>
                      <span class="expand-limb-hp" style="color:{limbColor(limb.health)}">
                        {limb.isMissing ? 'MISSING' : `${Math.round(limb.health)}%`}
                      </span>
                      {#if limb.bleedRate && limb.bleedRate > 0}
                        <span class="expand-limb-bleed">▼{limb.bleedRate.toFixed(1)}</span>
                      {/if}
                    </div>
                    {#if limb.parts && limb.parts.length > 0}
                      <div class="expand-parts">
                        {#each limb.parts as part}
                          <div
                            class="expand-part"
                            class:damaged={part.isMissing ||
                              part.health < part.maxHp ||
                              part.injuries.length > 0}
                          >
                            <span
                              >{part.id
                                .replace(/([A-Z])/g, ' $1')
                                .toLowerCase()
                                .trim()}</span
                            >
                            <span
                              style="color:{part.isMissing
                                ? 'var(--neg)'
                                : limbColor((part.health / part.maxHp) * 100)}"
                            >
                              {part.isMissing
                                ? 'MISSING'
                                : `${Math.round((part.health / part.maxHp) * 100)}%`}
                            </span>
                            {#if part.injuries.length > 0}
                              <span class="expand-part-badges">
                                {#each part.injuries as injury}
                                  <span class="part-badge" title="{injury.severity} {injury.type}"
                                    >{injury.type.toUpperCase()} · {injury.severity}</span
                                  >
                                {/each}
                              </span>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .entity-screen {
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    display: flex;
    flex-direction: column;
  }
  .screen-hdr {
    padding: 5px 10px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--border-hi);
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }
  .screen-hdr .dim {
    color: var(--text-muted);
    letter-spacing: 0;
  }
  .hdr-tools {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .hdr-btn {
    padding: 2px 8px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    cursor: pointer;
  }
  .hdr-btn:hover {
    color: var(--text);
    border-color: var(--border-hi);
  }
  .empty {
    padding: 16px 12px;
    color: var(--text-muted);
  }

  .table {
    padding: 4px 8px 12px;
    display: flex;
    flex-direction: column;
  }
  .table-hdr {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 2fr 1fr 1.2fr 1fr;
    gap: 6px;
    padding: 3px 6px;
    color: var(--text-muted);
    font-size: 10px;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
  }
  .table-row {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--border);
    background: var(--bg-panel);
  }
  .table-row.expanded {
    border-bottom-color: var(--border-hi);
  }
  .row-line {
    display: flex;
    align-items: stretch;
  }
  .row-toggle {
    flex-shrink: 0;
    width: 20px;
    background: transparent;
    border: none;
    color: var(--text-muted, #777);
    cursor: pointer;
    font-size: 10px;
    font-family: 'Courier New', monospace;
  }
  .row-toggle:hover {
    color: var(--text);
  }
  .row-main {
    flex: 1;
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 2fr 1fr 1.2fr 1fr;
    gap: 6px;
    padding: 3px 6px;
    align-items: baseline;
    background: transparent;
    border: none;
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    cursor: pointer;
    text-align: left;
  }
  .row-main:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .col-name {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .glyph {
    font-size: 11px;
  }
  .ename {
    color: var(--text);
  }
  .col-type {
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }
  .col-type--mob {
    color: var(--neg);
  }
  .col-type--animal {
    color: var(--pos);
  }
  .col-blood,
  .col-limb,
  .col-pain,
  .col-state,
  .col-pos {
    font-variant-numeric: tabular-nums;
  }
  .col-pos {
    color: var(--text-muted);
  }

  .row-expand {
    padding: 4px 6px 6px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .expand-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .act-btn {
    padding: 1px 6px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    cursor: pointer;
  }
  .act-btn:hover {
    color: var(--text);
    border-color: var(--border-hi);
  }
  .expand-limbs {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding-left: 8px;
    border-left: 1px solid var(--border);
  }
  .expand-limb {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 1px 0;
  }
  .expand-limb-name {
    color: var(--text-muted);
    font-size: 10px;
    min-width: 60px;
  }
  .expand-limb-hp {
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    min-width: 36px;
  }
  .expand-limb-bleed {
    color: var(--neg);
    font-size: 10px;
  }
  .expand-parts {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding-left: 8px;
    padding-bottom: 2px;
  }
  .expand-part {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 10px;
    opacity: 0.5;
  }
  .expand-part.damaged {
    opacity: 1;
  }
  .expand-part-badges {
    display: flex;
    gap: 3px;
  }
  .part-badge {
    font-size: 9px;
    padding: 0 3px;
    border-radius: 2px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    color: var(--neg);
  }
</style>
