<script lang="ts">
  import type { CombatTurnEntry } from '$lib/game/core/Events';

  export let turns: CombatTurnEntry[];
</script>

<div class="breakdown">
  {#each turns as t}
    <div class="line" class:crit={t.crit} class:miss={!t.hit}>
      <span class="turn">T{t.turn}</span>
      <span class="who atk">{t.attackerName}</span>
      {#if t.weapon}<span class="weapon">{t.weapon}</span>{/if}
      {#if t.hit}
        <span class="arrow">→</span>
        <span class="who">{t.defenderName}</span>
        {#if t.bodyPart}<span class="part">{t.bodyPart}</span>{/if}
        {#if t.partRemainingHp !== undefined && t.partMaxHp !== undefined}
          <span class="hp">{t.partRemainingHp}/{t.partMaxHp}</span>
        {/if}
        {#if t.crit}
          <span class="dmg crit-dmg">CRIT −{t.damage}</span>
        {:else}
          <span class="dmg">−{t.damage}</span>
        {/if}
        {#if t.knockdown}<span class="tag knock">KNOCKED DOWN</span>{/if}
        {#if t.bleeding}<span class="tag bleed">BLEEDING</span>{/if}
      {:else}
        <span class="arrow miss-x">⨯</span>
        <span class="who">{t.defenderName}</span>
        <span class="dodge">dodged</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .breakdown {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 4px 6px 6px 30px;
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 5px;
    font-size: 9px;
    line-height: 1.5;
    padding: 2px 0 2px 6px;
    border-left: 2px solid var(--border-hi);
  }
  .line.crit {
    border-left-color: #ff3322;
    background: rgba(255, 51, 34, 0.06);
  }
  .line.miss {
    opacity: 0.6;
  }

  .turn {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    min-width: 34px;
  }
  .who {
    color: var(--text);
  }
  .who.atk {
    color: var(--accent-hi);
  }
  .weapon {
    color: var(--text-dim);
    font-style: italic;
  }
  .arrow {
    color: var(--text-muted);
  }
  .arrow.miss-x {
    color: #888;
  }
  .part {
    color: #66ccee;
  }
  .hp {
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .dmg {
    color: #ff6644;
    font-weight: 600;
  }
  .dmg.crit-dmg {
    color: #ff3322;
    font-weight: 700;
  }
  .dodge {
    color: #888;
    font-style: italic;
  }
  .tag {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 0 3px;
    border-radius: 2px;
  }
  .tag.knock {
    color: #1a1208;
    background: #ffcc44;
  }
  .tag.bleed {
    color: #fff;
    background: #cc2222;
  }
</style>
