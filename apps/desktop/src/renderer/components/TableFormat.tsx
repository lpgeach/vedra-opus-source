import {
  parseShares,
  withCell,
  withColumnAdded,
  withColumnRemoved,
  withRowAdded,
  withRowRemoved,
} from '@vedraopus/model';
import type { Color, TableGrid, TableObject } from '@vedraopus/model';
import { useState } from 'react';
import { editor } from '../project-store';
import { CommitField } from './PlayerTabs';
import { NumericInput } from './NumericInput';

type Changes = Partial<TableObject['props']>;

/**
 * The Format panel's Table section (docs/briefs/P9.9-tables.md): pick a row and a
 * column, then insert or delete around them or fill that cell; and the table's
 * headers, banding, borders, padding and column shares.
 */
export function TableFormat({
  table,
  update,
  ColorField,
  themeSlots,
}: {
  table: TableObject;
  /** Save these props as one undo step. */
  update: (changes: Changes) => void;
  ColorField: (props: {
    label: string;
    color: unknown;
    themeSlots: readonly string[];
    onChange: (color: unknown) => void;
  }) => React.ReactNode;
  themeSlots: readonly string[];
}) {
  const { props } = table;
  const [picked, setPicked] = useState({ row: 0, column: 0 });
  const row = Math.min(picked.row, props.rows.length - 1);
  const column = Math.min(picked.column, props.columns.length - 1);
  const cell = props.rows[row]!.cells[column]!;
  const grid: TableGrid = { columns: props.columns, rows: props.rows };

  /** Change the grid, and keep the picked place on the same row and column where it can. */
  const change = (next: () => TableGrid, at?: { row: number; column: number }) => {
    try {
      const { columns, rows } = next();
      update({ columns, rows });
      if (at) setPicked(at);
    } catch (problem) {
      editor.showError(problem instanceof Error ? problem.message : String(problem));
    }
  };

  return (
    <section data-testid="table-format">
      <h3 className="panel-subtitle">Table</h3>
      <p className="muted" data-testid="table-size">
        {props.rows.length} rows, {props.columns.length} columns. Double-click a cell to type in it.
      </p>
      <div className="field-row">
        <label className="field">
          <span>Row</span>
          <select
            aria-label="Table row"
            value={row}
            onChange={(e) => setPicked({ row: Number(e.target.value), column })}
          >
            {props.rows.map((_, index) => (
              <option key={index} value={index}>
                {index + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Column</span>
          <select
            aria-label="Table column"
            value={column}
            onChange={(e) => setPicked({ row, column: Number(e.target.value) })}
          >
            {props.columns.map((_, index) => (
              <option key={index} value={index}>
                {index + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="button-row">
        <button type="button" onClick={() => change(() => withRowAdded(grid, row))}>
          Insert row above
        </button>
        <button
          type="button"
          onClick={() => change(() => withRowAdded(grid, row + 1), { row: row + 1, column })}
        >
          Insert row below
        </button>
        <button
          type="button"
          onClick={() =>
            change(() => withRowRemoved(grid, row), { row: Math.max(0, row - 1), column })
          }
        >
          Delete row
        </button>
      </div>
      <div className="button-row">
        <button type="button" onClick={() => change(() => withColumnAdded(grid, column))}>
          Insert column left
        </button>
        <button
          type="button"
          onClick={() =>
            change(() => withColumnAdded(grid, column + 1), { row, column: column + 1 })
          }
        >
          Insert column right
        </button>
        <button
          type="button"
          onClick={() =>
            change(() => withColumnRemoved(grid, column), { row, column: Math.max(0, column - 1) })
          }
        >
          Delete column
        </button>
      </div>
      <label className="field-check">
        <input
          type="checkbox"
          aria-label="Cell has its own fill"
          checked={cell.fill !== null}
          onChange={(e) =>
            change(() =>
              withCell(grid, row, column, { fill: e.target.checked ? { theme: 'accent2' } : null }),
            )
          }
        />
        This cell has its own fill
      </label>
      {cell.fill !== null && (
        <ColorField
          label="Cell fill"
          color={cell.fill}
          themeSlots={themeSlots}
          onChange={(color) => change(() => withCell(grid, row, column, { fill: color as Color }))}
        />
      )}
      <label className="field-check">
        <input
          type="checkbox"
          aria-label="Header row"
          checked={props.headerRow}
          onChange={(e) => update({ headerRow: e.target.checked })}
        />
        Header row
      </label>
      <label className="field-check">
        <input
          type="checkbox"
          aria-label="Header column"
          checked={props.headerColumn}
          onChange={(e) => update({ headerColumn: e.target.checked })}
        />
        Header column
      </label>
      {(props.headerRow || props.headerColumn) && (
        <>
          <ColorField
            label="Header fill"
            color={props.headerFill}
            themeSlots={themeSlots}
            onChange={(color) => update({ headerFill: color as Color })}
          />
          <ColorField
            label="Header text"
            color={props.headerText}
            themeSlots={themeSlots}
            onChange={(color) => update({ headerText: color as Color })}
          />
        </>
      )}
      <label className="field-check">
        <input
          type="checkbox"
          aria-label="Banded rows"
          checked={props.bandFill !== null}
          onChange={(e) => update({ bandFill: e.target.checked ? '#eef1f5' : null })}
        />
        Banded rows
      </label>
      {props.bandFill !== null && (
        <ColorField
          label="Band fill"
          color={props.bandFill}
          themeSlots={themeSlots}
          onChange={(color) => update({ bandFill: color as Color })}
        />
      )}
      <ColorField
        label="Border"
        color={props.borderColor}
        themeSlots={themeSlots}
        onChange={(color) => update({ borderColor: color as Color })}
      />
      <label className="field">
        <span>Border width</span>
        <NumericInput
          aria-label="Table border width"
          value={String(props.borderWidth)}
          min={0}
          max={8}
          undoLabel="Change the table's border"
          onValue={(n) => {
            if (n !== null && n >= 0 && n <= 8) update({ borderWidth: n });
          }}
        />
      </label>
      <label className="field">
        <span>Cell padding</span>
        <NumericInput
          aria-label="Table cell padding"
          value={String(props.padding)}
          min={0}
          max={40}
          undoLabel="Change the table's padding"
          onValue={(n) => {
            if (n !== null && n >= 0 && n <= 40) update({ padding: n });
          }}
        />
      </label>
      <CommitField
        label="Column shares"
        value={props.columns.map((share) => Number(share.toFixed(3))).join(', ')}
        maxLength={200}
        onCommit={(text) => {
          const shares = parseShares(text, props.columns.length);
          if (shares) update({ columns: shares });
          else {
            editor.showError(
              `Give ${props.columns.length} numbers above 0, one for each column, such as 1, 2, 1.`,
            );
          }
        }}
      />
    </section>
  );
}
