import {
  createBank,
  createDrawSlide,
  createEmptyProject,
  createScene,
  createSlide,
} from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { menuAllows, menuTree, speedClock } from './frame';

/** The player frame's menu and clock (docs/briefs/P8.1-player-frame.md). */

function course() {
  const project = createEmptyProject('Menu');
  const intro = createSlide('Intro');
  const draw = createDrawSlide(null, 'Quiz');
  const end = createSlide('');
  const bank = createBank('Bank', project.stage);
  project.banks = [bank];
  draw.draw!.bank = bank.id;
  project.scenes = [
    { ...createScene('Part one'), slides: [intro, draw] },
    { ...createScene('Part two'), slides: [end] },
  ];
  return { project, intro, draw, end, bank };
}

describe('menuTree', () => {
  it('lists scenes and their slides, a draw as one entry for what it drew, never bank slides', () => {
    const { project, intro, draw, end, bank } = course();
    const drawn = bank.slides[0]!.id;
    expect(menuTree(project, { [draw.id]: [drawn] })).toEqual([
      {
        id: project.scenes[0]!.id,
        title: 'Part one',
        items: [
          { id: intro.id, title: 'Intro', slides: [intro.id] },
          { id: draw.id, title: 'Quiz', slides: [drawn] },
        ],
      },
      {
        id: project.scenes[1]!.id,
        title: 'Part two',
        items: [{ id: end.id, title: 'Untitled slide', slides: [end.id] }],
      },
    ]);
  });

  it('uses the author’s titles, and leaves out hidden entries and scenes left empty', () => {
    const { project, intro, end } = course();
    project.player.menu.entries = {
      [intro.id]: { title: 'Welcome', hidden: false },
      [end.id]: { title: null, hidden: true },
    };
    const tree = menuTree(project);
    expect(tree.map((scene) => scene.title)).toEqual(['Part one']);
    expect(tree[0]!.items[0]!.title).toBe('Welcome');
  });
});

describe('menuAllows', () => {
  const item = (slides: string[]) => ({ id: slides[0] ?? 'x', title: 'x', slides });
  it('lets free navigation go anywhere, restricted only where the learner has been, locked nowhere', () => {
    const seen = new Set(['a']);
    expect(menuAllows('free', item(['b']), seen, 'c')).toBe(true);
    expect(menuAllows('restricted', item(['a']), seen, 'c')).toBe(true);
    expect(menuAllows('restricted', item(['c']), seen, 'c')).toBe(true);
    expect(menuAllows('restricted', item(['b']), seen, 'c')).toBe(false);
    expect(menuAllows('locked', item(['a']), seen, 'a')).toBe(false);
    // A draw that drew nothing goes nowhere.
    expect(menuAllows('free', item([]), seen, 'c')).toBe(false);
  });
});

describe('speedClock', () => {
  it('runs at the speed in force since the last change', () => {
    let real = 1000;
    const clock = speedClock(() => real);
    expect(clock.now()).toBe(1000);
    real = 2000;
    expect(clock.now()).toBe(2000);
    clock.setRate(2);
    // 500 ms of real time at 2× is 1000 ms of course time.
    real = 2500;
    expect(clock.now()).toBe(3000);
    clock.setRate(0.5);
    // 1000 ms at 0.5× is 500.
    real = 3500;
    expect(clock.now()).toBe(3500);
    expect(clock.rate).toBe(0.5);
  });
});
