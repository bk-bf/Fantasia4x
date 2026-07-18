<!--
  CreditsScroll — the cinematic, film-style rolling credits, opened from the title screen (MainMenu).

  A single column rolls up from below the fold and off the top, on a continuous loop (you can close
  any time). Credits the author, the games that inspired Fantasia4x, and every bundled asset author
  (kept in sync with AUDIO-CREDITS.md + the CC-BY Bitlands tileset). Top/bottom gradient masks give the
  vignette fade. Closes on ✕ / backdrop / Escape; respects prefers-reduced-motion (static scroll).
-->
<script lang="ts">
  import { fade } from 'svelte/transition';

  let { onClose }: { onClose: () => void } = $props();

  // Structured so a new asset/inspiration is a one-line edit, never a markup change.
  const credits: { role: string; lines: string[] }[] = [
    { role: 'A 4X Colony Chronicle', lines: [] },
    { role: 'Design & Code', lines: ['bk'] },
    {
      role: 'Inspired by',
      lines: [
        'RimWorld',
        'HSK Team',
        'VilesMods — xenomacabre',
        'Dwarf Fortress',
        'Battle Brothers + Legends Mod',
        'Vintage Story',
        'Cataclysm: Dark Days Ahead'
      ]
    },
    { role: 'Tileset', lines: ['Bitlands — DragonDePlatino', 'CC-BY 4.0'] },
    { role: 'Music', lines: ['Alexandr Zhelanov', 'RandomMind'] },
    { role: 'Ambience', lines: ['JC Sounds — Nature Ambient Pack'] },
    {
      role: 'Sound Effects',
      lines: [
        'rubberduck',
        'Kenney',
        'artisticdude',
        'qubodup',
        'AntumDeluge',
        'leone',
        'Vinrax',
        'IMadeIt'
      ]
    },
    {
      role: 'Typography',
      lines: ['Cousine', 'Cinzel', 'Dancing Script', '— SIL Open Font License']
    },
    { role: 'Audio via', lines: ['OpenGameArt.org', 'CC0 / CC-BY 4.0'] }
  ];

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="credits-overlay" transition:fade={{ duration: 160 }}>
  <button class="backdrop" aria-label="Close credits" onclick={onClose}></button>

  <div class="viewport" role="dialog" aria-modal="true" aria-label="Credits" tabindex="-1">
    <div class="scroller">
      <h1 class="wordmark">FANTASIA</h1>

      {#each credits as block}
        <section class="block">
          {#if block.role}<div class="role">{block.role}</div>{/if}
          {#each block.lines as line}
            <div class="name">{line}</div>
          {/each}
        </section>
      {/each}

      <section class="block closer">
        <div class="role">Thank you for playing</div>
        <h1 class="wordmark small">FANTASIA</h1>
      </section>
    </div>
  </div>

  <button class="close" aria-label="Close credits" onclick={onClose}>✕</button>
  <div class="hint" aria-hidden="true">Esc to close</div>
</div>

<style>
  .credits-overlay {
    position: fixed;
    inset: 0;
    z-index: 1100; /* above the menu (1000), same band as SettingsModal */
    background: var(--bg);
    font-family: var(--font-mono);
    overflow: hidden;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    border: none;
    background: transparent;
    cursor: default;
    padding: 0;
  }

  /* The roll happens inside this full-screen window; top/bottom masks fade text at the edges. */
  .viewport {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none; /* clicks fall through to the backdrop → close */
    -webkit-mask-image: linear-gradient(transparent, #000 16%, #000 84%, transparent);
    mask-image: linear-gradient(transparent, #000 16%, #000 84%, transparent);
  }
  .scroller {
    position: absolute;
    top: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 30px;
    padding: 0 24px;
    box-sizing: border-box;
    text-align: center;
    animation: roll 58s linear infinite;
  }
  /* Starts entirely below the fold (vh), ends entirely above (its own height) — length-independent. */
  @keyframes roll {
    from {
      transform: translateY(100vh);
    }
    to {
      transform: translateY(-100%);
    }
  }

  .wordmark {
    color: var(--accent-hi);
    font-size: 41px;
    font-weight: 700;
    letter-spacing: 0.5em;
    text-indent: 0.5em;
    margin: 0 0 16px;
    text-shadow: 0 0 18px rgba(240, 136, 40, 0.35);
  }
  .wordmark.small {
    font-size: 23px;
    margin: 6px 0 0;
  }

  .block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .block.closer {
    margin-top: 24px;
  }
  .role {
    color: var(--accent-hi);
    font-size: 12px;
    letter-spacing: 0.26em;
    text-transform: uppercase;
  }
  .name {
    color: var(--text);
    font-size: 16px;
    letter-spacing: 0.08em;
  }

  .close {
    position: absolute;
    top: 14px;
    right: 16px;
    z-index: 2;
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 18px;
    cursor: pointer;
    padding: 4px 6px;
    line-height: 1;
  }
  .close:hover {
    color: var(--accent-hi);
  }
  .hint {
    position: absolute;
    bottom: 14px;
    left: 0;
    right: 0;
    text-align: center;
    color: var(--text-muted);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    opacity: 0.6;
  }

  /* No auto-roll for reduced-motion users — pin it readable at the top and let them scroll. */
  @media (prefers-reduced-motion: reduce) {
    .viewport {
      overflow-y: auto;
      pointer-events: auto;
    }
    .scroller {
      position: static;
      animation: none;
      padding-top: 8vh;
      padding-bottom: 8vh;
    }
  }
</style>
