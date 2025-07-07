<!-- $lib/components/ui/Progressbar.svelte -->
<script lang="ts">
  export let progress: number = 0; // 0-100
  export let color: string = 'blue';
  export let size: string = 'h-3';
  export let labelInside: boolean = false;
  export let animate: boolean = true;
  export let precision: number = 0;
  export let tweenDuration: number = 500;
  export let classes: any = {};

  // Color mapping for your game's theme
  const colorMap: Record<string, string> = {
    blue: '#2196F3',
    green: '#4CAF50',
    yellow: '#FFC107',
    orange: '#FF9800',
    red: '#F44336',
    purple: '#9C27B0',
    gray: '#9E9E9E'
  };

  // Size mapping
  const sizeMap: Record<string, string> = {
    'h-2': '8px',
    'h-3': '12px',
    'h-4': '16px',
    'h-5': '20px',
    'h-6': '24px'
  };

  $: progressColor = colorMap[color] || color;
  $: progressHeight = sizeMap[size] || '12px';
  $: clampedProgress = Math.max(0, Math.min(100, progress));
  $: displayProgress =
    precision > 0 ? clampedProgress.toFixed(precision) : Math.round(clampedProgress);
</script>

<div class="progress-container" style="height: {progressHeight}">
  {#if labelInside}
    <div
      class="progress-label-inside {classes.labelInsideDiv || ''}"
      style="line-height: {progressHeight};"
    >
      {displayProgress}%
    </div>
  {/if}
</div>

{#if !labelInside}
  <div class="progress-label-outside">
    {displayProgress}%
  </div>
{/if}

<style>
  .progress-container {
    position: relative;
    width: 100%;
    background-color: #333;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid #555;
    font-family: 'Courier New', monospace;
  }

  .progress-bar {
    height: 100%;
    border-radius: 3px;
    position: relative;
    background: linear-gradient(90deg, currentColor 0%, currentColor 100%);
    box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.1);
  }

  .progress-bar.animate {
    transition-property: width;
    transition-timing-function: ease;
  }

  .progress-label-inside {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #000;
    font-weight: bold;
    font-size: 0.75rem;
    text-shadow: 0 0 2px rgba(255, 255, 255, 0.8);
    white-space: nowrap;
  }

  .progress-label-outside {
    position: absolute;
    top: 50%;
    right: 8px;
    transform: translateY(-50%);
    color: #e0e0e0;
    font-size: 0.75rem;
    font-weight: bold;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
    pointer-events: none;
  }

  /* Game-specific styling */
  .progress-container:hover {
    border-color: #777;
    box-shadow: 0 0 4px rgba(255, 255, 255, 0.1);
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .progress-label-inside,
    .progress-label-outside {
      font-size: 0.65rem;
    }
  }
</style>
