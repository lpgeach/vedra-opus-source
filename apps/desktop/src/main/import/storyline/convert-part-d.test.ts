import { parseProject, serializeProject } from '@vedraopus/model';
import type { Project, SceneObject, Slide } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { convertStoryline } from './convert';
import { IDS, testStoryPackage, testStoryParts } from './test-story';

/** Questions and results (docs/briefs/B5d-storyline-questions.md), in a course made by our code. */

const NO_ID = '00000000-0000-0000-0000-000000000000';
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const G = {
  pick: id(1),
  drag: id(2),
  results: id(3),
  choiceA: id(11),
  choiceB: id(12),
  submit: id(13),
  correctLayer: id(14),
  incorrectLayer: id(15),
  item1: id(21),
  item2: id(22),
  decoy: id(23),
  target1: id(24),
  target2: id(25),
  passed: id(31),
  failed: id(32),
  showPassed: id(33),
  showFailed: id(34),
  retry: id(35),
  passPoints: id(36),
  scorePoints: id(37),
};

const loc = (l: number, t: number) =>
  `<sldSz w="960" h="540" /><loc l="${l}" t="${t}" r="${l + 100}" b="${t + 50}" />`;
const rect = (g: string, name: string, inner = '', l = 0, t = 0) =>
  `<rect g="${g}" name="${name}" zOrder="1">${loc(l, t)}${inner}</rect>`;
const states = (...names: string[]) =>
  `<stateLst>${names.map((name) => `<state name="${name}"><shapeLst /></state>`).join('')}</stateLst>`;
const trig = (event: string, action: string, inner: string, g = '', conditions = '') =>
  `<trig${g ? ` g="${g}"` : ''} type="user"><data enabled="true" event="${event}" action="${action}" actSubType="spec">${inner}</data><condLst>${conditions}</condLst></trig>`;
const props = (attrs: string) =>
  `<intrProps feedbk="intr" score="intr" branch="none" corPts="20" attempts="two" showCorFb="true" showIncFb="true" showTryFb="true" ${attrs} />`;
const choice = (shpG: string, correct: boolean, matchShpG = NO_ID) =>
  `<intrFreeChoice shpG="${shpG}" matchShpG="${matchShpG}"><scoringData${correct ? ' correct="true"' : ''} /></intrFreeChoice>`;
const feedbackLayer = (g: string, defaultName: string) =>
  `<feedBackLayer g="${g}" name="" defaultName="${defaultName}" modal="true" pause="true"><tmProps min="3000" /><shapeLst /></feedBackLayer>`;

const slides: Record<string, string> = {
  // Pick many: A (correct) and B, a choice whose shape is gone, a Submit shape, two feedback layers.
  pick:
    `<sld g="${G.pick}" name="Pick"><tmProps min="5000" /><shapeLst>` +
    rect(G.choiceA, 'Choice A', states('Normal', 'Selected')) +
    rect(G.choiceB, 'Choice B', '', 0, 100) +
    rect(
      G.submit,
      'Submit',
      `<trigLst>${trig('OnClick', 'submitInteraction', `<interaction submitG="${id(9)}" />`)}</trigLst>`,
      0,
      200,
    ) +
    `<freePickManyIntr g="${id(9)}" zOrder="4">${loc(0, 0)}${props(`corFbG="${G.correctLayer}" incFbG="${G.incorrectLayer}" tryFbG="${NO_ID}"`)}` +
    `<choices>${choice(G.choiceA, true)}${choice(G.choiceB, false)}${choice(id(99), false)}</choices></freePickManyIntr>` +
    `</shapeLst><sldLayerLst>${feedbackLayer(G.correctLayer, 'Correct')}${feedbackLayer(G.incorrectLayer, 'Incorrect')}</sldLayerLst>` +
    `<trigLst>${trig('OnStart', 'showSubSlide', `<sldLayer showG="${G.incorrectLayer}" />`)}</trigLst></sld>`,
  // Drag and drop: two items with targets (one with drop states), a decoy, and a "dropped on" trigger.
  drag:
    `<sld g="${G.drag}" name="Drag"><tmProps min="5000" /><shapeLst>` +
    rect(
      G.item1,
      'Item 1',
      states('Normal', 'Drop Correct', 'Drop Incorrect') +
        `<trigLst>${trig('OnDrop', 'adjustVar', `<shape><dropLst><g>${G.target1}</g><g>${G.target2}</g></dropLst></shape><other varG="${IDS.seen}" op="ass" boolVal="True" useVar="false" />`)}</trigLst>`,
    ) +
    rect(G.item2, 'Item 2', '', 0, 100) +
    rect(G.decoy, 'Decoy', '', 0, 200) +
    rect(G.target1, 'Target 1', '', 500, 0) +
    rect(G.target2, 'Target 2', '', 500, 100) +
    `<dragDropIntr g="${id(8)}" zOrder="9">${loc(0, 0)}${props(`feedbk="none" attempts="unlimited" corFbG="${NO_ID}" incFbG="${NO_ID}" tryFbG="${NO_ID}"`).replace(' feedbk="intr"', '').replace(' attempts="two"', '')}` +
    `<choices>${choice(G.item1, false, G.target1)}${choice(G.item2, false, G.target2)}${choice(G.decoy, false)}</choices>` +
    `<dragDrop snapTarget="true" returnStart="false" onlyOne="true" delay="true" /></dragDropIntr>` +
    `</shapeLst><trigLst /></sld>`,
  // A result: Passed and Failed layers with the triggers that show them, and a Retry button.
  results:
    `<sld g="${G.results}" name="Results"><tmProps min="5000" /><shapeLst>` +
    `<rsltsIntr g="${id(7)}" zOrder="1">${loc(0, 0)}<intrProps feedbk="none" />` +
    `<success g="${G.passed}" trigG="${G.showPassed}" /><failure g="${G.failed}" trigG="${G.showFailed}" /></rsltsIntr>` +
    `<rsltBtn g="${G.retry}" name="Retry" zOrder="2" btnType="retryQuiz">${loc(400, 400)}` +
    `<bG><solidFill><clr><schemeClr val="accent1" /></clr></solidFill><noLine /></bG>` +
    // Its words are on its Normal state only.
    `<stateLst><state name="Normal"><shapeLst><rsltBtn name="Retry"><plain>Retry Quiz</plain></rsltBtn></shapeLst></state></stateLst>` +
    `</rsltBtn>` +
    `</shapeLst><sldLayerLst>` +
    `<sldLayer g="${G.passed}" name="Success"><tmProps min="3000" /><shapeLst /></sldLayer>` +
    `<sldLayer g="${G.failed}" name="Failure"><tmProps min="3000" /><shapeLst /></sldLayer>` +
    `</sldLayerLst><trigLst>` +
    trig(
      'OnStart',
      'showSubSlide',
      `<sldLayer showG="${G.passed}" />`,
      G.showPassed,
      `<trigCond op="gte" varG="${G.scorePoints}" varG2="${G.passPoints}" dataType="var" andOr="and" />`,
    ) +
    trig(
      'OnStart',
      'showSubSlide',
      `<sldLayer showG="${G.failed}" />`,
      G.showFailed,
      `<trigCond op="lt" varG="${G.scorePoints}" varG2="${G.passPoints}" dataType="var" andOr="and" />`,
    ) +
    `</trigLst></sld>`,
};

