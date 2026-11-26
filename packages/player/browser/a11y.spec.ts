import {
  accentFor,
  contrastRatio,
  createButtonObject,
  createCheckboxObject,
  createDialObject,
  createDropdownObject,
  createEmptyProject,
  createGraphicObject,
  createGroupObject,
  createHotspotObject,
  createId,
  createImageObject,
  createMarkerObject,
  createPanoramaObject,
  createPanoramaSpot,
  createQuestionSlide,
  createRadioObject,
  createScene,
  createShapeObject,
  createSlide,
  createSliderObject,
  createTableObject,
  createTextEntryObject,
  createTextObject,
  createWebObject,
  parseProject,
  PLAYER_SCHEMES,
  plainRichText,
  withCell,
} from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * WCAG 2.2 AA in published courses (docs/briefs/P10.1-accessibility.md): axe-core
 * on every slide of every fixture project, and of a course with every kind of
 * object. axe-core is a test-only dependency; it is never shipped.
 */

const dist = join(import.meta.dirname, '../dist');
const fixtures = join(import.meta.dirname, '../../../fixtures/projects');
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const PICTURE = readdirSync(join(fixtures, 'two-slides/assets'))[0]!;
const HASH = PICTURE.replace(/\.png$/, '');
/**
 * The key that moves to the next link or button. WebKit on macOS, like Safari unless
 * "Press Tab to highlight each item" is on, skips links and buttons on a plain Tab.
 */
const nextKey = (browserName: string) =>
  browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';

/** A page with the player and these assets beside it. */
function page(assetsFrom: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-a11y-'));
  cpSync(join(dist, 'player.js'), join(dir, 'player.js'));
  cpSync(join(dist, 'player.css'), join(dir, 'player.css'));
  mkdirSync(join(dir, 'assets'));
  if (assetsFrom && existsSync(assetsFrom))
    cpSync(assetsFrom, join(dir, 'assets'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Course</title><link rel="stylesheet" href="player.css">
<style>html,body{margin:0;height:100%}#app{width:1280px;height:800px}</style></head>
<body><div id="app"></div><script src="player.js"></script></body></html>`,
  );
  return pathToFileURL(join(dir, 'index.html')).href;
}

async function mount(browserPage: Page, project: Project, assetsFrom: string | null) {
  await browserPage.goto(page(assetsFrom));
  await browserPage.evaluate((data) => {
    const w = window as unknown as Record<string, unknown>;
    w['player'] = (
      w['VedraOpusPlayer'] as { mountPlayer: (...args: unknown[]) => unknown }
    ).mountPlayer(document.getElementById('app'), data, { reducedMotion: true });
  }, project);
  await browserPage.addScriptTag({ path: axePath });
}

/** What axe finds against WCAG 2.0 to 2.2, A and AA, on what is shown now. */
async function violations(browserPage: Page): Promise<string[]> {
  return browserPage.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run(
            ...args: unknown[]
          ): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }>;
        };
      }
    ).axe;
    const result = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    });
    return result.violations.map(
      (each) => `${each.id}: ${each.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    );
  });
}

/** Every slide in turn, by the player's Next. */
async function eachSlide(browserPage: Page, check: (index: number) => Promise<void>) {
  const position = browserPage.locator('.vo-player-position');
  for (let index = 0; ; index++) {
    await browserPage.waitForTimeout(300);
    await check(index);
    const next = browserPage.locator('.vo-player-next');
    if ((await next.isDisabled()) || !(await next.isVisible())) break;
    const before = await position.textContent();
    await next.click();
    await expect(position).not.toHaveText(before ?? '');
  }
}

