<script lang="ts">
  import { uiState } from '$lib/stores/uiState';

  let { label = 'BACK', onClick }: { label?: string; onClick?: () => void } = $props();
  const handle = () => (onClick ? onClick() : uiState.setScreen('main'));
</script>

<button class="back-btn" onclick={handle} title="Back to map">‹ {label}</button>

<style>
  .back-btn {
    margin-left: auto;
    padding: 2px 10px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition:
      color 0.12s,
      border-color 0.12s,
      background 0.12s;
  }
  .back-btn:hover {
    color: var(--accent-hi);
    border-color: var(--border-hi);
    background: var(--bg-hover);
  }
</style>
