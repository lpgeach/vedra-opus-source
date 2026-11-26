import {
  createButtonObject,
  createEmptyProject,
  createId,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { Project, Trigger, TriggerAction } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import type { EngineEvent, ScriptApi } from './index';

/** How the player runs a script; tests use the same. */
const runScript = (code: string, api: ScriptApi) => {
  new Function('player', code)(api);
};

function course(actions: TriggerAction[]) {
  const button = createButtonObject('Go', {}, 'Go');
  const box = createButtonObject('Box', {}, 'Box');
  for (const object of [button, box]) object.timing = { start: 0, duration: 'untilEnd' };
  box.states.push({ id: 'state_glow', name: 'Glow', overrides: {} });
  const slide = createSlide('Scripts');
  const other = createSlide('Other');
  slide.baseLayer.objects.push(button, box);
  const trigger = (action: TriggerAction): Trigger => ({
    id: createId('trigger'),
    owner: { kind: 'object', id: button.id },
    event: { type: 'click', object: button.id },
    action,
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  slide.triggers.push(...actions.map(trigger));
  const project: Project = createEmptyProject();
  project.scenes = [{ ...createScene(), slides: [slide, other] }];
  project.variables.push(
    { id: createId('var'), name: 'Score', type: 'number', default: 0 },
    { id: createId('var'), name: 'Log', type: 'text', default: '' },
  );
  return { project, button, box, slide, other };
}
const js = (code: string): TriggerAction => ({ type: 'executeJavaScript', code });

describe('execute JavaScript', () => {
  it('does nothing without a host to run it, as in the editor', () => {
    const { project, button } = course([js('player.setVar("Score", 5)')]);
    const engine = createEngine(project);
    engine.pointer('click', button.id);
    expect(engine.getVariable('Score')).toBe(0);
  });

  it('runs at its place among the triggers, so its changes are seen by later ones', () => {
    const { project, button } = course([
      js('player.setVar("Score", player.getVar("score") + 10)'),
      {
        type: 'setVariable',
        variable: '',
        operator: 'assign',
        operand: { kind: 'literal', value: '' },
      },
    ]);
    const score = project.variables[0]!;
    const log = project.variables[1]!;
    // The second trigger copies Score into Log: it must see the script's change.
    project.scenes[0]!.slides[0]!.triggers[1]!.action = {
      type: 'setVariable',
      variable: log.id,
      operator: 'assign',
      operand: { kind: 'variable', variable: score.id },
    };
    const engine = createEngine(project, { runScript });
    engine.pointer('click', button.id);
    expect(engine.getVariable('Score')).toBe(10);
    expect(engine.getVariable('Log')).toBe('10');
  });

  it('reads built-in variables and refuses to set them or to set the wrong type', () => {
    const seen: unknown[] = [];
    const { project, button } = course([
      js('player.setVar("Log", String(player.getVar("SlideCount")))'),
      js('player.setVar("SlideNumber", 3)'),
      js('player.setVar("Score", "ten")'),
    ]);
    const engine = createEngine(project, { runScript });
    engine.on((event: EngineEvent) => {
      if (event.type === 'warning') seen.push(event.message);
    });
    engine.pointer('click', button.id);
    expect(engine.getVariable('Log')).toBe('2');
    expect(seen).toEqual([
      expect.stringContaining('built in'),
      expect.stringContaining('holds number values'),
    ]);
  });

  it('reaches objects by name: state, visibility, hide and show', () => {
    const { project, button, box } = course([
      js(`
        const box = player.object('Box');
        player.setVar('Log', box.name + ':' + box.state + ':' + box.visible);
        box.setState('state_glow');
        box.hide();
        if (player.object('Nope') !== null) throw new Error('should be null');
      `),
    ]);
    const engine = createEngine(project, { runScript });
    engine.pointer('click', button.id);
    expect(engine.getVariable('Log')).toBe('Box:normal:true');
    const view = engine.getView().layers[0]!.objects.find((o) => o.id === box.id)!;
    expect(view).toMatchObject({ state: 'state_glow', visible: false, onStage: true });
    // Hidden by a script, it takes no input.
    expect(engine.pointer('click', box.id)).toBe(false);
  });

  it('remembers what a script hid when the slide resumes, and show brings it back', () => {
    const { project, button, box, slide, other } = course([js("player.object('Box').hide()")]);
    slide.properties.onRevisit = 'resume';
    const engine = createEngine(project, { runScript });
    engine.pointer('click', button.id);
    engine.jumpToSlide(other.id);
    engine.jumpToSlide(slide.id);
    const visible = () => engine.getView().layers[0]!.objects.find((o) => o.id === box.id)!.visible;
    expect(visible()).toBe(false);
    expect(engine.getState().sv?.[slide.id]?.h).toEqual([box.id]);
    slide.triggers[0]!.action = js("player.object('Box').show()");
    engine.pointer('click', button.id);
    expect(visible()).toBe(true);
  });

  it('a script that throws becomes a warning and the triggers after it still run', () => {
    const { project, button } = course([
      js('this is not javascript'),
      js('player.setVar("Score", 1)'),
    ]);
    const warnings: string[] = [];
    const engine = createEngine(project, { runScript });
    engine.on((event) => {
      if (event.type === 'warning') warnings.push(event.message);
    });
    engine.pointer('click', button.id);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/JavaScript failed/);
    expect(engine.getVariable('Score')).toBe(1);
  });
});
