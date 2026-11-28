<script lang="ts">
  import { onMount } from 'svelte';
  import { gameState } from '$lib/stores/gameState';
  import { listSaves, hideSaveById, type SaveEntry } from '$lib/stores/saveManager';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import ModalWindow from '$lib/components/UI/window/ModalWindow.svelte';
  import SaveListRow from './SaveListRow.svelte';

  let {
    onClose,
    mode = 'load',
    onSaved
  }: { onClose: () => void; mode?: 'load' | 'save'; onSaved?: () => void } = $props();

  let saves = $state<SaveEntry[]>([]);
  let loaded = $state(false);
  let busy = $state(false);
  let picked = $state<string | null>(null);
  const selected = $derived(
    mode === 'load' ? (saves.find((s) => s.id === picked) ?? saves[0])?.id : undefined
  );

  async function refresh() {
    saves = await listSaves();
    loaded = true;
  }
  onMount(refresh);

  function load(id: string) {
    gameState.startGame('load', id);
  }
  async function del(id: string) {
    await hideSaveById(id);
    await refresh();
  }

  async function newSave() {
    if (busy) return;
    busy = true;
    await gameState.saveGame();
    onSaved?.();
    onClose();
  }
  async function overwrite(id: string) {
    if (busy) return;
    busy = true;
    await gameState.overwriteSave(id);
    onSaved?.();
    onClose();
  }
</script>

<ModalWindow
  id="saves"
  title={mode === 'save' ? 'Save game' : 'Load game'}
  width={520}
  onclose={onClose}
>
  {#if mode === 'save'}
    <div class="top">
      <ChromeButton kind="verb" onclick={newSave} disabled={busy}>New save</ChromeButton>
    </div>
    {#if saves.length > 0}<p class="sub">or write over a save</p>{/if}
  {/if}
  <div class="list">
    {#if !loaded}
      <p class="empty">…</p>
    {:else if saves.length === 0}
      <p class="empty">No saves yet.</p>
    {:else}
      {#each saves as save (save.id)}
        <SaveListRow
          {save}
          {mode}
          selected={save.id === selected}
          onSelect={() => (picked = save.id)}
          onActivate={() => (mode === 'save' ? overwrite(save.id) : load(save.id))}
          onDelete={() => del(save.id)}
        />
      {/each}
    {/if}
  </div>
</ModalWindow>

<style>
  .top {
    display: flex;
    margin: 4px 0 6px;
  }
  .sub {
    margin: 0 0 5px;
    color: var(--text-dim);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 62vh;
    overflow-y: auto;
  }
  .empty {
    margin: 0;
    padding: 14px 0;
    color: var(--text-muted);
    text-align: center;
  }
</style>
