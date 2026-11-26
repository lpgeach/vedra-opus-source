import { accessibilityIssues } from '@vedraopus/model';
import type { A11yIssue, A11yIssueKind, Project, SceneObject, Slide } from '@vedraopus/model';
import { useMemo } from 'react';
import { editor } from '../project-store';
import type { OpenProject } from '../project-store';

/**
 * The right panel's Check tab (docs/briefs/P10.2-accessibility-checker.md): what
 * a learner using a screen reader, the keyboard or captions would miss, slide
 * by slide, kept up to date as the project changes. Show goes to the object;
 * fixes are made where they already are.
 */

const KIND_WORDS: Record<A11yIssueKind, string> = {
  altText: 'Alt text',
  focusOrder: 'Tab order',
  contrast: 'Contrast',
  captions: 'Captions',
};

/** Where an object is: its layer (null for the base) and the top-level object holding it. */
function placeOf(slide: Slide, objectId: string): { layerId: string | null; topId: string } | null {
  const holds = (object: SceneObject): boolean =>
    object.id === objectId || (object.type === 'group' && object.children.some(holds));
  for (const layer of [slide.baseLayer, ...slide.layers]) {
    const top = layer.objects.find(holds);
    if (top) return { layerId: layer === slide.baseLayer ? null : layer.id, topId: top.id };
  }
  return null;
}

function show(project: Project, issue: A11yIssue) {
  const slide = [...project.scenes, ...project.banks]
    .flatMap((scene) => scene.slides)
    .find((each) => each.id === issue.slideId);
  if (!slide) return;
  editor.editSlide(slide.id);
  const place = issue.objectId ? placeOf(slide, issue.objectId) : null;
  editor.editLayer(place?.layerId ?? null);
  if (place) editor.select([place.topId]);
}

export function AccessibilityCheck({ open }: { open: OpenProject }) {
  const { project } = open;
  const issues = useMemo(() => accessibilityIssues(project), [project]);
  const slides = useMemo(
    () => [...project.scenes, ...project.banks].flatMap((scene) => scene.slides),
    [project],
  );
  const bySlide = slides
    .map((slide) => ({ slide, found: issues.filter((issue) => issue.slideId === slide.id) }))
    .filter(({ found }) => found.length > 0);

  return (
    <div className="a11y-check" data-testid="a11y-check">
      <p className="a11y-check-summary" role="status">
        {issues.length === 0
          ? 'No problems found.'
          : `${issues.length} ${issues.length === 1 ? 'problem' : 'problems'} found.`}
      </p>
      <p className="muted">
        Alt text, the Tab order, text contrast and captions, as learners meet them. Shapes drawn by
        a slide’s master or layout are not counted behind text.
      </p>
      {bySlide.map(({ slide, found }) => (
        <section key={slide.id} className="a11y-check-slide">
          <h3>{slide.title.trim() || 'Untitled slide'}</h3>
          <ul>
            {found.map((issue, index) => {
              // Each Show button is described by its own problem, so a screen reader can tell them apart.
              const id = `a11y-issue-${slide.id}-${index}`;
              return (
                <li
                  key={`${issue.kind}-${issue.objectId ?? 'slide'}-${index}`}
                  data-testid="a11y-issue"
                >
                  <span className="a11y-check-kind">{KIND_WORDS[issue.kind]}</span>
                  <span className="a11y-check-message" id={id}>
                    {issue.message}
                  </span>
                  <button type="button" aria-describedby={id} onClick={() => show(project, issue)}>
                    Show
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
