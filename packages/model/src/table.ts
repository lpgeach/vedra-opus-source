/**
 * Tables' rows and columns (docs/briefs/P9.9-tables.md): pure helpers that
 * return a table's new `columns` and `rows`, for `object.update` to save. Each
 * leaves its argument alone.
 */
import type { TableCell, TableObject, TableRow } from './schema';
import { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS } from './schema';

type TableProps = TableObject['props'];
export type TableGrid = Pick<TableProps, 'columns' | 'rows'>;

export const emptyCell = (): TableCell => ({ text: { type: 'doc', content: [] }, fill: null });

const copy = (grid: TableGrid): TableGrid => JSON.parse(JSON.stringify(grid)) as TableGrid;
const average = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/** A new empty row at `at` (0 puts it first), as tall as the others on average. */
export function withRowAdded(grid: TableGrid, at: number): TableGrid {
  if (grid.rows.length >= MAX_TABLE_ROWS)
    throw new Error(`A table has at most ${MAX_TABLE_ROWS} rows`);
  const next = copy(grid);
  const row: TableRow = {
    height: average(next.rows.map((each) => each.height)),
    cells: next.columns.map(emptyCell),
  };
  next.rows.splice(Math.max(0, Math.min(at, next.rows.length)), 0, row);
  return next;
}

/** Without row `at`. A table keeps at least one row. */
export function withRowRemoved(grid: TableGrid, at: number): TableGrid {
  if (grid.rows.length <= 1) throw new Error('A table needs at least one row');
  const next = copy(grid);
  next.rows.splice(at, 1);
  return next;
}

/** A new empty column at `at`, as wide as the others on average. */
export function withColumnAdded(grid: TableGrid, at: number): TableGrid {
  if (grid.columns.length >= MAX_TABLE_COLUMNS) {
    throw new Error(`A table has at most ${MAX_TABLE_COLUMNS} columns`);
  }
  const next = copy(grid);
  const where = Math.max(0, Math.min(at, next.columns.length));
  next.columns.splice(where, 0, average(next.columns));
  for (const row of next.rows) row.cells.splice(where, 0, emptyCell());
  return next;
}

/** Without column `at`. A table keeps at least one column. */
export function withColumnRemoved(grid: TableGrid, at: number): TableGrid {
  if (grid.columns.length <= 1) throw new Error('A table needs at least one column');
  const next = copy(grid);
  next.columns.splice(at, 1);
  for (const row of next.rows) row.cells.splice(at, 1);
  return next;
}

/** One cell changed; the rest kept. */
export function withCell(
  grid: TableGrid,
  row: number,
  column: number,
  change: Partial<TableCell>,
): TableGrid {
  const next = copy(grid);
  const cell = next.rows[row]?.cells[column];
  if (!cell) throw new Error(`The table has no cell at row ${row + 1}, column ${column + 1}`);
  Object.assign(cell, change);
  return next;
}

/**
 * Shares typed as "1, 2, 1": one positive number per column, in order. Null
 * when the text is not that.
 */
export function parseShares(text: string, count: number): number[] | null {
  const parts = text.split(/[,\s]+/).filter(Boolean);
  if (parts.length !== count) return null;
  const shares = parts.map(Number);
  return shares.every((share) => Number.isFinite(share) && share > 0) ? shares : null;
}

/** Where each column and row starts and how big it is, in stage units, inside a frame. */
export function tableLayout(
  props: TableGrid,
  width: number,
  height: number,
): { columns: { x: number; width: number }[]; rows: { y: number; height: number }[] } {
  const place = (shares: readonly number[], total: number) => {
    const sum = shares.reduce((a, b) => a + b, 0);
    let at = 0;
    return shares.map((share) => {
      const size = (share / sum) * total;
      const start = at;
      at += size;
      return { start, size };
    });
  };
  return {
    columns: place(props.columns, width).map(({ start, size }) => ({ x: start, width: size })),
    rows: place(
      props.rows.map((row) => row.height),
      height,
    ).map(({ start, size }) => ({ y: start, height: size })),
  };
}
