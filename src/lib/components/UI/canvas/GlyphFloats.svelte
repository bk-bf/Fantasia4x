<script lang="ts">
  import './glyphFloats.css';
  import type { GlyphFloat } from '$lib/stores/fx/worldEffects';

  let { floats, floatScale }: { floats: GlyphFloat[]; floatScale: number } = $props();
</script>

<div class="glyph-floats">
  {#each floats as float (float.kind + float.id)}
    {@const xf = `transform: translate(${float.left}px, ${float.top}px) translateX(-50%) scale(${floatScale});`}
    {#if float.kind === 'sleep'}
      <div class="zzz-float" style={xf}>
        <span class="zzz-z" style="animation-delay:0s">z</span><span
          class="zzz-z step1"
          style="animation-delay:0.7s">z</span
        ><span class="zzz-z step2" style="animation-delay:1.4s">Z</span>
      </div>
    {:else if float.kind === 'rest'}
      <div class="rest-float" style={xf}>
        <span class="rest-cross" style="animation-delay:0s">✚</span><span
          class="rest-cross"
          style="animation-delay:0.7s">✚</span
        ><span class="rest-cross" style="animation-delay:1.4s">✚</span>
      </div>
    {:else if float.kind === 'collapse'}
      <div class="collapse-float" style={xf}>
        <span class="collapse-arrow" style="animation-delay:0s">↓</span><span
          class="collapse-arrow"
          style="animation-delay:0.7s">↓</span
        ><span class="collapse-arrow" style="animation-delay:1.4s">↓</span>
      </div>
    {:else if float.kind === 'winded'}
      <div class="winded-float" style={xf}>
        <span class="winded-arrow" style="animation-delay:0s">↓</span><span
          class="winded-arrow"
          style="animation-delay:0.7s">↓</span
        ><span class="winded-arrow" style="animation-delay:1.4s">↓</span>
      </div>
    {:else if float.kind === 'campfire'}
      <div class="fire-sparks" style={xf}>
        <span class="spark s1">·</span>
        <span class="spark s2">*</span>
        <span class="spark s3">·</span>
        <span class="spark s4">*</span>
        <span class="spark s5">·</span>
      </div>
    {:else if float.kind === 'trade'}
      <div class="trade-float" style={xf}>
        <span class="trade-mark">?</span>
      </div>
    {/if}
  {/each}
</div>
