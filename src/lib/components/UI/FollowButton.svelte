<script lang="ts">
  let {
    isActive,
    onToggle
  }: {
    isActive: boolean;
    onToggle: () => void;
  } = $props();
</script>

<button class="follow-btn" class:active={isActive} onclick={onToggle}>
  {isActive ? 'UNFOLLOW' : 'FOLLOW'}
</button>

<style>
  .follow-btn {
    background: transparent;
    border: 1px solid var(--accent-hi);
    color: var(--accent-hi);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    cursor: pointer;
    opacity: 0.85;
    transition: opacity 0.12s;
  }
  .follow-btn:hover {
    opacity: 1;
    background: var(--accent-hi);
    color: var(--bg);
  }
  .follow-btn.active {
    background: var(--accent-hi);
    color: var(--bg);
    opacity: 1;
  }
</style>
