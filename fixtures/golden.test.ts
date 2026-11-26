import { createEngine } from '@vedraopus/engine';
import type { Engine } from '@vedraopus/engine';
import { parseProject, replaceVariableReferences, variableValueText } from '@vedraopus/model';
import type { Project, RichText, SceneObject } from '@vedraopus/model';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readGolden } from './golden';
import type { GoldenSnapshot } from './golden';

const plainText = (doc: RichText): string => {
  const walk = (node: { text?: string; content?: unknown[] }): string =>
    (node.text ?? '') + (node.content ?? []).map((c) => walk(c as typeof node)).join('');
  return walk(doc as { content?: unknown[] });
};

/** What the engine says about the things a golden snapshot checks. */
function snapshot(project: Project, engine: Engine, golden: GoldenSnapshot): GoldenSnapshot {
  const view = engine.getView();
  const slide = project.scenes.flatMap((s) => s.slides).find((s) => s.id === view.slideId)!;
  const layers = [slide.baseLayer, ...slide.layers];
  const objects = new Map<string, SceneObject>(
    layers.flatMap((l) => l.objects.map((o) => [o.id, o])),
  );
  const byName = (name: string) => [...objects.values()].find((o) => o.name === name)!;
  const shown = view.layers.flatMap((l) => l.objects);
  const value = (name: string) => {
    const v = engine.getVariable(name);
    return v === undefined ? undefined : variableValueText(v);
  };
  return {
    slide: slide.title,
    layers: view.layers
      .filter((l) => !l.isBase)
      .map((l) => layers.find((x) => x.id === l.id)!.name),
    visible: shown.filter((o) => o.visible).map((o) => objects.get(o.id)!.name),
    states: Object.fromEntries(
      Object.keys(golden.states).map((name) => [
        name,
        shown.find((o) => o.id === byName(name).id)!.state,
      ]),
    ),
    text: Object.fromEntries(
      Object.keys(golden.text).map((name) => {
        const object = byName(name);
        const doc = object.type === 'text' ? object.props.text : null;
        return [name, doc ? replaceVariableReferences(plainText(doc), value) : ''];
      }),
    ),
  };
}

for (const fixture of ['states-and-triggers']) {
  describe(`golden run: ${fixture}`, () => {
    it('the engine alone agrees with the recorded run at every step', () => {
      const project = parseProject(
        JSON.parse(
          readFileSync(join(import.meta.dirname, 'projects', fixture, 'project.json'), 'utf8'),
        ),
      );
      const engine = createEngine(project);
      for (const [index, step] of readGolden(fixture).steps.entries()) {
        if (step.click) {
          const view = engine.getView();
          const slide = project.scenes.flatMap((s) => s.slides).find((s) => s.id === view.slideId)!;
          const target = [slide.baseLayer, ...slide.layers]
            .flatMap((l) => l.objects)
            .find((o) => o.name === step.click)!;
          // A click as the browser reports it: the pointer arrives, presses, releases, clicks, leaves.
          for (const kind of ['enter', 'down', 'up', 'click', 'leave'] as const) {
            engine.pointer(kind, target.id);
          }
        }
        expect(snapshot(project, engine, step.expect), `step ${index}`).toEqual(step.expect);
      }
    });
  });
}
