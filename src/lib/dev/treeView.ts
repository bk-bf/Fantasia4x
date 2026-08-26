// treeView.ts — the shape a NESTED AUDIT TABLE needs, so there is one of them rather than one per
// dataset. The items view and the buildings view are the same instrument pointed at different data:
// a branch says what a thing IS, an age level sits under it, and a shelf with one child is the hole.
//
// Duplicating the components to point the second one at buildings produced a table that worked and
// looked wrong — the styling lives with the component, so a copy drifts the moment either is touched.

export interface ViewCell {
  /** what the cell reads */
  v: string | number;
  /** the class the existing table styles already understand: nm, num, cls, age, stat, fx, src, gate, recipes */
  cls: string;
  /** hover text, for a cell that is truncated */
  title?: string;
}

export interface ViewRow {
  id: string;
  cells: ViewCell[];
  desc: string;
  /** whatever the hover card wants; the tree neither reads nor cares */
  hover?: unknown;
}

export interface ViewNode {
  key: string;
  label: string;
  depth: number;
  count: number;
  children: ViewNode[];
  rows: ViewRow[];
  /** kit parts this shelf has nothing for — armour only; empty everywhere else */
  missing: string[];
}

export interface ViewColumn {
  key: string;
  label: string;
  num?: boolean;
}

/** Everything the table needs to draw a dataset. Both `itemTree` and `buildingTree` export one. */
export interface TreeSource {
  /** plural noun for the count line and the search placeholder */
  noun: string;
  /** the paragraph under the controls explaining how to read this tree */
  hint: string;
  columns: ViewColumn[];
  total: number;
  /** filtered, built and sorted in one call, because the caller has no business knowing the order */
  view(needle: string, sortKey: string | null, dir: 1 | -1): ViewNode;
}

/** Every key beneath a node — what "expand all" needs. */
export function everyKey(n: ViewNode, out: string[] = []): string[] {
  for (const c of n.children) {
    out.push(c.key);
    everyKey(c, out);
  }
  return out;
}
