<script lang="ts">
  import type {
    GameState,
    Pawn,
    PawnRelationship,
    RelationTag,
    RomanceStage
  } from '$lib/game/core/types';
  import {
    kinLabel,
    STAGE_LABEL,
    findRelationship,
    isKinStale,
    otherOf,
    relationshipsOf,
    relKey
  } from '$lib/game/core/rules/social/social';
  import { dayIndexForTurn } from '$lib/game/services/EnvironmentService';
  import SkinBar from '../UI/widget/SkinBar.svelte';
  import Well from '../UI/widget/Well.svelte';
  import RelationBreakdown from './RelationBreakdown.svelte';

  export let pawn: Pawn;
  export let gameState: GameState;
  export let onSelect: (p: Pawn) => void = () => {};

  let expanded = new Set<string>();
  function toggle(key: string) {
    expanded.has(key) ? expanded.delete(key) : expanded.add(key);
    expanded = expanded;
  }

  const TAG_LABEL: Record<RelationTag, string> = {
    grief_bond: 'shared grief',
    battle_forged: 'battle-forged',
    mentor: 'mentor',
    rescued_by: 'saved in the field'
  };
  const ROMANCE_LABEL: Record<RomanceStage, string> = {
    interested: 'Interested',
    courting: 'Courting',
    partners: 'Partners',
    ex: 'Parted ways'
  };
  const STAGE_COLOR: Record<string, string> = {
    enemies: 'var(--neg)',
    rivals: 'var(--ember)',
    strangers: 'var(--text-muted)',
    acquaintances: 'var(--text)',
    friends: 'var(--pos)',
    best_friends: 'var(--pos)'
  };

  $: living = new Map((gameState.pawns ?? []).map((p) => [p.id, p]));
  $: fallen = new Map((gameState.deadPawns ?? []).filter((d) => d.id).map((d) => [d.id!, d]));
  $: world = new Map((gameState.worldPawns ?? []).map((p) => [p.id, p]));
  $: kingdomName = new Map((gameState.kingdoms ?? []).map((k) => [k.id, k.name]));

  $: kinRows = (pawn.kin ?? []).map((tie) => {
    const alive = living.get(tie.pawnId);
    const dead = fallen.get(tie.pawnId);
    const away = world.get(tie.pawnId);
    const rel = findRelationship(gameState.relationships, pawn.id, tie.pawnId);
    let sinceDays: number | null = null;
    if (away) {
      sinceDays =
        away.lastSeenTurn == null
          ? null
          : dayIndexForTurn(gameState.turn) - dayIndexForTurn(away.lastSeenTurn);
    }
    const relativeSex = (alive ?? away)?.sex;
    return {
      kind: kinLabel(tie.kind, relativeSex),
      name: alive?.name ?? away?.name ?? (dead ? `${dead.name} †` : 'Lost to memory'),
      target: alive && alive.isAlive !== false ? alive : null,
      away,
      home: away?.homeKingdomId ? (kingdomName.get(away.homeKingdomId) ?? 'a far realm') : null,
      stale: away ? isKinStale(sinceDays) : false,
      seen: sinceDays,
      stage: rel ? STAGE_LABEL[rel.stage] : null,
      stageColor: rel ? (STAGE_COLOR[rel.stage] ?? 'var(--text-muted)') : 'var(--text-muted)'
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

<div class="rel">
  <Well title="Family" scroll>
    {#each kinRows as row}
      <div class="fam" class:stale={row.stale} class:dead={!row.target && !row.away}>
        <em>{row.kind}</em>
        {#if row.target}
          <button class="link" onclick={() => row.target && onSelect(row.target)}>{row.name}</button
          >
        {:else}
          <b>{row.name}</b>
        {/if}
        {#if row.stage}<span style:color={row.stageColor}>{row.stage}</span>{/if}
        {#if row.away}
          <p>
            away in {row.home}{#if row.stale}
              · {row.seen == null ? 'as you last knew' : 'long unseen'}{:else}
              · seen recently{/if}
          </p>
        {/if}
      </div>
    {:else}
      <p class="none">No known kin.</p>
    {/each}
  </Well>

  <Well title="Bonds" scroll>
    {#if rels.length > 0}
      <div class="bonds">
        {#each rels as { r, other } (r.pawnA + r.pawnB)}
          {@const key = relKey(r.pawnA, r.pawnB)}
          {@const isOpen = expanded.has(key)}
          <div class="bond" class:on={isOpen}>
            <div
              class="bh"
              role="button"
              tabindex="0"
              title="Click to show what has passed between them"
              onclick={() => toggle(key)}
              onkeydown={(e) =>
                (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(key))}
            >
              <i>{isOpen ? '▾' : '▸'}</i>
              <button
                class="link"
                onclick={(e) => {
                  e.stopPropagation();
                  onSelect(other);
                }}>{other.name}</button
              >
              <span style:color={STAGE_COLOR[r.stage] ?? 'var(--text-muted)'}
                >{STAGE_LABEL[r.stage]}</span
              >
              {#if r.romance}<span class="rom">♥ {ROMANCE_LABEL[r.romance.stage]}</span>{/if}
            </div>
            <div class="meter">
              <SkinBar value={(r.score + 100) / 200} ramp={r.score < 0 ? 'ember' : 'leaf'} />
              <span class:neg={r.score < 0} class:pos={r.score > 0}
                >{r.score > 0 ? '+' : ''}{Math.round(r.score)}</span
              >
            </div>
            {#if r.tags.length > 0}
              <div class="tags">
                {#each r.tags as tag}<span class="pill">{TAG_LABEL[tag] ?? ''}</span>{/each}
              </div>
            {/if}
            {#if isOpen}<RelationBreakdown rel={r} />{/if}
          </div>
        {/each}
      </div>
    {:else}
      <p class="none">No bonds formed yet.</p>
    {/if}
  </Well>
</div>

<style>
  .rel {
    display: grid;
    grid-template-columns: 1fr 2fr;
    grid-template-rows: minmax(0, 1fr);
    gap: 6px;
    height: 248px;
  }
  .fam {
    margin-bottom: 6px;
  }
  .fam em {
    display: block;
    font-style: normal;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1.4px;
  }
  .fam b {
    font-weight: normal;
    margin-right: 8px;
  }
  .fam.dead b,
  .fam.stale b,
  .fam.stale p {
    color: var(--text-muted);
  }
  .fam p,
  .none {
    margin: 0;
    color: var(--text-dim);
  }
  .link {
    padding: 0;
    margin-right: 8px;
    border: 0;
    background: none;
    font: inherit;
    color: var(--accent-hi);
    text-decoration: underline dotted;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .bonds {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 18px;
  }
  .bond.on {
    grid-row: span 3;
  }
  .bh {
    display: flex;
    gap: 8px;
    align-items: center;
    white-space: nowrap;
    overflow: hidden;
    cursor: pointer;
  }
  .bh .link {
    margin: 0;
  }
  .bh i {
    width: 9px;
    font-style: normal;
    color: var(--text-muted);
  }
  .rom {
    margin-left: auto;
    color: var(--neg);
  }
  .meter {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 18px;
  }
  .meter span {
    width: 40px;
    text-align: right;
  }
  .pos {
    color: var(--pos);
  }
  .neg {
    color: var(--neg);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .pill {
    padding: 0 5px;
    box-shadow: inset 0 0 0 1px var(--text-muted);
  }
</style>
