<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { getCreatureById } from '$lib/game/core/Creatures';
  import type { Mob } from '$lib/game/core/types';
  import FollowButton from '../UI/FollowButton.svelte';

  let mobs = $derived(($gameState.mobs ?? []).filter((m) => m.state !== 'Corpse'));
  let corpses = $derived(($gameState.mobs ?? []).filter((m) => m.state === 'Corpse'));

  interface Group {
    creatureId: string;
    name: string;
    entityClass: string;
    fg: [number, number, number];
    count: number;
    members: Mob[];
  }

  let groups = $derived.by<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const m of mobs) {
      const def = getCreatureById(m.creatureId);
      if (!def) continue;
      let g = map.get(m.creatureId);
      if (!g) {
        g = {
          creatureId: m.creatureId,
          name: def.name,
          entityClass: def.entityClass,
          fg: def.fg,
          count: 0,
          members: []
        };
        map.set(m.creatureId, g);
      }
      g.count++;
      g.members.push(m);
    }
    return [...map.values()].sort((a, b) =>
      a.entityClass === b.entityClass ? b.count - a.count : a.entityClass < b.entityClass ? 1 : -1
    );
  });

  let hostileCount = $derived(mobs.filter((m) => m.entityClass === 'mob').length);
  let neutralCount = $derived(mobs.filter((m) => m.entityClass === 'animal').length);

  function rgb(c: [number, number, number]): string {
    return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
  }

  function focus(m: Mob) {
    uiState.focusMapOn(m.x, m.y);
    uiState.selectMob(m.id);
  }
</script>

<div class="entity-screen">
  <div class="screen-hdr">
    | LIVE ENTITIES &nbsp;<span class="dim"
      >{hostileCount} hostile · {neutralCount} neutral · {corpses.length} corpses</span
    >
    <button class="hdr-btn" onclick={() => uiState.setScreen('main')}>BACK</button>
  </div>

  {#if groups.length === 0}
    <div class="empty">No creatures roaming the map right now.</div>
  {:else}
    <div class="list">
      {#each groups as g (g.creatureId)}
        <div class="group">
          <div class="group-hdr">
            <span class="glyph" style="color: {rgb(g.fg)}"
              >{g.entityClass === 'mob' ? '✦' : '◆'}</span
            >
            <span class="name">{g.name}</span>
            <span class="tag {g.entityClass}"
              >{g.entityClass === 'mob' ? 'HOSTILE' : 'NEUTRAL'}</span
            >
            <span class="count">×{g.count}</span>
          </div>
          <div class="members">
            {#each g.members as m (m.id)}
              <div class="member-row">
                <button class="member" onclick={() => focus(m)} title="Focus on map">
                  <span class="state">{m.state}</span>
                  <span class="hp">{Math.round(m.health)}/{m.maxHealth}</span>
                  <span class="pos">({m.x},{m.y})</span>
                </button>
                <FollowButton
                  isActive={$uiState.cameraFollowMobId === m.id}
                  onToggle={() => {
                    const isFollowing = $uiState.cameraFollowMobId === m.id;
                    uiState.setFollowMob(isFollowing ? null : m.id);
                  }}
                />
              </div>
            {/each}
          </div>
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
  .hdr-btn {
    margin-left: auto;
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
  .list {
    padding: 4px 8px 12px;
  }
  .group {
    margin-bottom: 8px;
    border: 1px solid var(--border);
    background: var(--bg-panel);
  }
  .group-hdr {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }
  .group-hdr .glyph {
    font-size: 13px;
  }
  .group-hdr .name {
    color: var(--text);
    font-weight: bold;
  }
  .tag {
    padding: 0 4px;
    font-size: 10px;
    letter-spacing: 0.05em;
    border: 1px solid var(--border);
  }
  .tag.mob {
    color: var(--neg);
    border-color: var(--neg);
  }
  .tag.animal {
    color: var(--pos);
    border-color: var(--pos);
  }
  .group-hdr .count {
    margin-left: auto;
    color: var(--text-dim);
  }
  .members {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 4px;
  }
  .member-row {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .member {
    display: inline-flex;
    gap: 6px;
    padding: 2px 6px;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    cursor: pointer;
  }
  .member:hover {
    color: var(--text);
    border-color: var(--border-hi);
    background: var(--bg-hover);
  }
  .member .state {
    color: var(--accent-hi);
  }
  .member .pos {
    color: var(--text-muted);
  }
</style>
