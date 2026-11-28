<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import type { ZoneInstance } from '$lib/game/core/types';
  import { labelFor } from '$lib/components/util/itemCategoryTree';
  import ZoneChecklist from './ZoneChecklist.svelte';
  import { ALL_CATEGORIES, CROP_SEEDS, filterUniverse } from './zoneDefs';

  let { filtered, confined }: { filtered: ZoneInstance | null; confined: ZoneInstance | null } =
    $props();

  function toggleCategory(id: string, type: string, category: string) {
    gameState.command({
      type: 'toggleInstanceCategory',
      payload: { instanceId: id, category, allCategories: filterUniverse(type) },
      save: true
    });
  }

  const filterPanel = $derived.by(() => {
    if (!filtered) return null;
    const grow = filtered.type === 'grow';
    const allowed = filtered.filter.allowedCategories;
    const has = allowed.length > 0;
    const list = grow
      ? CROP_SEEDS.map((c) => ({ key: c.category, label: c.name }))
      : ALL_CATEGORIES.map((c) => ({ key: c, label: labelFor(c) }));
    return {
      title: `${grow ? 'Seeds' : 'Filter'} · ${filtered.label}`,
      note: has
        ? `${allowed.length} of ${list.length} ${grow ? 'crops' : 'kinds'}`
        : grow
          ? 'any seed in stock'
          : `all ${list.length} kinds`,
      rows: list.map((r) => ({
        ...r,
        checked: !has || allowed.includes(r.key),
        toggle: () => toggleCategory(filtered.id, filtered.type, r.key)
      })),
      clear: has
        ? () =>
            gameState.command({
              type: 'clearInstanceFilter',
              payload: { instanceId: filtered.id },
              save: true
            })
        : null
    };
  });
</script>

<div class="side">
  {#if filterPanel}
    <ZoneChecklist
      title={filterPanel.title}
      note={filterPanel.note}
      rows={filterPanel.rows}
      onclear={filterPanel.clear}
    />
  {/if}
  {#if confined}
    {@const n = confined.assignedPawnIds?.length ?? 0}
    <ZoneChecklist
      title="Pawns · {confined.label}"
      note={n > 0 ? `${n} of ${($gameState.pawns ?? []).length} kept inside` : 'all roam freely'}
      rows={($gameState.pawns ?? []).map((p) => ({
        key: p.id,
        label: p.name,
        checked: confined.assignedPawnIds?.includes(p.id) ?? false,
        toggle: () =>
          gameState.command({
            type: 'toggleZonePawn',
            payload: { instanceId: confined.id, pawnId: p.id },
            save: true
          })
      }))}
      foot="Bound pawns walk only inside their zones; drafted pawns ignore them."
    />
  {/if}
</div>

<style>
  .side {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
</style>
