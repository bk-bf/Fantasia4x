<script lang="ts">
  import CheckBox from '$lib/components/UI/widget/CheckBox.svelte';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import Well from '$lib/components/UI/widget/Well.svelte';

  let {
    title,
    note,
    rows,
    foot = null,
    onclear = null
  }: {
    title: string;
    note: string;
    rows: { key: string; label: string; checked: boolean; toggle: () => void }[];
    foot?: string | null;
    onclear?: (() => void) | null;
  } = $props();
</script>

<Well class="zone-list" {title}>
  <p class="note">{note}</p>
  <div class="chks">
    {#each rows as r (r.key)}
      <CheckBox checked={r.checked} onchange={r.toggle}>{r.label}</CheckBox>
    {/each}
  </div>
  {#if foot}<p class="note">{foot}</p>{/if}
  {#if onclear}
    <div class="minis"><ChromeButton onclick={onclear}>Clear</ChromeButton></div>
  {/if}
</Well>

<style>
  .note {
    margin: 0 0 3px;
    color: var(--text-muted);
  }
  .chks {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 12px;
    max-height: 190px;
    overflow-y: auto;
  }
  .minis {
    display: flex;
    margin-top: 4px;
  }
  .minis :global(.cbtn) {
    flex: 1;
  }
</style>
