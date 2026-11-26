import { createId, keyComboText, NOT_A_SHORTCUT } from '@vedraopus/model';
import type { KeyCombo, Question, SceneObject, Slide } from '@vedraopus/model';
import type { OpenProject } from '../project-store';
import { addFreeEntry, setFreeChoice, setFreeCorrect, setQuestion } from '../question-edit';
import { Words } from './QuestionWords';

/**
 * Form View's answers for the freeform kinds (docs/briefs/P7.4-freeform-questions.md):
 * the slide's own objects, chosen for the parts they play.
 */

type FreePick = Extract<Question, { kind: 'freePickOne' | 'freePickMany' }>;
type FreeText = Extract<Question, { kind: 'freeText' }>;
type FreeKey = Extract<Question, { kind: 'freeKey' }>;

interface Props<Q extends Question> {
  open: OpenProject;
  slide: Slide;
  question: Q;
}

/** The objects on the slide the learner can see and click, other than the prompt and Submit. */
export function onStageObjects(slide: Slide, question: Question): SceneObject[] {
  return slide.baseLayer.objects.filter(
    (object) =>
      object.type !== 'audio' &&
      object.type !== 'zoomRegion' &&
      object.id !== question.prompt &&
      object.id !== question.submit,
  );
}

/**
 * What each object is called in Form View's lists: its name, numbered where
 * several share it ("Rectangle 2"), so every row has a name of its own.
 */
