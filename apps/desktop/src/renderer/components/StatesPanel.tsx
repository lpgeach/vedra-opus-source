import { BUILT_IN_STATE_NAMES, builtInStateIds, createId, isEmptyState } from '@vedraopus/model';
import { useState } from 'react';
import { activeStateEdit, editor, selectedObjects, useEditor } from '../project-store';
import type { CurrentSlide, OpenProject } from '../project-store';

/**
 * The states of the selected object. Choosing a state other than Normal turns
 * on edit-states mode: the stage shows the object in that state, and whatever
 * is changed there (position, size, fill, text…) is saved to that state only.
 */
export function StatesPanel({ open, current }: { open: OpenProject; current: CurrentSlide }) {
  const { selection } = useEditor();
  const [naming, setNaming] = useState(false);
  const selected = selectedObjects(current.slide, selection);
  const object = selected.length === 1 ? selected[0]! : null;
  if (!object) {
    return <p className="placeholder">Select one object to see and edit its states.</p>;
  }
  const { history } = open;
  const editing = activeStateEdit();
  const shownId = editing?.objectId === object.id ? editing.stateId : 'normal';
  const shown = object.states.find((state) => state.id === shownId) ?? object.states[0]!;
  const missing = builtInStateIds.filter((id) => !object.states.some((state) => state.id === id));
  const sets = [
    ...new Set(
      current.slide.baseLayer.objects.flatMap((each) => (each.buttonSet ? [each.buttonSet] : [])),
    ),
  ];

  const add = (id: string, name: string, overrides = {}) => {
    history.execute('state.add', { objectId: object.id, state: { id, name, overrides } });
    editor.editState(object.id, id);
  };
  const setButtonSet = (value: string) => {
    const next = value.trim() === '' ? null : value.trim();
    if (next !== object.buttonSet) {
      history.execute('object.update', { objectId: object.id, changes: { buttonSet: next } });
    }
  };

  return (
    <div className="states-panel" data-testid="states-panel">
      <div className="states-list" role="listbox" aria-label={`States of ${object.name}`}>
        {object.states.map((state) => (
          <button
            key={state.id}
            role="option"
            aria-selected={state.id === shownId}
            className="state-chip"
            title={
              state.id === 'normal'
                ? 'The object as it normally looks'
                : isEmptyState(state)
                  ? 'Looks the same as Normal so far'
                  : 'Has its own look'
            }
            onClick={() => editor.editState(object.id, state.id)}
          >
            {state.name}
            {state.id === object.initialState && <span className="muted"> (initial)</span>}
          </button>
        ))}
      </div>
      {shownId !== 'normal' && (
        <p className="states-banner" role="status" data-testid="states-editing">
          Editing the {shown.name} state: changes on the stage are saved to this state only.{' '}
          <button onClick={() => editor.editState(object.id, null)}>Done editing states</button>
        </p>
      )}
      <div className="states-tools" role="toolbar" aria-label="States">
        <select
          aria-label="Add state"
          value=""
          onChange={(event) => {
            const id = event.target.value;
            if (id === '__custom') setNaming(true);
            else if (id) add(id, BUILT_IN_STATE_NAMES[id] ?? id);
          }}
        >
          <option value="">Add state…</option>
          {missing.map((id) => (
            <option key={id} value={id}>
              {BUILT_IN_STATE_NAMES[id]}
            </option>
          ))}
          <option value="__custom">Custom…</option>
        </select>
        {naming && (
          <input
            aria-label="New state name"
            placeholder="State name, then Enter"
            autoFocus
            onKeyDown={(event) => {
              event.stopPropagation();
              const name = event.currentTarget.value.trim();
              if (event.key === 'Enter' && name) {
                setNaming(false);
                add(createId('state'), name);
              } else if (event.key === 'Escape') setNaming(false);
            }}
            onBlur={() => setNaming(false)}
          />
        )}
        <button
          onClick={() =>
            add(createId('state'), `${shown.name} copy`, structuredClone(shown.overrides))
          }
        >
          Duplicate
        </button>
        <button
          disabled={shownId === 'normal' || isEmptyState(shown)}
          title="Make this state look like Normal again"
          onClick={() =>
            history.execute('state.update', {
              objectId: object.id,
              stateId: shownId,
              changes: { overrides: {} },
            })
          }
        >
          Reset
        </button>
        <button
          disabled={shownId === 'normal'}
          onClick={() => {
            editor.editState(object.id, null);
            history.execute('state.remove', { objectId: object.id, stateId: shownId });
          }}
        >
          Delete
        </button>
        <label>
          Initial state
          <select
            aria-label="Initial state"
            value={object.initialState}
            onChange={(event) =>
              history.execute('object.update', {
                objectId: object.id,
                changes: { initialState: event.target.value },
              })
            }
          >
            {object.states.map((state) => (
              <option key={state.id} value={state.id}>
                {state.name}
              </option>
            ))}
          </select>
        </label>
        <label title="Objects with the same button set name: selecting one deselects the others">
          Button set
          <input
            // Remount when the stored value changes (undo, another object), so it shows the truth.
            key={`${object.id}/${object.buttonSet ?? ''}`}
            aria-label="Button set"
            list="button-sets"
            placeholder="None"
            defaultValue={object.buttonSet ?? ''}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') setButtonSet(event.currentTarget.value);
            }}
            onBlur={(event) => setButtonSet(event.currentTarget.value)}
          />
          <datalist id="button-sets">
            {sets.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
      </div>
    </div>
  );
}
