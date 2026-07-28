/**
 * Column descriptor for `SortableTable.svelte`.
 *
 * Its own module because a type declared in a component's INSTANCE script is not exportable — importing
 * it from the `.svelte` file silently yields `any`, which is how three columns lost their types.
 *
 * The shape deliberately matches the one `gear-db/+page.svelte`'s catalogue already uses, so migrating
 * that table onto the shared component later is a swap rather than a rewrite.
 */
export interface Column<Row> {
  key: string;
  label: string;
  /** Right-align, tabular figures, and sort numerically. */
  numeric?: boolean;
  /** Value used for SORTING — and displayed when there is no `disp`. */
  get: (row: Row) => string | number;
  /** Formatted cell text. Omit to show `get` directly. */
  disp?: (row: Row) => string;
  /** Extra class on the cell — `up` / `down` / `dim` are styled by the component. */
  cls?: (row: Row) => string;
  /** Tooltip on the column heading, for explaining what a number actually means. */
  title?: string;
}
