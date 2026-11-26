import { describe, expect, it } from 'vitest';
import { describeAction, describeCondition, describeEvent } from './describe';
import type { Names } from './describe';

const names = { object: (id: string) => (id === 'a' ? 'Narration' : id) } as unknown as Names;

describe('media trigger sentences', () => {
  it('names the sound in each media action and the completes event', () => {
    expect(describeAction({ type: 'playMedia', object: 'a' }, names)).toBe('Play media Narration');
    expect(describeAction({ type: 'pauseMedia', object: 'a' }, names)).toBe(
      'Pause media Narration',
    );
    expect(describeAction({ type: 'stopMedia', object: 'a' }, names)).toBe('Stop media Narration');
    expect(describeEvent({ type: 'mediaCompletes', object: 'a' }, names)).toBe(
      'when Narration completes',
    );
  });
});

describe('animation trigger sentences', () => {
  const animated = {
    object: () => 'Ball',
    path: (_: string, id: string) => (id === 'p' ? 'Drop' : 'a missing path'),
  } as unknown as Names;

  it('names the object and its path, and which animation finished', () => {
    expect(describeAction({ type: 'moveAlongPath', object: 'b', path: 'p' }, animated)).toBe(
      'Move Ball along Drop',
    );
    expect(
      describeEvent(
        { type: 'animationCompletes', object: 'b', animation: { kind: 'path', path: 'p' } },
        animated,
      ),
    ).toBe('when Ball finishes moving along Drop');
    expect(
      describeEvent(
        { type: 'animationCompletes', object: 'b', animation: { kind: 'entrance' } },
        animated,
      ),
    ).toBe('when Ball finishes its entrance');
  });
});

describe('condition sentences', () => {
  const named = { variable: () => 'Answer' } as unknown as Names;

  it('says when a comparison ignores case (B12)', () => {
    const condition = (operator: '==i' | '!=i') =>
      describeCondition(
        { subject: 'variable', variable: 'v', operator, value: { kind: 'literal', value: 'yes' } },
        named,
      );
    expect(condition('==i')).toBe('Answer is, ignoring case, “yes”');
    expect(condition('!=i')).toBe('Answer is not, ignoring case, “yes”');
  });
});
