export interface Column<Row> {
  key: string;
  label: string;
  numeric?: boolean;
  get: (row: Row) => string | number | null | undefined;
  disp?: (row: Row) => string;
  cls?: (row: Row) => string;
  title?: string;
  colCls?: string;
  data?: (row: Row) => Record<string, string>;
}
