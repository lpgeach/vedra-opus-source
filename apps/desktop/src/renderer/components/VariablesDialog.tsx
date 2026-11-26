import { BUILT_IN_VARIABLES, createId, variableUsage } from '@vedraopus/model';
import type { Variable } from '@vedraopus/model';
import { useState } from 'react';
import type { OpenProject } from '../project-store';
import { NumericInput } from './NumericInput';
import { takeFocus } from './dialog-focus';

const DEFAULTS: Record<Variable['type'], Variable['default']> = {
  text: '',
  number: 0,
  boolean: false,
};
const TYPE_NAMES: Record<Variable['type'], string> = {
  text: 'Text',
  number: 'Number',
  boolean: 'True/False',
};

/** A name the project does not use yet: Variable1, Variable2, … */
function freeName(variables: readonly Variable[]): string {
  const used = new Set(variables.map((v) => v.name.toLowerCase()));
  for (let n = 1; ; n++) if (!used.has(`variable${n}`)) return `Variable${n}`;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The project's variables: add, rename (text that shows `%Name%` follows the
 * new name), change type and default, delete (warning first when something
 * uses it). Built-in variables are listed for reference; they cannot change.
 */
export function VariablesDialog({ open, onClose }: { open: OpenProject; onClose: () => void }) {
  const { history, project } = open;
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const run = (change: () => void) => {
    try {
      change();
      setError(null);
    } catch (problem) {
      setError(message(problem));
    }
  };
  const update = (
    variable: Variable,
    changes: Partial<Pick<Variable, 'name' | 'type' | 'default'>>,
  ) => run(() => history.execute('variable.update', { variableId: variable.id, changes }));

  const add = () =>
    run(() =>
      history.execute('variable.add', {
        variable: {
          id: createId('var'),
          name: freeName(project.variables),
          type: 'text',
          default: '',
        },
      }),
    );

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog variables-dialog"
        ref={takeFocus}
        tabIndex={-1}
        role="dialog"
        aria-label="Variables"
        data-testid="variables-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2>Variables</h2>
        <p className="muted">
          Show a variable in any text by writing its name between percent signs, such as %Score%.
        </p>
        {project.variables.length === 0 ? (
          <p className="placeholder">No variables yet.</p>
        ) : (
          <table className="variables-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Default value</th>
                <th>Used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {project.variables.map((variable) => {
                const usage = variableUsage(project, variable.id);
                const uses = usage.text + usage.triggers;
                return (
                  <tr key={variable.id} data-testid="variable-row">
                    <td>
                      <input
                        // Remount when the stored name changes (undo, a refused rename).
                        key={variable.name}
                        aria-label="Variable name"
                        defaultValue={variable.name}
                        spellCheck={false}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === 'Enter') event.currentTarget.blur();
                          if (event.key === 'Escape') {
                            event.currentTarget.value = variable.name;
                            event.currentTarget.blur();
                          }
                        }}
                        onBlur={(event) => {
                          const name = event.currentTarget.value.trim();
                          if (name === variable.name) return;
                          update(variable, { name });
                          // A refused name goes back to the stored one.
                          event.currentTarget.value = variable.name;
                        }}
                      />
                    </td>
                    <td>
                      <select
                        aria-label="Variable type"
                        value={variable.type}
                        onChange={(event) => {
                          const type = event.target.value as Variable['type'];
                          update(variable, { type, default: DEFAULTS[type] });
                        }}
                      >
                        {(Object.keys(TYPE_NAMES) as Variable['type'][]).map((type) => (
                          <option key={type} value={type}>
                            {TYPE_NAMES[type]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {variable.type === 'boolean' ? (
                        <select
                          aria-label="Default value"
                          value={String(variable.default)}
                          onChange={(event) =>
                            update(variable, { default: event.target.value === 'true' })
                          }
                        >
                          <option value="false">False</option>
                          <option value="true">True</option>
                        </select>
                      ) : variable.type === 'number' ? (
                        <NumericInput
                          aria-label="Default value"
                          undoLabel="Change default value"
                          value={String(variable.default)}
                          onValue={(value) => update(variable, { default: value ?? 0 })}
                        />
                      ) : (
                        <input
                          key={String(variable.default)}
                          aria-label="Default value"
                          defaultValue={String(variable.default)}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === 'Enter') event.currentTarget.blur();
                          }}
                          onBlur={(event) => {
                            if (event.currentTarget.value !== variable.default) {
                              update(variable, { default: event.currentTarget.value });
                            }
                          }}
                        />
                      )}
                    </td>
                    <td
                      data-testid="variable-usage"
                      title={`${usage.text} in text, ${usage.triggers} in triggers`}
                    >
                      {uses}
                    </td>
                    <td>
                      {confirming === variable.id ? (
                        <span className="variables-confirm" role="alert">
                          Used {uses} {uses === 1 ? 'time' : 'times'}.{' '}
                          <button
                            onClick={() => {
                              setConfirming(null);
                              run(() =>
                                history.execute('variable.remove', { variableId: variable.id }),
                              );
                            }}
                          >
                            Delete anyway
                          </button>{' '}
                          <button onClick={() => setConfirming(null)}>Keep</button>
                        </span>
                      ) : (
                        <button
                          aria-label={`Delete ${variable.name}`}
                          onClick={() =>
                            uses > 0
                              ? setConfirming(variable.id)
                              : run(() =>
                                  history.execute('variable.remove', { variableId: variable.id }),
                                )
                          }
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {error && (
          <p className="variables-error" role="alert" data-testid="variables-error">
            {error}
          </p>
        )}
        <div className="dialog-actions variables-actions">
          <button onClick={add}>Add variable</button>
          <span className="spacer" />
          <button onClick={onClose}>Close</button>
        </div>
        <details className="variables-built-in">
          <summary>Built-in variables</summary>
          <ul>
            {BUILT_IN_VARIABLES.map((variable) => (
              <li key={variable.name}>
                <code>%{variable.name}%</code> {variable.description}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
