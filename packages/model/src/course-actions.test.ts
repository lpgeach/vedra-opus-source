import { describe, expect, it } from 'vitest';
import {
  createButtonObject,
  createEmptyProject,
  createId,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
} from './index';
import type { Project, TriggerAction } from './index';

/** The rest of plan 4.2's actions (docs/briefs/P8.6-course-actions.md). */

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.path);
    throw error;
  }
};

const PDF = 'c'.repeat(64);
const SOUND = 'd'.repeat(64);

/** A slide with a button whose click does `action`, and a PDF and a sound in the course. */
function withAction(action: TriggerAction) {
  const project = createEmptyProject();
  const slide = project.scenes[0]!.slides[0]!;
  const button = createButtonObject('Go');
  slide.baseLayer.objects.push(button);
  slide.triggers.push({
    id: createId('trigger'),
    owner: { kind: 'object', id: button.id },
    event: { type: 'click', object: button.id },
    action,
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  project.assets[PDF] = {
    kind: 'file',
    fileName: 'a.pdf',
    ext: 'pdf',
    mimeType: 'application/pdf',
    byteLength: 1,
  };
  project.assets[SOUND] = {
    kind: 'audio',
    fileName: 'a.wav',
    ext: 'wav',
    mimeType: 'audio/wav',
    byteLength: 1,
  };
  return { project, slide, button };
}

const at = 'scenes[0].slides[0].triggers[0].action';

describe('course actions in the model', () => {
  it('take restart, exit and print as they are', () => {
    for (const type of ['restartCourse', 'exitCourse', 'printSlide'] as const) {
      expect(issues(withAction({ type }).project)).toEqual([]);
    }
  });

  it('send email: an address with no ?, & or #, or none', () => {
    const ok = { type: 'sendEmail', to: 'a@b.example', subject: 'Hi %Name%', body: '' } as const;
    expect(issues(withAction(ok).project)).toEqual([]);
    expect(issues(withAction({ ...ok, to: '' }).project)).toEqual([]);
    for (const to of ['a@b.example?bcc=c@d.example', 'a@b.example&x', 'a#b']) {
      expect(issues(withAction({ ...ok, to }).project), to).toContain(`${at}.to`);
    }
  });

  it('open file: a file or picture of the course, never a sound or a missing one', () => {
    expect(issues(withAction({ type: 'openFile', asset: PDF }).project)).toEqual([]);
    expect(issues(withAction({ type: 'openFile', asset: SOUND }).project)).toContain(`${at}.asset`);
    expect(issues(withAction({ type: 'openFile', asset: 'e'.repeat(64) }).project)).toContain(
      `${at}.asset`,
    );
  });

  it('set focus and seek name the slide’s own object and layer', () => {
    const { project, slide, button } = withAction({ type: 'setFocus', object: 'obj_none' });
    expect(issues(project)).toContain(`${at}.object`);
    slide.triggers[0]!.action = { type: 'setFocus', object: button.id };
    expect(issues(project)).toEqual([]);
    slide.triggers[0]!.action = { type: 'seekTimeline', layer: 'layer_none', time: 2 };
    expect(issues(project)).toContain(`${at}.layer`);
    slide.triggers[0]!.action = { type: 'seekTimeline', layer: slide.baseLayer.id, time: 2 };
    expect(issues(project)).toEqual([]);
  });

  it('migrate from format 24 unchanged', () => {
    const old = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    old['formatVersion'] = 24;
    const project = parseProject(migrateToCurrent(old));
    expect(project.player).toEqual(createEmptyProject().player);
  });
});
