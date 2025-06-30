<script lang="ts">
  export let title: string = 'Current Tasks';
  export let layout: 'vertical' | 'horizontal' | 'grid' = 'horizontal';
  export let maxColumns: number = 2; // For grid layout
</script>

<div class="task-container">
  <h3 class="container-title">{title}</h3>
  <div
    class="tasks-wrapper"
    class:horizontal={layout === 'horizontal'}
    class:vertical={layout === 'vertical'}
    class:grid={layout === 'grid'}
    style="--max-columns: {maxColumns}"
  >
    <slot />
  </div>
</div>

<style>
  .task-container {
    margin-bottom: 20px;
  }

  .container-title {
    color: #ffa726;
    margin: 0 0 15px 0;
    font-size: 1.1em;
  }

  .tasks-wrapper {
    display: flex;
    gap: 10px;
  }

  .tasks-wrapper.horizontal {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .tasks-wrapper.vertical {
    flex-direction: column;
  }

  .tasks-wrapper.grid {
    display: grid;
    grid-template-columns: repeat(var(--max-columns), 1fr);
    gap: 10px;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .tasks-wrapper.horizontal {
      flex-direction: column;
    }

    .tasks-wrapper.grid {
      grid-template-columns: 1fr;
    }
  }
</style>
