import { allLayers, triggerReferences } from './find';
import type { Project, RichText, SceneObject } from './schema';
import { forEachObject } from './traverse';

/**
 * Variables the engine provides. They are read-only, are not stored in the
 * project, and their names cannot be used for an author's own variables.
 * Quiz results join them with the quiz work (P7).
 */
export const BUILT_IN_VARIABLES = [
  { name: 'SlideNumber', type: 'number', description: 'The number of the current slide' },
  { name: 'SlideCount', type: 'number', description: 'How many slides the course has' },
  { name: 'SlidesViewed', type: 'number', description: 'How many slides have been visited' },
  { name: 'PercentComplete', type: 'number', description: 'Slides visited, as a percentage' },
  { name: 'ElapsedSeconds', type: 'number', description: 'Whole seconds spent in the course' },
  // The result slide's, or elsewhere the tracked result's (docs/briefs/P7.7-result-slides.md).
  { name: 'ResultScore', type: 'number', description: 'Points scored in the result' },
  { name: 'ResultMaxScore', type: 'number', description: 'The most points the result can give' },
  { name: 'ResultPercent', type: 'number', description: 'The result as a percentage' },
  { name: 'ResultPassPercent', type: 'number', description: 'The percentage the result passes at' },
  { name: 'ResultPassed', type: 'boolean', description: 'Whether the result is a pass' },
  { name: 'ResultTimeLeft', type: 'number', description: 'Whole seconds left on the result timer' },
] as const;
export type BuiltInVariableName = (typeof BUILT_IN_VARIABLES)[number]['name'];

export function isBuiltInVariableName(name: string): boolean {
  const key = name.toLowerCase();
  return BUILT_IN_VARIABLES.some((each) => each.name.toLowerCase() === key);
}

/** `%Name%` in text. Names are matched ignoring case. */
export const VARIABLE_REFERENCE = /%([A-Za-z_][A-Za-z0-9_]*)%/g;

/**
 * Replace each `%Name%` in `text` using `lookup` (called with the name as
 * written). A name `lookup` does not know (it returns undefined) is left as it is.
 */
export function replaceVariableReferences(
  text: string,
  lookup: (name: string) => string | undefined,
): string {
  return text.replace(VARIABLE_REFERENCE, (whole, name: string) => lookup(name) ?? whole);
}

/** Text is shown locale-neutrally: `1234.5`, `true`. */
export function variableValueText(value: string | number | boolean): string {
  return typeof value === 'number' ? String(Number(value.toFixed(6))) : String(value);
}

type TextNode = { text?: string | undefined; content?: TextNode[] | undefined };

function eachText(node: TextNode, visit: (holder: TextNode) => void): void {
  if (typeof node.text === 'string') visit(node);
  node.content?.forEach((child) => eachText(child, visit));
}

/** Every rich text in the project: objects' text, their states' text, and slide notes. */
export function forEachRichText(project: Project, visit: (doc: RichText) => void): void {
  const fromObject = (object: SceneObject) => {
    if (object.type !== 'group' && 'text' in object.props && object.props.text) {
      visit(object.props.text);
    }
    // A table's cells (P9.9).
    if (object.type === 'table') {
      for (const row of object.props.rows) for (const cell of row.cells) visit(cell.text);
    }
    for (const state of object.states) if (state.overrides.text) visit(state.overrides.text);
  };
  for (const { layer } of allLayers(project)) forEachObject(layer.objects, fromObject);
  for (const scene of project.scenes) for (const slide of scene.slides) visit(slide.notes);
}

/** Rewrite the text nodes of every rich text in a (draft) project. */
export function mapProjectText(project: Project, change: (text: string) => string): void {
  forEachRichText(project, (doc) =>
    eachText(doc as TextNode, (holder) => {
      const next = change(holder.text!);
      if (next !== holder.text) holder.text = next;
    }),
  );
}

export interface VariableUsage {
  /** `%Name%` references in text. */
  text: number;
  /** Triggers that read or set it. */
  triggers: number;
}

export function variableUsage(project: Project, variableId: string): VariableUsage {
  const variable = project.variables.find((each) => each.id === variableId);
  const usage: VariableUsage = { text: 0, triggers: 0 };
  if (!variable) return usage;
  const key = variable.name.toLowerCase();
  forEachRichText(project, (doc) =>
    eachText(doc as TextNode, (holder) => {
      for (const match of holder.text!.matchAll(VARIABLE_REFERENCE)) {
        if (match[1]!.toLowerCase() === key) usage.text += 1;
      }
    }),
  );
  for (const scene of project.scenes) {
    for (const slide of scene.slides) {
      for (const trigger of slide.triggers) {
        if (triggerReferences(trigger).has(variableId)) usage.triggers += 1;
      }
    }
  }
  return usage;
}
