import { parseProject, serializeProject } from '@vedraopus/model';
import type { SceneObject, Slide } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { convertStoryline } from './convert';
import { IDS, testStoryPackage, testStoryParts } from './test-story';

/** What Sample B's report had left that behaves differently (docs/briefs/B12-storyline-leftovers.md). */

const ANSWER = '30000000-0000-4000-8000-000000000001';
const A = '30000000-0000-4000-8000-000000000011';
const B = '30000000-0000-4000-8000-000000000012';

const trig = (event: string, action: string, inner: string, extra = '', conditions = '') =>
  `<trig type="user"${extra}><data enabled="true" event="${event}" action="${action}" actSubType="next">${inner}</data><condLst>${conditions}</condLst></trig>`;
const hideOnClick = (g: string) =>
  `<trigLst>${trig('OnClick', 'changeShapeState', `<shape setStateG="${g}" setStateName="Hidden" />`)}</trigLst>`;
const rect = (g: string, name: string, inner: string) =>
  `<rect g="${g}" name="${name}" zOrder="40"><sldSz w="960" h="540" /><loc l="0" t="0" r="100" b="50" />${inner}</rect>`;

function convert() {
  const parts = testStoryParts();
  const story = parts.get('story/story.xml')!.toString('utf8');
  parts.set(
    'story/story.xml',
    Buffer.from(
      story.replace(
        '</varLst>',
        `<var g="${ANSWER}" name="Answer" dataType="text" val="" type="user" /></varLst>`,
      ),
    ),
  );
  const slide2 = parts.get('story/slides/slide2.xml')!.toString('utf8');
  const triggers =
    // "When the state of both is not Normal": the slide's, read before the clicks that hide them.
    trig(
      'OnStateChange',
      'adjustVar',
      `<shape stateInclude="all" statesNot="not" stateName="Normal"><stateLst><g>${A}</g><g>${B}</g></stateLst></shape>` +
        `<other varG="${IDS.seen}" op="ass" boolVal="True" useVar="false" />`,
    ) +
    // "Answer is equal to 'yes', ignoring case".
    trig(
      'OnStart',
      'adjustVar',
      `<other varG="${IDS.score}" op="ass" dblVal="1" useVar="false" />`,
      '',
      `<trigCond op="eqIgnore" strVal1="yes" varG="${ANSWER}" dataType="value" andOr="and" />`,
    ) +
    // One Storyline makes for itself.
    trig('OnClick', 'jumpToSlide', '<slide />').replace(
      'type="user"',
      'type="internal" name="fakeTrigger"',
    );
  parts.set(
    'story/slides/slide2.xml',
    Buffer.from(
      slide2
        .replace(
          '</shapeLst>',
          `${rect(A, 'Card A', hideOnClick(A))}${rect(B, 'Card B', hideOnClick(B))}</shapeLst>`,
        )
        .replace('<trigLst /></sld>', `<trigLst>${triggers}</trigLst></sld>`),
    ),
  );
  return convertStoryline(testStoryPackage(parts), { fileName: 'Test course', media: () => null });
}

const slide2 = (result: ReturnType<typeof convert>): Slide => result.project.scenes[0]!.slides[1]!;
const object = (slide: Slide, name: string): SceneObject =>
  slide.baseLayer.objects.find((each) => each.name === name)!;

describe('the Sample B report’s leftovers (B12)', () => {
  it('keeps “equal, ignoring case” as ours', () => {
    const result = convert();
    const answer = result.project.variables.find((v) => v.name === 'Answer')!;
    const started = slide2(result).triggers.find(
      (trigger) => trigger.event.type === 'timelineStart' && trigger.conditions,
    )!;
    expect(started.conditions).toEqual({
      combine: 'and',
      items: [
        {
          subject: 'variable',
          variable: answer.id,
          operator: '==i',
          value: { kind: 'literal', value: 'yes' },
        },
      ],
    });
  });

  it('waits for every object to leave a state, with the states the slide’s triggers give them', () => {
    const slide = slide2(convert());
    const [a, b] = [object(slide, 'Card A').id, object(slide, 'Card B').id];
    const waits = slide.triggers.filter((trigger) => trigger.event.type === 'stateChange');
    expect(waits.map(({ event, conditions }) => ({ event, conditions }))).toEqual([
      {
        event: { type: 'stateChange', object: a, state: 'hidden' },
        conditions: {
          combine: 'and',
          items: [{ subject: 'objectState', object: b, operator: '!=', state: 'normal' }],
        },
      },
      {
        event: { type: 'stateChange', object: b, state: 'hidden' },
        conditions: {
          combine: 'and',
          items: [{ subject: 'objectState', object: a, operator: '!=', state: 'normal' }],
        },
      },
    ]);
  });

  it('leaves out Storyline’s own triggers, and reports none of these', () => {
    const result = convert();
    expect(
      slide2(result).triggers.some(
        (trigger) => trigger.owner.kind === 'slide' && trigger.event.type === 'click',
      ),
    ).toBe(false);
    expect(result.report.filter((item) => item.slide === 2).map((item) => item.what)).toEqual([]);
    expect(() => parseProject(JSON.parse(serializeProject(result.project)))).not.toThrow();
  });
});