export function listNames(objects: readonly SceneObject[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const object of objects) counts.set(object.name, (counts.get(object.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  const names = new Map<string, string>();
  for (const object of objects) {
    const n = (seen.get(object.name) ?? 0) + 1;
    seen.set(object.name, n);
    names.set(object.id, counts.get(object.name)! > 1 ? `${object.name} ${n}` : object.name);
  }
  return names;
}

export function FreePickAnswers({ open, slide, question }: Props<FreePick>) {
  const objects = onStageObjects(slide, question);
  const names = listNames(objects);
  const single = question.kind === 'freePickOne';
  return (
    <>
      <p className="muted">
        Tick the objects on the slide the learner picks from, and the right{' '}
        {single ? 'one' : 'ones'}. A choice is shown in its Selected state when picked.
      </p>
      <ul className="question-choices">
        {objects.map((object) => {
          const index = question.choices.findIndex((choice) => choice.object === object.id);
          const choice = question.choices[index];
          const name = names.get(object.id)!;
          return (
            <li key={object.id} data-testid="question-object">
              <label className="question-inline">
                <input
                  type="checkbox"
                  aria-label={`“${name}” is a choice`}
                  checked={!!choice}
                  onChange={(event) =>
                    setFreeChoice(open, slide, question, object.id, event.target.checked)
                  }
                />
                {name}
              </label>
              <label className="question-inline">
                <input
                  type={single ? 'radio' : 'checkbox'}
                  name={`free-correct-${slide.id}`}
                  aria-label={`“${name}” is correct`}
                  disabled={!choice}
                  checked={!!choice?.correct}
                  onChange={(event) =>
                    setFreeCorrect(open, slide, question, index, event.target.checked)
                  }
                />
                Correct
              </label>
            </li>
          );
        })}
      </ul>
      {objects.length === 0 && (
        <p className="muted">Put the objects to pick from on the slide first.</p>
      )}
      {!question.choices.some((choice) => choice.correct) && (
        <p className="field-problem" role="status" data-testid="question-warning">
          No answer is marked correct yet.
        </p>
      )}
    </>
  );
}

export function FreeTextEntry({ open, slide, question }: Props<FreeText>) {
  const entries = slide.baseLayer.objects.filter((object) => object.type === 'textEntry');
  return (
    <div className="question-inline">
      <select
        aria-label="Text entry"
        value={question.entry ?? ''}
        onChange={(event) =>
          setQuestion(
            open,
            slide,
            { ...question, entry: event.target.value || null },
            'Change text entry',
          )
        }
      >
        <option value="">None</option>
        {entries.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.name}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => addFreeEntry(open, slide, question)}>
        Add a text entry
      </button>
    </div>
  );
}

export function FreeKeyAnswers({ open, slide, question }: Props<FreeKey>) {
  const set = (key: KeyCombo) => setQuestion(open, slide, { ...question, key }, 'Change key');
  const shown = keyComboText(question.key);
  return (
    <>
      <p className="muted">
        The key the learner presses. Click the field and press it; or type its name and tick the
        keys held with it.
      </p>
      <input
        aria-label="Shortcut key"
        data-testid="shortcut-key"
        readOnly
        value={shown}
        placeholder="Press a key"
        onKeyDown={(event) => {
          // Tab still moves on; a modifier alone waits for its key.
          if (event.key === 'Tab' || NOT_A_SHORTCUT.has(event.key)) return;
          event.preventDefault();
          set({
            key: event.key,
            ctrl: event.ctrlKey,
            alt: event.altKey,
            shift: event.shiftKey,
            meta: event.metaKey,
          });
        }}
      />
      <Words
        label="Key name"
        value={question.key.key}
        placeholder="s, Enter, F2…"
        onCommit={(text) => set({ ...question.key, key: text.slice(0, 40) })}
      />
      {(['ctrl', 'alt', 'shift', 'meta'] as const).map((which) => (
        <label key={which} className="question-inline">
          <input
            type="checkbox"
            checked={question.key[which]}
            onChange={(event) => set({ ...question.key, [which]: event.target.checked })}
          />
          {{ ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta' }[which]}
        </label>
      ))}
      {shown === '' && (
        <p className="field-problem" role="status" data-testid="question-warning">
          No key is set yet.
        </p>
      )}
      <p className="muted">
        Each key the learner presses is an answer. Browsers keep a few presses for themselves (such
        as Ctrl+W and Ctrl+T), so a course cannot ask for those.
      </p>
    </>
  );
}

type FreeDrag = Extract<Question, { kind: 'freeDrag' }>;
type Role = 'none' | 'item' | 'target';

/** The question with `objectId` playing `role`; a target that stops being one is no item's. */
export function withDragRole(question: FreeDrag, objectId: string, role: Role): FreeDrag {
  const items = question.items.filter((item) => item.object !== objectId);
  const targets = question.targets.filter((target) => target !== objectId);
  if (role === 'item') {
    items.push({ id: createId('choice'), object: objectId, target: null });
  }
  if (role === 'target') targets.push(objectId);
  return {
    ...question,
    targets,
    items: items.map((item) =>
      item.target !== null && !targets.includes(item.target) ? { ...item, target: null } : item,
    ),
  };
}

export function FreeDragAnswers({ open, slide, question }: Props<FreeDrag>) {
  const objects = onStageObjects(slide, question);
  const names = listNames(objects);
  const set = (next: FreeDrag, label: string) => setQuestion(open, slide, next, label);
  const roleOf = (id: string): Role =>
    question.items.some((item) => item.object === id)
      ? 'item'
      : question.targets.includes(id)
        ? 'target'
        : 'none';
  return (
    <>
      <p className="muted">
        Choose the objects the learner carries (items) and drops them on (targets), and where each
        item belongs. An item that belongs on no target is a decoy, right when left off them all.
      </p>
      <ul className="question-choices">
        {objects.map((object) => {
          const name = names.get(object.id)!;
          const role = roleOf(object.id);
          const item = question.items.find((each) => each.object === object.id);
          return (
            <li key={object.id} data-testid="question-object">
              <span>{name}</span>
              <select
                aria-label={`Role of “${name}”`}
                value={role}
                onChange={(event) =>
                  set(
                    withDragRole(question, object.id, event.target.value as Role),
                    'Change drag role',
                  )
                }
              >
                <option value="none">Not used</option>
                <option value="item">Item (carried)</option>
                <option value="target">Target (dropped on)</option>
              </select>
              {item && (
                <select
                  aria-label={`Where “${name}” belongs`}
                  value={item.target ?? ''}
                  onChange={(event) =>
                    set(
                      {
                        ...question,
                        items: question.items.map((each) =>
                          each === item ? { ...each, target: event.target.value || null } : each,
                        ),
                      },
                      'Change where an item belongs',
                    )
                  }
                >
                  <option value="">On no target (a decoy)</option>
                  {question.targets.map((target) => (
                    <option key={target} value={target}>
                      On “{names.get(target) ?? 'a deleted object'}”
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>
      <label className="question-inline">
        <input
          type="checkbox"
          checked={question.snap}
          onChange={(event) => set({ ...question, snap: event.target.checked }, 'Change snapping')}
        />
        Snap a dropped item to the target’s middle
      </label>
      <label className="question-inline">
        <input
          type="checkbox"
          checked={question.returnToStart}
          onChange={(event) =>
            set({ ...question, returnToStart: event.target.checked }, 'Change return to start')
          }
        />
        Return an item to its start when dropped off every target
      </label>
      <label className="question-inline">
        <input
          type="checkbox"
          checked={question.onePerTarget}
          onChange={(event) =>
            set({ ...question, onePerTarget: event.target.checked }, 'Change one item per target')
          }
        />
        One item on each target: the one already there goes back
      </label>
      <label className="question-inline">
        <input
          type="checkbox"
          checked={question.dropStatesAfterSubmit}
          onChange={(event) =>
            set(
              { ...question, dropStatesAfterSubmit: event.target.checked },
              'Change when drop states show',
            )
          }
        />
        Show Drop Correct and Drop Incorrect only after Submit
      </label>
      <p className="muted">
        A target is drawn in its Drag Over state while an item is carried over it, and an item on a
        target in its Drop Correct or Drop Incorrect state. Add those states in the States panel.
      </p>
      {(question.items.length === 0 || question.targets.length === 0) && (
        <p className="field-problem" role="status" data-testid="question-warning">
          Choose at least one item and one target.
        </p>
      )}
    </>
  );
}

type FreeHotspot = Extract<Question, { kind: 'freeHotspot' }>;

export function FreeHotspotAnswers({ open, slide, question }: Props<FreeHotspot>) {
  const objects = onStageObjects(slide, question);
  const names = listNames(objects);
  const set = (spots: FreeHotspot['spots'], label: string) =>
    setQuestion(open, slide, { ...question, spots }, label);
  return (
    <>
      <p className="muted">
        The learner marks anywhere on the slide. Tick the objects that are regions to mark, and the
        right ones. Regions stay visible; for a hidden one, use a shape with no fill or outline.
      </p>
      <ul className="question-choices">
        {objects.map((object) => {
          const name = names.get(object.id)!;
          const spot = question.spots.find((each) => each.object === object.id);
          return (
            <li key={object.id} data-testid="question-object">
              <label className="question-inline">
                <input
                  type="checkbox"
                  aria-label={`“${name}” is a region`}
                  checked={!!spot}
                  onChange={(event) =>
                    set(
                      event.target.checked
                        ? [
                            ...question.spots,
                            { id: createId('choice'), object: object.id, correct: false },
                          ]
                        : question.spots.filter((each) => each.object !== object.id),
                      event.target.checked ? 'Add region' : 'Remove region',
                    )
                  }
                />
                {name}
              </label>
              <label className="question-inline">
                <input
                  type="checkbox"
                  aria-label={`“${name}” is a right region`}
                  disabled={!spot}
                  checked={!!spot?.correct}
                  onChange={(event) =>
                    set(
                      question.spots.map((each) =>
                        each === spot ? { ...each, correct: event.target.checked } : each,
                      ),
                      'Change correct answer',
                    )
                  }
                />
                Right
              </label>
            </li>
          );
        })}
      </ul>
      {!question.spots.some((spot) => spot.correct) && (
        <p className="field-problem" role="status" data-testid="question-warning">
          No region is marked right yet.
        </p>
      )}
    </>
  );
}
