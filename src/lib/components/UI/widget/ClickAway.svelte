<script lang="ts">
  let { onclose }: { onclose: () => void } = $props();
</script>

<div
  class="click-away"
  role="presentation"
  onclick={onclose}
  oncontextmenu={(e) => {
    e.preventDefault();
    onclose();
  }}
></div>

<style>
  .click-away {
    position: fixed;
    inset: 0;
    z-index: 998;
  }
</style>
