import { applyPatches, enablePatches, freeze, Immer } from 'immer';
import type { Draft, Patch } from 'immer';
import { commandHandlers } from './commands/registry';
import type { CommandHandler, CommandMap, CommandName } from './commands/types';
import type { Project } from './schema';
import { projectSchema } from './schema';
import { findReferenceIssues } from './validate';

enablePatches();
// A private instance, so nothing else in the process can change how the model
// produces state. Auto-freeze makes every Project handed out deeply immutable.
const immer = new Immer({ autoFreeze: true });

export type { Patch };

export interface Change {
  /** The project after the change. */
  project: Project;
  /** What changed, as JSON-patch-like operations against the previous project. */
  patches: readonly Patch[];
  /** `cancel` is a gesture being abandoned. */
  source: 'execute' | 'undo' | 'redo' | 'cancel';
}

export interface HistoryOptions {
  /** How many undo steps to keep. Default 200. */
  limit?: number;
  /**
   * Re-validate the whole project after every command and throw if a command
   * produced an invalid one. A full validation is too slow to run on every
   * step of a drag, so this is for tests and development builds.
   */
  validate?: boolean;
}

/**
 * The single write path to a project: named commands in, immutable projects
 * out, with undo and redo. See docs/PLAN.md §4.3.
 */
export interface History {
  /** The current project. Deeply frozen; a new object after every change. */
  readonly project: Project;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Label of the step `undo()` would revert, for menus ("Undo object.update"). */
  readonly undoLabel: string | undefined;
  readonly redoLabel: string | undefined;
  /** Number of steps on the undo stack. */
  readonly undoDepth: number;

  /**
   * Apply a command. Throws CommandError, leaving the project untouched, if it
   * cannot be applied. A command that changes nothing adds no undo step.
   */
  execute<K extends CommandName>(name: K, payload: CommandMap[K]): void;
  undo(): void;
  redo(): void;

  /**
   * Start a gesture such as a drag. Commands executed until `commitGesture`
   * apply immediately but collapse into one undo step.
   */
  beginGesture(label: string): void;
  commitGesture(): void;
  /** Abandon the gesture: restore the project to how it was at `beginGesture`. */
  cancelGesture(): void;
  readonly inGesture: boolean;

  /** Listen for every change. Returns the function that stops listening. */
  subscribe(listener: (change: Change) => void): () => void;
}

interface Step {
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
}

export function createHistory(initial: Project, options: HistoryOptions = {}): History {
  const limit = options.limit ?? 200;
  // Freezes `initial` in place: from here on the history owns it.
  let project = freeze(initial, true);
  const undoStack: Step[] = [];
  let redoStack: Step[] = [];
  let gesture: Step | undefined;
  const listeners = new Set<(change: Change) => void>();

  const emit = (patches: readonly Patch[], source: Change['source']) => {
    for (const listener of [...listeners]) listener({ project, patches, source });
  };

  const push = (step: Step) => {
    undoStack.push(step);
    if (undoStack.length > limit) undoStack.shift();
    redoStack = [];
  };

  const assertStillValid = (next: Project, label: string) => {
    const parsed = projectSchema.safeParse(next);
    const issues = parsed.success
      ? findReferenceIssues(next)
      : parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
    const [first] = issues;
    if (first) {
      throw new Error(
        `Command "${label}" produced an invalid project (a bug in its handler) at ${first.path}: ${first.message}`,
      );
    }
  };

  const cancelGesture = () => {
    if (!gesture) return;
    const { inversePatches } = gesture;
    gesture = undefined;
    if (inversePatches.length === 0) return;
    project = applyPatches(project, inversePatches);
    emit(inversePatches, 'cancel');
  };

  return {
    get project() {
      return project;
    },
    get canUndo() {
      return gesture !== undefined || undoStack.length > 0;
    },
    get canRedo() {
      return gesture === undefined && redoStack.length > 0;
    },
    get undoLabel() {
      return gesture?.label ?? undoStack.at(-1)?.label;
    },
    get redoLabel() {
      return gesture ? undefined : redoStack.at(-1)?.label;
    },
    get undoDepth() {
      return undoStack.length;
    },
    get inGesture() {
      return gesture !== undefined;
    },

    execute(name, payload) {
      const handler = commandHandlers[name] as CommandHandler<typeof name>;
      const [next, patches, inversePatches] = immer.produceWithPatches(
        project,
        (draft: Draft<Project>) => {
          handler(draft, payload);
        },
      );
      if (patches.length === 0) return;
      if (options.validate) assertStillValid(next, name);

      project = next;
      if (gesture) {
        gesture.patches.push(...patches);
        // Undoing replays the inverses newest-first.
        gesture.inversePatches.unshift(...inversePatches);
      } else {
        push({ label: name, patches, inversePatches });
      }
      emit(patches, 'execute');
    },

    undo() {
      // Undo during a drag means "abandon the drag", not "also revert the step before it".
      if (gesture) {
        cancelGesture();
        return;
      }
      const step = undoStack.pop();
      if (!step) return;
      project = applyPatches(project, step.inversePatches);
      redoStack.push(step);
      emit(step.inversePatches, 'undo');
    },

    redo() {
      if (gesture) return;
      const step = redoStack.pop();
      if (!step) return;
      project = applyPatches(project, step.patches);
      undoStack.push(step);
      emit(step.patches, 'redo');
    },

    beginGesture(label) {
      if (gesture) throw new Error(`Gesture "${gesture.label}" is already in progress`);
      gesture = { label, patches: [], inversePatches: [] };
    },

    commitGesture() {
      if (!gesture) throw new Error('No gesture in progress');
      const step = gesture;
      gesture = undefined;
      if (step.patches.length > 0) push(step);
    },

    cancelGesture,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
