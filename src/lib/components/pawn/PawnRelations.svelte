<script lang="ts">
  /** SOCIAL-LAYER §2: the RELATIONS tab — the pawn's blood ties (family) and its standing with
   *  every colonist it has a history with (stage badge, score bar, story tags, romance). */
  import type {
    GameState,
    KinKind,
    Pawn,
    PawnRelationship,
    RelationTag
  } from '$lib/game/core/types';
  import { STAGE_LABEL, otherOf, relationshipsOf, relKey } from '$lib/game/core/Social';
  import StatBar from '../UI/StatBar.svelte';
  import RelationBreakdown from './RelationBreakdown.svelte';

  export let pawn: Pawn;
  export let gameState: GameState;
  export let onSelect: (p: Pawn) => void = () => {};

  // Which relationship rows have their point breakdown expanded (keyed by canonical pair).
  let expanded = new Set<string>();
  function toggle(key: string) {
    expanded.has(key) ? expanded.delete(key) : expanded.add(key);
    expanded = expanded; // nudge Svelte reactivity
  }

  const KIN_LABEL: Record<KinKind, string> = {
    parent: 'Parent',
    child: 'Child',
    sibling: 'Sibling'
  };
  const TAG_LABEL: Record<RelationTag, string> = {
    grief_bond: 'shared grief',
    battle_forged: 'battle-forged',
    mentor: 'mentor',
    rescued_by: 'saved in the field'
  };
  const ROMANCE_LABEL: Record<string, string> = {
    interested: 'Interested',
    courting: 'Courting',
    partners: 'Partners',
    ex: 'Parted ways'
  };
  const STAGE_COLOR: Record<string, string> = {
    enemies: '#cc3322',
    rivals: '#ee8844',
    strangers: '#888888',
    acquaintances: '#a0b060',
    friends: '#68a030',
    best_friends: '#44cc66'
  };

  $: living = new Map((gameState.pawns ?? []).map((p) => [p.id, p]));
  $: fallen = new Map((gameState.deadPawns ?? []).filter((d) => d.id).map((d) => [d.id!, d]));

  $: kinRows = (pawn.kin ?? []).map((tie) => {
    const alive = living.get(tie.pawnId);
    const dead = fallen.get(tie.pawnId);
    return {
      kind: KIN_LABEL[tie.kind],
      name: alive?.name ?? (dead ? `${dead.name} †` : 'Lost to memory'),
      target: alive && alive.isAlive !== false ? alive : null
    };
  });

  $: rels = relationshipsOf(gameState.relationships, pawn.id)
    .map((r: PawnRelationship) => {
      const otherId = otherOf(r, pawn.id);
      const other = living.get(otherId);
      return other && other.isAlive !== false ? { r, other } : null;
    })
    .filter((x): x is { r: PawnRelationship; other: Pawn } => x !== null)
    .sort((a, b) => Math.abs(b.r.score) - Math.abs(a.r.score));
</script>

<div class="relations">
  <div class="section">
    <div class="hdr">FAMILY</div>
    {#if kinRows.length > 0}
      {#each kinRows as row}
        <div class="kin-row">
          <span class="kin-kind">{row.kind}</span>
          {#if row.target}
            <button class="kin-name link" on:click={() => row.target && onSelect(row.target)}
              >{row.name}</button
            >
          {:else}
            <span class="kin-name gone">{row.name}</span>
          {/if}
        </div>
      {/each}
    {:else}
      <div class="empty">no kin among the colony</div>
    {/if}
  </div>

  <div class="section">
    <div class="hdr">RELATIONSHIPS</div>
    {#if rels.length > 0}
      {#each rels as { r, other } (r.pawnA + r.pawnB)}
        {@const key = relKey(r.pawnA, r.pawnB)}
        {@const isOpen = expanded.has(key)}
        <div class="rel-row">
          <div class="rel-head">
            <button
              class="disclose"
              class:open={isOpen}
              title="Show what has passed between them"
              on:click={() => toggle(key)}>▸</button
            >
            <button class="rel-name link" on:click={() => onSelect(other)}>{other.name}</button>
            <span class="stage" style:color={STAGE_COLOR[r.stage] ?? '#888'}
              >{STAGE_LABEL[r.stage]}</span
            >
            {#if r.romance}
              <span class="romance">♥ {ROMANCE_LABEL[r.romance.stage] ?? ''}</span>
            {/if}
          </div>
          <StatBar
            label=""
            value={r.score + 100}
            max={200}
            color={STAGE_COLOR[r.stage] ?? '#888888'}
            valueText={`${r.score > 0 ? '+' : ''}${Math.round(r.score)}`}
            width={12}
          />
          {#if r.tags.length > 0}
            <div class="tags">
              {#each r.tags as tag}
                <span class="tag">{TAG_LABEL[tag] ?? ''}</span>
              {/each}
            </div>
          {/if}
          {#if isOpen}
            <RelationBreakdown rel={r} />
          {/if}
        </div>
      {/each}
    {:else}
      <div class="empty">no bonds formed yet</div>
    {/if}
  </div>
</div>

<style>
  .relations {
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .section {
    border: 1px solid var(--border);
    padding: 8px;
  }
  .hdr {
    color: var(--accent-hi);
    font-weight: bold;
    margin-bottom: 6px;
  }
  .kin-row {
    display: flex;
    gap: 8px;
    padding: 1px 0;
  }
  .kin-kind {
    color: var(--text-dim, #888);
    min-width: 64px;
  }
  .link {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--accent-hi);
    cursor: pointer;
    text-align: left;
  }
  .link:hover {
    text-decoration: underline;
  }
  .gone {
    color: var(--text-dim, #777);
    font-style: italic;
  }
  .rel-row {
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }
  .rel-row:last-child {
    border-bottom: none;
  }
  .rel-head {
    display: flex;
    gap: 8px;
    align-items: baseline;
  }
  .disclose {
    background: none;
    border: none;
    padding: 0;
    color: var(--text-dim, #888);
    cursor: pointer;
    font-size: 10px;
    line-height: 1;
    transition: transform 0.1s ease;
  }
  .disclose.open {
    transform: rotate(90deg);
    color: var(--accent-hi);
  }
  .stage {
    font-size: 11px;
  }
  .romance {
    color: #ee6699;
    font-size: 11px;
  }
  .tags {
    display: flex;
    gap: 6px;
    margin-top: 1px;
  }
  .tag {
    font-size: 10px;
    font-style: italic;
    color: var(--text-dim, #999);
  }
  .empty {
    color: var(--text-dim, #777);
    font-style: italic;
  }
</style>
