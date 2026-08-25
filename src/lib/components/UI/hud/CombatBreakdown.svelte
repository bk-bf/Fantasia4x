<script lang="ts">
  import type { CombatTurnEntry } from '$lib/game/core/defs/events';
  import { describeSwing } from '../../util/combatNarration';

  export let turns: CombatTurnEntry[];

  $: ordered = [...turns].reverse().map((t) => ({ t, n: describeSwing(t) }));
</script>

<div class="breakdown">
  {#each ordered as { t, n }}
    <div class="line t-{n.tier}" class:crit={t.crit} class:miss={!t.hit} class:fatal={t.fatal}>
      <div class="head">
        <span class="turn">T{t.turn}</span>
        <span class="who atk">{n.attacker}</span>
        <span class="verb t-{n.tier}">{n.verb}</span>
        <span class="who">{n.target}</span>
        {#if t.fatal}<span class="tag kill">KILL</span>{/if}
        {#if n.dodged}<span class="dodge">— dodged</span>{/if}
      </div>
      {#if t.hit}
        <div class="detail">
          {#if t.weapon}<span class="weapon">{t.weapon}</span>{/if}
          {#if t.partRemainingHp !== undefined && t.partMaxHp !== undefined}
            <span class="hp">{t.partRemainingHp}/{t.partMaxHp}</span>
          {/if}
          {#if t.crit}
            <span class="dmg crit-dmg">CRIT −{t.damage}</span>
          {:else}
            <span class="dmg">−{t.damage}</span>
          {/if}
          {#if t.woundType}
            <span class="tag wound sev-{t.woundSeverity}">{t.woundSeverity} {t.woundType}</span>
          {/if}
          {#if t.knockdown}<span class="tag knock">DOWN</span>{/if}
          {#if t.bleeding}<span class="tag bleed">BLEED</span>{/if}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .breakdown {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 3px 6px 5px 8px;
  }

  .line {
    padding: 2px 0 2px 5px;
    border-left: 2px solid var(--border-hi);
    line-height: 1.4;
  }
  .line.t-critical {
    border-left-color: #ff8c44;
  }
  .line.t-destroyed {
    border-left-color: #ff3322;
    background: rgba(255, 51, 34, 0.06);
  }
  .line.crit {
    border-left-color: #ff3322;
    background: rgba(255, 51, 34, 0.06);
  }
  .line.miss {
    opacity: 0.55;
  }
  .line.fatal {
    border-left-color: #ff2a1a;
    background: rgba(255, 42, 26, 0.12);
    box-shadow: inset 2px 0 0 #ff2a1a;
  }
  .line:hover {
    background: var(--bg-hover);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px;
    font-size: 10px;
  }
  .detail {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 5px;
    font-size: 10px;
    padding-left: 10px;
  }

  .turn {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .who {
    color: var(--text);
  }
  .who.atk {
    color: var(--accent-hi);
  }
  .verb {
    font-weight: 600;
    color: var(--text);
  }
  .verb.t-minor {
    color: #b89850;
    font-weight: 500;
  }
  .verb.t-serious {
    color: #e0a040;
  }
  .verb.t-critical {
    color: #ff8c44;
  }
  .verb.t-destroyed {
    color: #ff3322;
  }
  .miss .verb {
    color: var(--text-muted);
    font-weight: 400;
    font-style: italic;
  }
  .weapon {
    color: var(--text-dim);
    font-style: italic;
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
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 0 3px;
    border-radius: 2px;
  }
  .tag.kill {
    color: #fff;
    background: #ff2a1a;
    letter-spacing: 0.08em;
  }
  .tag.knock {
    color: #1a1208;
    background: #ffcc44;
  }
  .tag.bleed {
    color: #fff;
    background: #cc2222;
  }
  .tag.wound {
    text-transform: capitalize;
    color: #f4ecd8;
    background: #8a5a24;
  }
  .tag.wound.sev-minor {
    color: #ece8da;
    background: #5f5f50;
  }
  .tag.wound.sev-serious {
    color: #fff;
    background: #b4631d;
  }
  .tag.wound.sev-critical {
    color: #fff;
    background: #d23a2a;
  }
  .tag.wound.sev-destroyed {
    color: #fff;
    background: #ff2a1a;
  }
</style>
