<script lang="ts">
  export let onClick: () => void;
  export let title: string = 'Cancel';
</script>

<button class="cancel-btn" on:click={onClick} {title}> ❌ </button>

<style>
  .cancel-btn {
    margin-left: auto;
    padding: 4px 8px;
    background: #d32f2f;
    border: 1px solid #f44336;
    color: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8em;
    transition: all 0.2s ease;
  }
  .cancel-btn:hover {
    background: #f44336;
    transform: scale(1.1);
  }
</style>
