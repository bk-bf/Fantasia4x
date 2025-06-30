<script lang="ts">
  export let title: string = 'Current Task';
  export let icon: string = '';
  export let name: string = '';
  export let description: string = '';
  export let progress: number = 0; // 0 to 1
  export let timeRemaining: string = '';
  export let onCancel: () => void;
  export let cancelTitle: string = 'Cancel task';
  export let accentColor: string = '#ffa726';
</script>

<div class="current-task" style="--accent: {accentColor}">
  <h3>{title}</h3>
  <div class="task-progress">
    <div class="progress-header">
      <span class="progress-icon">{icon}</span>
      <span class="progress-name">{name}</span>
      <span class="progress-time">{timeRemaining}</span>
      <button class="cancel-btn" on:click={onCancel} title={cancelTitle}>❌</button>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width: {progress * 100}%"></div>
    </div>
    <p class="progress-description">{description}</p>
  </div>
</div>

<style>
  .current-task {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid var(--accent, #ffa726);
    margin-bottom: 20px;
  }
  .current-task h3 {
    color: var(--accent, #ffa726);
    margin: 0 0 15px 0;
  }
  .progress-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .progress-icon {
    font-size: 1.5em;
  }
  .progress-name {
    flex: 1;
    font-weight: bold;
  }
  .progress-time {
    color: var(--accent, #ffa726);
    font-size: 0.9em;
  }
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

  .progress-bar {
    height: 8px;
    background: #555;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 10px;
  }
  .progress-fill {
    height: 100%;
    background: var(--accent, #ffa726);
    transition: width 0.5s ease;
  }
  .progress-description {
    color: #888;
    font-style: italic;
    margin: 0;
  }
</style>