/** The test course with the three slides above after its own, and a quiz counting the first two. */
function questionCourse(quiz = true) {
  const parts = testStoryParts();
  const names = Object.keys(slides);
  for (const name of names) parts.set(`story/slides/${name}.xml`, Buffer.from(slides[name]!));
  const rels = parts.get('story/_rels/story.xml.rels')!.toString('utf8');
  parts.set(
    'story/_rels/story.xml.rels',
    Buffer.from(
      rels.replace(
        '</Relationships>',
        `${names.map((name) => `<Relationship Type="slide" Target="/story/slides/${name}.xml" Id="R${name}" />`).join('')}</Relationships>`,
      ),
    ),
  );
  const quizMgr = quiz
    ? `<quizMgr type="graded"><quizLst><quiz name="Results1" timed="true" timeLimit="PT10M" passScore="75" resetincorrectquestionsonly="true" resultSldG="${G.results}">` +
      `<questionIdLst><item>${G.pick}</item><item>${G.drag}</item><item>${id(98)}</item></questionIdLst></quiz></quizLst></quizMgr>`
    : '';
  const story = parts.get('story/story.xml')!.toString('utf8');
  parts.set(
    'story/story.xml',
    Buffer.from(
      story
        .replace(
          '<sldId>Rs2</sldId>',
          `<sldId>Rs2</sldId>${names.map((name) => `<sldId>R${name}</sldId>`).join('')}`,
        )
        .replace(
          '</varLst>',
          `<var g="${G.scorePoints}" name="Results1.ScorePoints" dataType="num" val="0" type="prop" /><var g="${G.passPoints}" name="Results1.PassPoints" dataType="num" val="0" type="prop" /></varLst>${quizMgr}`,
        ),
    ),
  );
  return convertStoryline(testStoryPackage(parts), { fileName: 'Test course', media: () => null });
}

const slideNamed = (project: Project, title: string): Slide =>
  project.scenes.flatMap((scene) => scene.slides).find((slide) => slide.title === title)!;
const objectNamed = (slide: Slide, name: string): SceneObject =>
  [slide.baseLayer, ...slide.layers]
    .flatMap((layer) => layer.objects)
    .find((object) => object.name === name)!;
const reportOn = (report: { slide: number | null; what: string }[], slide: number) =>
  report.filter((item) => item.slide === slide).map((item) => item.what);

