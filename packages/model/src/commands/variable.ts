import { allLayers, triggerReferencesAny } from '../find';
import { forEachObject } from '../traverse';
import { variableSchema } from '../schema';
import type { Project } from '../schema';
import { everySlide } from '../traverse';
import { isBuiltInVariableName, mapProjectText, VARIABLE_REFERENCE } from '../variables';
import { CommandError } from './types';
import type { CommandHandlers } from './types';
import { assertIdsAreNew, assertValid, insertionIndex } from './util';

/** Unbind the data-entry fields (P9.2) whose variable is gone or no longer of their type. */
function unbindFields(project: Project): void {
  for (const { layer } of allLayers(project)) {
    forEachObject(layer.objects, (object) => {
      // Text entries (P9.2), and sliders and dials (P9.4), which bind number variables.
      if (object.type !== 'textEntry' && object.type !== 'slider' && object.type !== 'dial') return;
      if (object.props.variable === null) return;
      const bound = project.variables.find((each) => each.id === object.props.variable);
      const wanted = object.type === 'textEntry' && !object.props.numeric ? 'text' : 'number';
      if (!bound || bound.type !== wanted) object.props.variable = null;
    });
  }
}

function requireVariable(project: Project, variableId: string) {
  const index = project.variables.findIndex((each) => each.id === variableId);
  const variable = project.variables[index];
  if (!variable) throw new CommandError(`No variable with id "${variableId}"`);
  return { variable, index };
}

function assertNameIsFree(project: Project, name: string, exceptId?: string): void {
  if (isBuiltInVariableName(name)) {
    throw new CommandError(`"${name}" is a built-in variable and cannot be used as a name`);
  }
  const key = name.toLowerCase();
  if (project.variables.some((each) => each.id !== exceptId && each.name.toLowerCase() === key)) {
    throw new CommandError(`There is already a variable named "${name}"`);
  }
}

export const variableCommands: Pick<
  CommandHandlers,
  'variable.add' | 'variable.update' | 'variable.remove'
> = {
  'variable.add': (draft, { variable, index }) => {
    assertValid(variableSchema, variable, 'variable');
    assertIdsAreNew(draft, [variable.id]);
    assertNameIsFree(draft, variable.name);
    draft.variables.splice(insertionIndex(index, draft.variables.length), 0, variable);
  },

  'variable.update': (draft, { variableId, changes }) => {
    const { variable } = requireVariable(draft, variableId);
    if (changes.name !== undefined && changes.name !== variable.name) {
      assertNameIsFree(draft, changes.name, variableId);
      const old = variable.name.toLowerCase();
      const next = changes.name;
      variable.name = next;
      // Text refers to variables by name, so every `%Old%` follows the rename.
      mapProjectText(draft, (text) =>
        text.replace(VARIABLE_REFERENCE, (whole, name: string) =>
          name.toLowerCase() === old ? `%${next}%` : whole,
        ),
      );
    }
    if (changes.type !== undefined) variable.type = changes.type;
    if (changes.default !== undefined) variable.default = changes.default;
    assertValid(variableSchema, variable, `variable "${variable.name}"`);
    if (changes.type !== undefined) unbindFields(draft);
  },

  'variable.remove': (draft, { variableId }) => {
    const { index } = requireVariable(draft, variableId);
    draft.variables.splice(index, 1);
    const gone = new Set([variableId]);
    for (const { slide } of everySlide(draft)) {
      if (slide.triggers.some((trigger) => triggerReferencesAny(trigger, gone))) {
        slide.triggers = slide.triggers.filter((trigger) => !triggerReferencesAny(trigger, gone));
      }
    }
    unbindFields(draft);
  },
};