/** A course with one of every kind of object, each named or marked decorative. */
function everything(): Project {
  const project = createEmptyProject('Every object');
  project.assets[HASH] = {
    kind: 'image',
    fileName: 'picture.png',
    ext: 'png',
    mimeType: 'image/png',
    byteLength: 1,
  };
  const one = createSlide('Objects');
  const words = createTextObject('Some words on the slide', {
    x: 20,
    y: 20,
    width: 400,
    height: 60,
  });
  const shape = createShapeObject({ kind: 'rect' }, { x: 20, y: 100, width: 100, height: 60 });
  shape.a11y = { altText: '', visibleToAssistiveTech: false };
  const named = createShapeObject({ kind: 'ellipse' }, { x: 140, y: 100, width: 100, height: 60 });
  named.a11y = { altText: 'A blue circle', visibleToAssistiveTech: true };
  const picture = createImageObject(HASH, { x: 260, y: 100, width: 64, height: 64 });
  picture.a11y = { altText: 'A square picture', visibleToAssistiveTech: true };
  const button = createButtonObject('Go on', { x: 20, y: 200 });
  const hotspot = createHotspotObject({ x: 400, y: 200, width: 100, height: 60 });
  hotspot.a11y = { altText: 'The door', visibleToAssistiveTech: true };
  const marker = createMarkerObject({ x: 520, y: 200 });
  const box = createCheckboxObject('Tick me', { x: 20, y: 280, width: 240, height: 40 });
  const radio = createRadioObject('Choose me', 'Group 1', {
    x: 20,
    y: 330,
    width: 240,
    height: 40,
  });
  const field = createTextEntryObject(
    { x: 300, y: 280, width: 240, height: 40 },
    false,
    'Your name',
  );
  const menu = createDropdownObject(['Red', 'Green'], { x: 300, y: 330 }, 'Colour');
  const slider = createSliderObject({ x: 600, y: 280, width: 300, height: 40 }, 'Volume');
  const dial = createDialObject({ x: 940, y: 260, width: 120, height: 120 }, 'Heat');
  one.baseLayer.objects.push(
    words,
    shape,
    named,
    picture,
    button,
    hotspot,
    marker,
    box,
    radio,
    field,
    menu,
    slider,
    dial,
  );
  one.triggers.push({
    id: createId('trigger'),
    owner: { kind: 'object', id: button.id },
    event: { type: 'click', object: button.id },
    action: { type: 'jumpToSlide', target: { kind: 'next' } },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  const two = createSlide('More objects');
  const table = createTableObject(2, 2, { x: 20, y: 20, width: 400, height: 100 });
  table.a11y = { altText: 'Prices', visibleToAssistiveTech: true };
  table.props.rows = withCell(table.props, 0, 0, { text: plainRichText('Item') }).rows;
  table.props.rows = withCell(table.props, 0, 1, { text: plainRichText('Price') }).rows;
  table.props.rows = withCell(table.props, 1, 0, { text: plainRichText('Tea') }).rows;
  table.props.rows = withCell(table.props, 1, 1, { text: plainRichText('£3') }).rows;
  const icon = createGraphicObject(
    {
      library: 'lucide',
      key: 'heart',
      title: 'Heart',
      viewBox: { width: 24, height: 24 },
      strokeWidth: 2,
      nodes: [
        {
          tag: 'circle',
          attrs: { cx: '12', cy: '12', r: '8', fill: 'none', stroke: 'ink' },
          children: [],
        },
      ],
    },
    { x: 460, y: 20 },
  );
  const web = createWebObject({ kind: 'url', url: 'https://example.com' }, 'Example page', {
    x: 20,
    y: 160,
    width: 300,
    height: 200,
  });
  web.props.display = 'window';
  const panel = createGroupObject(
    [
      createTextObject('First part', { x: 600, y: 160, width: 300, height: 200 }),
      createTextObject('Second part', { x: 600, y: 380, width: 300, height: 200 }),
    ],
    'Panel',
  );
  panel.scroll = { height: 200 };
  const room = createPanoramaObject(HASH, { x: 20, y: 420, width: 400, height: 200 });
  room.props.spots = [createPanoramaSpot('Door', 0, 0)];
  two.baseLayer.objects.push(table, icon, web, panel, room);
  const quiz = createQuestionSlide('multipleChoice', project.stage);
  quiz.question!.feedback.by = 'none';
  // A freeform question's choices are shapes, which start decorative: they must still be read (P10.1).
  const pictures = createQuestionSlide('freePickOne', project.stage);
  pictures.question!.feedback.by = 'none';
  project.scenes = [{ ...createScene(), slides: [one, two, quiz, pictures] }];
  return parseProject(JSON.parse(JSON.stringify(project)));
}

const courses: [string, () => Project, string | null][] = [
  ...readdirSync(fixtures).map(
    (name) =>
      [
        `fixture ${name}`,
        () => parseProject(JSON.parse(readFileSync(join(fixtures, name, 'project.json'), 'utf8'))),
        join(fixtures, name, 'assets'),
      ] as [string, () => Project, string | null],
  ),
  ['a course with every kind of object', everything, join(fixtures, 'two-slides/assets')],
];

for (const [name, make, assets] of courses) {
  test(`axe finds nothing on any slide: ${name}`, async ({ page: browserPage }) => {
    // Nothing leaves the machine.
    await browserPage.route(/^https?:\/\//, (route) => route.abort());
    await mount(browserPage, make(), assets);
    const found: string[] = [];
    await eachSlide(browserPage, async (index) => {
      for (const problem of await violations(browserPage))
        found.push(`slide ${index + 1}: ${problem}`);
    });
    expect(found).toEqual([]);
  });
}

test('a slide button is a button reached with Tab and pressed with Enter; decoration is hidden', async ({
  page: browserPage,
  browserName,
}) => {
  await mount(browserPage, everything(), join(fixtures, 'two-slides/assets'));
  const stage = browserPage.locator('.vo-player-stage');
  // The course is a named region, not an application, so screen readers keep their reading keys.
  await expect(browserPage.locator('.vo-player')).toHaveAttribute('role', 'region');
  const button = stage.getByRole('button', { name: 'Go on', exact: true });
  await expect(button).toHaveAttribute('tabindex', '0');
  await expect(stage.getByRole('img', { name: 'A blue circle' })).toBeVisible();
  await expect(stage.getByRole('img', { name: 'A square picture' })).toBeVisible();
  // The rectangle marked decorative is hidden from screen readers.
  await expect(stage.locator('[data-object-type="shape"][aria-hidden="true"]')).toHaveCount(1);
  // Tab from the start: the skip link first, then into the slide.
  await browserPage.locator('.vo-player').focus();
  await browserPage.keyboard.press(nextKey(browserName));
  await expect(browserPage.getByRole('link', { name: 'Skip to slide' })).toBeFocused();
  await browserPage.keyboard.press('Enter');
  const focused = await browserPage.evaluate(
    () => document.activeElement?.closest('.vo-player-stage') !== null,
  );
  expect(focused).toBe(true);
  // The focus shows: a ring round the focused object.
  await button.focus();
  const ring = await button.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(ring).not.toBe('none');
  // Enter presses it: its trigger goes on, and the new slide's title is announced.
  await browserPage.keyboard.press('Enter');
  await expect(browserPage.locator('.vo-player-position')).toHaveText('Slide 2 of 4');
  // Focus was on the button, which went with its slide: it is on the new slide now, not lost.
  await expect
    .poll(() =>
      browserPage.evaluate(() => document.activeElement?.closest('.vo-player-stage') !== null),
    )
    .toBe(true);
  await expect(browserPage.locator('.vo-player-announcer')).toHaveText('More objects');
  await expect(stage).toHaveAttribute('aria-label', 'More objects');
});

test('a question’s result and a layer shown are announced', async ({ page: browserPage }) => {
  const project = everything();
  const quiz = project.scenes[0]!.slides[2]!;
  // Feedback by layer for this one: the result and the feedback layer are both said.
  quiz.question!.feedback.by = 'question';
  await mount(browserPage, parseProject(JSON.parse(JSON.stringify(project))), null);
  const announcer = browserPage.locator('.vo-player-announcer');
  await browserPage.locator('.vo-player-next').click();
  await browserPage.locator('.vo-player-next').click();
  await expect(announcer).not.toHaveText('');
  const choice = browserPage.locator('.vo-player-stage [role="radio"]').first();
  await choice.click();
  await browserPage
    .locator('.vo-player-stage')
    .getByRole('button', { name: /Submit/ })
    .click();
  await expect(announcer).toHaveText(/Correct|Incorrect/);
});

test('Tab follows the layout, or the author’s order, and leaves the slide at the end (P10.1)', async ({
  page: browserPage,
}) => {
  const build = (order: 'layout' | 'own') => {
    const project = createEmptyProject('Order');
    const slide = createSlide('Buttons');
    // Drawn bottom-right first, so the drawing order is not the layout's.
    const c = createButtonObject('C', { x: 800, y: 500 });
    const a = createButtonObject('A', { x: 40, y: 40 });
    const b = createButtonObject('B', { x: 600, y: 42 });
    slide.baseLayer.objects.push(c, a, b);
    if (order === 'own') slide.properties.focusOrder = [c.id, a.id];
    project.scenes = [{ ...createScene(), slides: [slide] }];
    return project;
  };
  const focusedName = () =>
    browserPage.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
  for (const [order, expected] of [
    ['layout', ['A', 'B', 'C']],
    ['own', ['C', 'A', 'B']],
  ] as const) {
    await mount(browserPage, build(order), null);
    const stage = browserPage.locator('.vo-player-stage');
    await stage.getByRole('button', { name: expected[0], exact: true }).focus();
    const seen = [await focusedName()];
    await browserPage.keyboard.press('Tab');
    seen.push(await focusedName());
    await browserPage.keyboard.press('Tab');
    seen.push(await focusedName());
    expect(seen, order).toEqual([...expected]);
    // Past the last, Tab leaves the slide for the player's controls.
    await browserPage.keyboard.press('Tab');
    expect(
      await browserPage.evaluate(() => !!document.activeElement?.closest('.vo-player-stage')),
    ).toBe(false);
    // And Shift+Tab comes back to the last.
    await browserPage.keyboard.press('Shift+Tab');
    expect(await focusedName()).toBe(expected[2]);
  }
});

test('the player draws the model’s colours in each scheme, and a faint accent made strong enough (P10.1)', async ({
  page: browserPage,
  browserName,
}) => {
  /** `rgb(r, g, b)` as `#rrggbb`. */
  const hex = (rgb: string) =>
    `#${(rgb.match(/\d+/g) ?? [])
      .slice(0, 3)
      .map((value) => Number(value).toString(16).padStart(2, '0'))
      .join('')}`;
  // Pale yellow: strong enough on the dark scheme, too faint on the light.
  const accent = '#ffee88';
  for (const [scheme, system, drawn] of [
    ['dark', 'light', 'dark'],
    ['light', 'dark', 'light'],
    ['auto', 'dark', 'dark'],
    ['auto', 'light', 'light'],
  ] as const) {
    await browserPage.emulateMedia({ colorScheme: system });
    const project = createEmptyProject('Colours');
    project.player.look.scheme = scheme;
    project.player.look.accent = accent;
    await mount(browserPage, project, null);
    const root = browserPage.locator('.vo-player');
    const colours = await root.evaluate((element) => {
      const style = getComputedStyle(element);
      // The built stylesheet is minified: #ffffff may come back as #fff.
      const read = (name: string) =>
        style
          .getPropertyValue(name)
          .trim()
          .toLowerCase()
          .replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/, '#$1$1$2$2$3$3');
      return {
        bg: read('--vo-bg'),
        fg: read('--vo-fg'),
        chrome: read('--vo-chrome'),
        control: read('--vo-control'),
        border: read('--vo-border'),
        sheetBg: read('--vo-sheet-bg'),
        sheetFg: read('--vo-sheet-fg'),
        link: read('--vo-link'),
        accent: read('--vo-accent'),
      };
    });
    const { accent: shown, ...rest } = colours;
    expect(rest, `${scheme} on a ${system} system`).toEqual(PLAYER_SCHEMES[drawn]);
    expect(shown).toBe(accentFor(accent, drawn));
    // The focus ring on the player's own buttons is that shade, and stands out from the chrome.
    const a11yButton = browserPage.getByRole('button', { name: 'Accessibility', exact: true });
    // Reached by keyboard, so the ring shows (`:focus-visible`).
    await root.focus();
    for (
      let i = 0;
      i < 20 && !(await a11yButton.evaluate((e) => e === document.activeElement));
      i++
    ) {
      await browserPage.keyboard.press(nextKey(browserName));
    }
    await expect(a11yButton).toBeFocused();
    const ring = hex(
      await a11yButton.evaluate((element) => getComputedStyle(element).outlineColor),
    );
    expect(ring).toBe(accentFor(accent, drawn));
    expect(contrastRatio(ring, PLAYER_SCHEMES[drawn].chrome)).toBeGreaterThanOrEqual(3);
  }
});