describe('questions and results (B5 part D)', () => {
  it('imports a pick-many question with its choices, feedback layers and Submit trigger', () => {
    const { project, report } = questionCourse();
    const slide = slideNamed(project, 'Pick');
    const question = slide.question!;
    expect(question.kind).toBe('freePickMany');
    if (question.kind !== 'freePickMany') return;
    const a = objectNamed(slide, 'Choice A');
    const b = objectNamed(slide, 'Choice B');
    // The choice whose shape is gone is left out.
    expect(question.choices.map(({ object, correct }) => ({ object, correct }))).toEqual([
      { object: a.id, correct: true },
      { object: b.id, correct: false },
    ]);
    // B had no Selected state; it is given one, as ours picks by it.
    expect(b.states.map((state) => state.id)).toContain('selected');
    expect(question.attempts).toBe(2);
    expect(question.scoring).toEqual({ by: 'question', points: 20 });
    expect(question.prompt).toBeNull();
    expect(question.submit).toBeNull();
    // The feedback layers are the slide's layers, named after their kind.
    const layerNamed = (name: string) => slide.layers.find((layer) => layer.name === name)!.id;
    expect(question.feedback).toEqual({
      by: 'question',
      correct: { layer: layerNamed('Correct'), message: null, button: null },
      incorrect: { layer: layerNamed('Incorrect'), message: null, button: null },
      tryAgain: null,
    });
    // The author's Submit shape submits, and a trigger can show a feedback layer.
    const submit = objectNamed(slide, 'Submit');
    expect(slide.triggers.map((trigger) => [trigger.owner.id, trigger.action])).toEqual([
      [slide.id, { type: 'showLayer', layer: layerNamed('Incorrect') }],
      [submit.id, { type: 'submitInteraction' }],
    ]);
    // Nothing on the slide is reported, and its own object is not drawn.
    expect(reportOn(report, 3)).toEqual([]);
    expect(slide.baseLayer.objects.map((object) => object.name)).toEqual([
      'Choice A',
      'Choice B',
      'Submit',
    ]);
  });

  it('imports a drag-and-drop question with its targets, options and "dropped on" trigger', () => {
    const { project, report } = questionCourse();
    const slide = slideNamed(project, 'Drag');
    const question = slide.question!;
    expect(question.kind).toBe('freeDrag');
    if (question.kind !== 'freeDrag') return;
    const [item1, item2, decoy, target1, target2] = [
      'Item 1',
      'Item 2',
      'Decoy',
      'Target 1',
      'Target 2',
    ].map((name) => objectNamed(slide, name).id);
    expect(question.items.map(({ object, target }) => ({ object, target }))).toEqual([
      { object: item1, target: target1 },
      { object: item2, target: target2 },
      { object: decoy, target: null },
    ]);
    expect(question.targets).toEqual([target1, target2]);
    expect(question.snap).toBe(true);
    expect(question.returnToStart).toBe(false);
    // One item on each target, and drop states held until Submit (B11).
    expect(question.onePerTarget).toBe(true);
    expect(question.dropStatesAfterSubmit).toBe(true);
    // "unlimited" attempts, no feedback.
    expect(question.attempts).toBeNull();
    expect(question.feedback).toEqual({
      by: 'none',
      correct: null,
      incorrect: null,
      tryAgain: null,
    });
    // One "dropped on" trigger for each target the course listed.
    expect(slide.triggers.map((trigger) => trigger.event)).toEqual([
      { type: 'droppedOn', object: item1, target: target1 },
      { type: 'droppedOn', object: item1, target: target2 },
    ]);
    expect(reportOn(report, 4)).toEqual([]);
  });

  it('imports a result slide with its questions, pass mark, timer, layers and Retry button', () => {
    const { project, report } = questionCourse();
    const slide = slideNamed(project, 'Results');
    const layerNamed = (name: string) => slide.layers.find((layer) => layer.name === name)!.id;
    expect(slide.result).toEqual({
      kind: 'graded',
      // The quiz's third slide is not in the course.
      include: {
        kind: 'chosen',
        slides: [slideNamed(project, 'Pick').id, slideNamed(project, 'Drag').id],
      },
      passPercent: 75,
      timer: { seconds: 600 },
      layers: { passed: layerNamed('Success'), failed: layerNamed('Failure') },
      // The quiz retries only the wrong answers (B11).
      retryIncorrectOnly: true,
    });
    // The triggers that showed the layers are left out: ours shows them itself.
    const retry = objectNamed(slide, 'Retry');
    expect(retry.type).toBe('shape');
    if (retry.type !== 'shape') return;
    expect(JSON.stringify(retry.props.text)).toContain('"text":"Retry Quiz"');
    expect(slide.triggers).toEqual([
      expect.objectContaining({
        owner: { kind: 'object', id: retry.id },
        event: { type: 'click', object: retry.id },
        action: { type: 'retryQuiz' },
      }),
    ]);
    expect(reportOn(report, 5)).toEqual([
      '1 of the questions this result counts was not imported, so it counts the others',
    ]);
  });

  it('makes a project that validates', () => {
    const { project } = questionCourse();
    expect(() => parseProject(JSON.parse(serializeProject(project)))).not.toThrow();
  });

  it('counts no questions it does not know when the course has no quiz for the result', () => {
    const { project } = questionCourse(false);
    const result = slideNamed(project, 'Results').result!;
    expect(result.include).toEqual({ kind: 'all' });
    expect(result.passPercent).toBe(80);
    expect(result.timer).toBeNull();
    expect(result.retryIncorrectOnly).toBe(false);
    expect(() => parseProject(JSON.parse(serializeProject(project)))).not.toThrow();
  });
});
