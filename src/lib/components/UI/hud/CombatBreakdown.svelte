<script lang="ts">
  import type { ActivityLogEntry, CombatTurnEntry } from '$lib/game/core/defs/events';
  import KvRow from '../widget/KvRow.svelte';
  import { describeSwing } from '../../util/combatNarration';

  let { entry }: { entry: ActivityLogEntry } = $props();

  const SWINGS_SHOWN = 6;

  const turns = $derived<CombatTurnEntry[]>(entry.combatBreakdown ?? []);
  const lore = $derived(entry.result ?? (entry.location ? `at ${entry.location}` : ''));

  const attackers = $derived.by(() => {
    const by = new Map<string, { thrown: number; landed: number }>();
    for (const t of turns) {
      const a = by.get(t.attackerName) ?? { thrown: 0, landed: 0 };
      a.thrown++;
      if (t.hit) a.landed++;
      by.set(t.attackerName, a);
    }
    return [...by].map(([name, a]) => ({ name, ...a }));
  });

  const wounded = $derived.by(() => {
    const by = new Map<string, Set<string>>();
    for (const t of turns) {
      if (!t.hit) continue;
      const marks = by.get(t.defenderName) ?? new Set<string>();
      if (t.woundType) marks.add(`${t.woundSeverity ?? ''} ${t.woundType}`.trim());
      if (t.knockdown) marks.add('knocked down');
      if (t.bleeding) marks.add('bleeding');
      if (t.fatal) marks.add('slain');
      by.set(t.defenderName, marks);
    }
    return [...by].filter(([, m]) => m.size > 0).map(([name, m]) => ({ name, marks: [...m] }));
  });

  const swings = $derived(
    turns
      .slice(-SWINGS_SHOWN)
      .reverse()
      .map((t) => ({ t, n: describeSwing(t) }))
  );
</script>

<h5>{entry.action}</h5>
{#if lore}<p>{lore}</p>{/if}
{#each attackers as a (a.name)}
  <KvRow label={a.name}>{a.thrown} {a.thrown === 1 ? 'blow' : 'blows'}, {a.landed} landed</KvRow>
{/each}
{#each wounded as w (w.name)}
  <KvRow label={w.name}>{w.marks.join(', ')}</KvRow>
{/each}
{#if swings.length > 0}
  <div class="tip-sep">Blow by blow</div>
  {#each swings as { t, n }, i (i)}
    <div class="swing" class:miss={!t.hit}>
      {n.attacker}
      {n.verb}
      {n.target}{#if t.hit && t.damage}<b class:crit={t.crit}>−{t.damage}</b>{/if}
    </div>
  {/each}
{/if}

<style>
  .swing {
    line-height: 16px;
  }
  .swing.miss {
    color: var(--text-muted);
  }
  b {
    margin-left: 6px;
    font-weight: normal;
    color: var(--neg);
  }
  b.crit {
    color: var(--accent-hi);
  }
</style>
