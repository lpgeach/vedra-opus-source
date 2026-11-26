import { isRightToLeft } from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { createRenderContext, renderRichText, renderSlide } from '@vedraopus/render';
import { useMemo } from 'react';
import type { SessionInfo } from '../../shared/ipc';
import { t } from '../../shared/strings';
import { handoutPages, handoutSlides } from '../handout';
import type { HandoutOptions } from '../handout';
import { editorAssetUrl } from '../project-store';
import { toReact } from '../stage/RenderTree';

/** The width a slide is drawn at on paper, in CSS pixels (A4 less its margins, or a third of a page). */
const WIDTH = { notes: 640, lines: 300 };

/**
 * The handout (docs/briefs/P11.3-video-and-handout.md, part A): shown only when
 * the window is printed, so main can print it to PDF with the editor's own
 * fonts, styles and media.
 */
export function Handout({
  project,
  session,
  options,
}: {
  project: Project;
  session: SessionInfo;
  options: HandoutOptions;
}) {
  const { theme, stage, assets, masters } = project;
  const context = useMemo(
    () =>
      createRenderContext(
        { theme, stage, assets, masters },
        {
          assetUrl: (hash) => editorAssetUrl(session, { assets, stage }, hash),
          idPrefix: 'handout-',
        },
      ),
    [theme, stage, assets, masters, session],
  );
  const pages = handoutPages(handoutSlides(project, options.sceneId), options.layout);
  const width = WIDTH[options.layout];
  const scale = width / stage.width;
  // The course's language: an Arabic course's handout reads right to left, as the course does.
  const { language } = project.player.labels;
  return (
    <div
      className="print-handout"
      data-testid="handout"
      data-layout={options.layout}
      lang={language}
      dir={isRightToLeft(language) ? 'rtl' : 'ltr'}
    >
      {pages.map((page, pageIndex) => (
        <section className="handout-page" key={pageIndex}>
          {pageIndex === 0 && <h1 className="handout-course">{project.title}</h1>}
          {page.map(({ slide, number }) => (
            <article className="handout-slide" key={slide.id} data-testid="handout-slide">
              <div className="handout-picture-column">
                <h2 className="handout-slide-title">
                  {t('handout.slideTitle', { number, title: slide.title })}
                </h2>
                {/* The slide is drawn at its own size and scaled from its top left, so it
                    stays left to right; its words still take their own direction. */}
                <div
                  className="handout-picture"
                  dir="ltr"
                  style={{ width, height: Math.round(stage.height * scale) }}
                >
                  <div
                    style={{
                      width: stage.width,
                      height: stage.height,
                      transform: `scale(${scale})`,
                      transformOrigin: '0 0',
                    }}
                  >
                    {toReact(renderSlide(slide, context))}
                  </div>
                </div>
              </div>
              {options.layout === 'notes' ? (
                <div className="handout-notes" data-testid="handout-notes">
                  {renderRichText(slide.notes, context).map((node, index) => toReact(node, index))}
                </div>
              ) : (
                <div className="handout-lines" aria-hidden="true">
                  {Array.from({ length: 8 }, (_, index) => (
                    <span key={index} />
                  ))}
                </div>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
