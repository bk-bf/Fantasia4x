<script lang="ts">
  import type { ViewColumn } from './treeView';

  let {
    columns,
    sortKey,
    sortDir,
    sortBy,
    widths,
    resize
  }: {
    columns: ViewColumn[];
    sortKey: string | null;
    sortDir: 1 | -1;
    sortBy: (key: string) => void;
    widths: Record<string, number>;
    resize: (key: string, px: number) => void;
  } = $props();

  const arrow = (key: string) => (sortKey !== key ? '' : sortDir === 1 ? ' ▴' : ' ▾');

  let drag: { key: string; x: number; w: number } | null = null;

  function grab(key: string, e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest('th') as HTMLElement | null;
    drag = { key, x: e.clientX, w: widths[key] ?? th?.offsetWidth ?? 120 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    resize(drag.key, drag.w + (e.clientX - drag.x));
  }
  function drop(e: PointerEvent) {
    if (!drag) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    drag = null;
  }
</script>

<thead>
  <tr>
    {#each columns as c (c.key)}
      <th>
        <button
          type="button"
          class="sort"
          class:on={sortKey === c.key}
          title="Sort every shelf by {c.label.toLowerCase()} — again for descending, a third time for the natural order"
          onclick={() => sortBy(c.key)}>{c.label}{arrow(c.key)}</button
        >
        <span
          class="grip"
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize — the width is remembered"
          onpointerdown={(e) => grab(c.key, e)}
          onpointermove={move}
          onpointerup={drop}
          onpointercancel={drop}
        ></span>
      </th>
    {/each}
  </tr>
</thead>

<style>
  thead th {
    position: sticky;
    overflow: hidden;
    top: 0;
    z-index: 1;
    background: #191710;
    color: #8a7f5f;
    text-align: center;
    font-weight: 700;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 4px 6px;
    border-bottom: 1px solid #3a3324;
  }
  .sort {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-transform: inherit;
    letter-spacing: inherit;
  }
  .grip {
    position: absolute;
    top: 0;
    right: 0;
    width: 9px;
    height: 100%;
    cursor: col-resize;
    touch-action: none;
    background: linear-gradient(to right, transparent 0 4px, #3a3324 4px 5px, transparent 5px);
  }
  .grip:hover {
    background: linear-gradient(to right, transparent 0 3px, #d8c48a 3px 6px, transparent 6px);
  }
  .sort:hover {
    color: #d8c48a;
  }
  .sort.on {
    color: #f0dda0;
  }
</style>
