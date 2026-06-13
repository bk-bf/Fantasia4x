<!--
  DebugLogRow — one parsed line in the Debug Log viewer.
  Tag is tinted by its deterministic colour; severity by its level.
-->
<script lang="ts">
  import type { ParsedDebugLine } from '$lib/game/dev/parseDebugLine';
  import { tagColor, severityColor } from '$lib/game/dev/parseDebugLine';

  let { line }: { line: ParsedDebugLine } = $props();
</script>

<div class="row">
  <span class="ts">{line.tsStr}</span>
  <span class="turn">{line.turn != null ? `T${line.turn}` : ''}</span>
  <span class="tag" style="color:{tagColor(line.tag)}">{line.tag ? `[${line.tag}]` : ''}</span>
  {#if line.severity}
    <span class="sev" style="color:{severityColor(line.severity)}">({line.severity})</span>
  {/if}
  <span class="msg">{line.message}</span>
</div>

<style>
  .row {
    display: flex;
    align-items: baseline;
    gap: 0.4em;
    font-size: 11px;
    line-height: 1.5;
    white-space: nowrap;
    padding: 0 2px;
  }
  .row:hover {
    background: var(--bg-hover);
  }
  .ts {
    color: var(--text-muted);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .turn {
    color: var(--text-dim);
    flex-shrink: 0;
    width: 3.2em;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .tag {
    flex-shrink: 0;
    font-weight: 600;
  }
  .sev {
    flex-shrink: 0;
    font-weight: 600;
  }
  .msg {
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
