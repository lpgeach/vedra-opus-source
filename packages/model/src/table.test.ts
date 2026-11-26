import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createHistory,
  createId,
  createTableObject,
  migrateToCurrent,
  parseProject,
  parseShares,
  plainRichText,
  ProjectValidationError,
  tableLayout,
  withCell,
  withColumnAdded,
  withColumnRemoved,
  withRowAdded,
  withRowRemoved,
} from './index';
import type { Project, TableObject } from './index';

/** Tables (docs/briefs/P9.9-tables.md). */

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.path);
    throw error;
  }
};

const words = (table: TableObject) =>
  table.props.rows.map((row) =>
    row.cells.map((cell) =>
      cell.text.content
        .flatMap((block) => ('content' in block ? (block.content ?? []) : []))
        .map((node) => ('text' in node ? node.text : ''))
        .join(''),
    ),
  );

/** A 2 × 2 table reading A B / C D. */
function abcd(): TableObject {
  const table = createTableObject(2, 2);
  let grid = { columns: table.props.columns, rows: table.props.rows };
  for (const [r, c, text] of [
    [0, 0, 'A'],
    [0, 1, 'B'],
    [1, 0, 'C'],
    [1, 1, 'D'],
  ] as const) {
    grid = withCell(grid, r, c, { text: plainRichText(text) });
  }
  return { ...table, props: { ...table.props, ...grid } };
}

describe('tables in the model', () => {
  it('start as equal columns and rows of empty cells under a header row', () => {
    const table = createTableObject();
    expect(table.props.columns).toEqual([1, 1, 1]);
    expect(table.props.rows).toHaveLength(4);
    expect(table.props.rows.every((row) => row.cells.length === 3)).toBe(true);
    expect(table.props.headerRow).toBe(true);
    const project = createEmptyProject();
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(table);
    expect(issues(project)).toEqual([]);
  });

  it('refuse a row with too few or too many cells, and out-of-range settings', () => {
    const project = createEmptyProject();
    const table = createTableObject(3, 2);
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(table);
    table.props.rows[1]!.cells.pop();
    expect(issues(project)).toEqual([
      'scenes[0].slides[0].baseLayer.objects[0].props.rows[1].cells',
    ]);
    table.props.rows[1]!.cells.push(
      { text: plainRichText(''), fill: null },
      { text: plainRichText(''), fill: null },
    );
    expect(issues(project)).toEqual([
      'scenes[0].slides[0].baseLayer.objects[0].props.rows[1].cells',
    ]);
    table.props.rows[1]!.cells.pop();
    expect(issues(project)).toEqual([]);
    for (const bad of [{ borderWidth: 9 }, { padding: -1 }, { columns: [1, 0, 1] }]) {
      const before = { ...table.props };
      Object.assign(table.props, bad);
      expect(issues(project).length, JSON.stringify(bad)).toBeGreaterThan(0);
      Object.assign(table.props, before);
    }
  });

  it('insert and delete rows and columns around a place, keeping the text in order', () => {
    const table = abcd();
    const grid = { columns: table.props.columns, rows: table.props.rows };
    const view = (next: typeof grid) => words({ ...table, props: { ...table.props, ...next } });
    expect(view(withRowAdded(grid, 1))).toEqual([
      ['A', 'B'],
      ['', ''],
      ['C', 'D'],
    ]);
    expect(view(withRowAdded(grid, 0))).toEqual([
      ['', ''],
      ['A', 'B'],
      ['C', 'D'],
    ]);
    expect(view(withColumnAdded(grid, 2))).toEqual([
      ['A', 'B', ''],
      ['C', 'D', ''],
    ]);
    expect(view(withRowRemoved(grid, 0))).toEqual([['C', 'D']]);
    expect(view(withColumnRemoved(grid, 0))).toEqual([['B'], ['D']]);
    // The original is left as it was.
    expect(words(table)).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
    expect(() => withColumnRemoved(withColumnRemoved(grid, 0), 0)).toThrow(/at least one column/);
    expect(() => withRowRemoved(withRowRemoved(grid, 0), 0)).toThrow(/at least one row/);
    expect(() => withCell(grid, 5, 0, { fill: null })).toThrow(/no cell/);
  });

  it('size columns and rows by their shares of the frame', () => {
    const layout = tableLayout(
      {
        columns: [1, 2, 1],
        rows: [
          { height: 1, cells: [] },
          { height: 3, cells: [] },
        ],
      },
      400,
      200,
    );
    expect(layout.columns).toEqual([
      { x: 0, width: 100 },
      { x: 100, width: 200 },
      { x: 300, width: 100 },
    ]);
    expect(layout.rows).toEqual([
      { y: 0, height: 50 },
      { y: 50, height: 150 },
    ]);
    expect(parseShares('1, 2,1', 3)).toEqual([1, 2, 1]);
    expect(parseShares('1 2', 3)).toBeNull();
    expect(parseShares('1, 0, 1', 3)).toBeNull();
    expect(parseShares('1, x, 1', 3)).toBeNull();
  });

  it('follow a variable’s new name in their cells, and count it as used', () => {
    const project = createEmptyProject();
    const variable = { id: createId('var'), name: 'Score', type: 'number' as const, default: 0 };
    project.variables.push(variable);
    const table = abcd();
    const grid = withCell(table.props, 1, 1, { text: plainRichText('You scored %Score%') });
    table.props.rows = grid.rows;
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(table);
    const history = createHistory(parseProject(JSON.parse(JSON.stringify(project))));
    history.execute('variable.update', { variableId: variable.id, changes: { name: 'Points' } });
    const saved = history.project.scenes[0]!.slides[0]!.baseLayer.objects[0] as TableObject;
    expect(words(saved)[1]![1]).toBe('You scored %Points%');
  });

  it('migrate from format 32 unchanged', () => {
    const old = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    old['formatVersion'] = 32;
    const migrated = migrateToCurrent(old) as Record<string, unknown>;
    expect({ ...migrated, formatVersion: 32 }).toEqual(old);
  });
});
