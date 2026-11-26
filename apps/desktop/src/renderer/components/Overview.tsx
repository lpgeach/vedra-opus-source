import { createRenderContext } from '@vedraopus/render';
import { slideLinks, unreachableSlides } from '@vedraopus/model';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { editor, editorAssetUrl, slideNumbers } from '../project-store';
import type { CurrentSlide, OpenProject } from '../project-store';
import { overview } from '../overview-actions';
import { SlideThumbnail } from './SlideThumbnail';

/** What is being renamed in place: a slide or a scene. */
type Renaming = { kind: 'slide' | 'scene'; id: string } | null;

function RenameField({
  initial,
  label,
  onDone,
}: {
  initial: string;
  label: string;
  onDone: (title: string | null) => void;
}) {
  return (
    <input
      className="overview-rename"
      aria-label={label}
      defaultValue={initial}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') onDone(event.currentTarget.value);
        else if (event.key === 'Escape') onDone(null);
      }}
      onBlur={(event) => onDone(event.currentTarget.value)}
    />
  );
}

/**
 * The whole project at a glance: each scene with its slides as cards. Click a
 * card to select it; double-click, or press Enter on it, to open the slide.
 * Slides and scenes can be added, renamed, duplicated, deleted and dragged;
 * the first scene is where the course starts.
 */
export function Overview({
  open,
  current,
}: {
  open: OpenProject;
  current: CurrentSlide | undefined;
}) {
  const { stage, theme, assets, scenes } = open.project;
  const numbers = slideNumbers(open.project);
  const [renaming, setRenaming] = useState<Renaming>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [showLinks, setShowLinks] = useState(true);
  const jumps = useMemo(
    () => slideLinks(open.project).filter((link) => link.kind === 'jump'),
    [open.project],
  );
  const unreachable = useMemo(() => new Set(unreachableSlides(open.project)), [open.project]);
  const context = useMemo(
    () =>
      createRenderContext(
        { theme, stage, assets, masters: open.project.masters },
        {
          assetUrl: (hash) => editorAssetUrl(open.session, { assets, stage }, hash),
          idPrefix: 'thumb-',
        },
      ),
    [theme, stage, assets, open.project.masters, open.session],
  );

  const finishRename = (kind: 'slide' | 'scene', id: string, title: string | null) => {
    setRenaming(null);
    if (title === null) return;
    if (kind === 'slide') overview.renameSlide(id, title);
    else overview.renameScene(id, title);
  };

  const drop = (sceneId: string, index?: number) => {
    if (dragging) overview.moveSlide(dragging, sceneId, index);
    setDragging(null);
    setDropTarget(null);
  };

  return (
    <main className="overview" data-testid="overview" aria-label="Overview">
      <LinkArrows jumps={jumps} shown={showLinks} />
      <div className="overview-toolbar">
        <button
          className="ribbon-button small"
          onClick={() => overview.addSlide(current?.scene.id ?? scenes[0]!.id)}
        >
          Add slide
        </button>
        <button
          className="ribbon-button small"
          onClick={() => overview.addScene(current?.scene.id)}
        >
          Add scene
        </button>
        <label className="overview-toggle">
          <input
            type="checkbox"
            checked={showLinks}
            onChange={(event) => setShowLinks(event.target.checked)}
          />
          Show links between slides
        </label>
      </div>
      {scenes.map((scene, sceneIndex) => (
        <section
          key={scene.id}
          className="overview-scene"
          aria-label={scene.title}
          data-scene-id={scene.id}
          data-drop-target={dropTarget === `scene:${scene.id}` ? 'true' : undefined}
          onDragOver={(event) => {
            if (!dragging) return;
            event.preventDefault();
            setDropTarget(`scene:${scene.id}`);
          }}
          onDrop={(event) => {
            event.preventDefault();
            drop(scene.id);
          }}
        >
          <header className="overview-scene-header">
            <h2 className="overview-scene-title">
              <span className="muted">Scene {sceneIndex + 1}</span>
              {sceneIndex === 0 && <span className="overview-start">Start</span>}
              {renaming?.kind === 'scene' && renaming.id === scene.id ? (
                <RenameField
                  initial={scene.title}
                  label="Scene name"
                  onDone={(title) => finishRename('scene', scene.id, title)}
                />
              ) : (
                scene.title
              )}
            </h2>
            <div className="overview-actions" role="toolbar" aria-label={`${scene.title} actions`}>
              <button onClick={() => setRenaming({ kind: 'scene', id: scene.id })}>
                Rename scene
              </button>
              <button onClick={() => overview.duplicateScene(scene.id)}>Duplicate scene</button>
              <button disabled={sceneIndex === 0} onClick={() => overview.moveScene(scene.id, 0)}>
                Set as starting scene
              </button>
              <button
                disabled={sceneIndex === 0}
                onClick={() => overview.moveScene(scene.id, sceneIndex - 1)}
              >
                Move scene earlier
              </button>
              <button
                disabled={sceneIndex === scenes.length - 1}
                onClick={() => overview.moveScene(scene.id, sceneIndex + 1)}
              >
                Move scene later
              </button>
              <button disabled={scenes.length < 2} onClick={() => overview.deleteScene(scene.id)}>
                Delete scene
              </button>
            </div>
          </header>
          {scene.slides.length === 0 && <p className="placeholder">No slides in this scene.</p>}
          <ol className="overview-slides">
            {scene.slides.map((slide, slideIndex) => {
              const selected = slide.id === current?.slide.id;
              return (
                <li
                  key={slide.id}
                  data-slide-id={slide.id}
                  data-drop-before={dropTarget === `slide:${slide.id}` ? 'true' : undefined}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    setDragging(slide.id);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setDropTarget(null);
                  }}
                  onDragOver={(event) => {
                    if (!dragging) return;
                    event.preventDefault();
                    event.stopPropagation();
                    setDropTarget(`slide:${slide.id}`);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    drop(scene.id, slideIndex);
                  }}
                >
                  <div
                    className="overview-card"
                    data-card-slide={slide.id}
                    data-unreachable={unreachable.has(slide.id) ? 'true' : undefined}
                    role="button"
                    tabIndex={0}
                    aria-current={selected ? 'true' : undefined}
                    aria-label={slide.title}
                    title="Double-click to open"
                    onClick={() => editor.selectSlide(slide.id)}
                    onDoubleClick={() => editor.editSlide(slide.id)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        editor.editSlide(slide.id);
                      } else if (event.key === 'F2') {
                        setRenaming({ kind: 'slide', id: slide.id });
                      }
                    }}
                  >
                    <SlideThumbnail
                      slide={slide}
                      context={context}
                      className="overview-card-preview"
                    />
                    <span className="overview-card-caption">
                      <span className="slide-number">{numbers.get(slide.id)}</span>
                      {renaming?.kind === 'slide' && renaming.id === slide.id ? (
                        <RenameField
                          initial={slide.title}
                          label="Slide name"
                          onDone={(title) => finishRename('slide', slide.id, title)}
                        />
                      ) : (
                        <span className="slide-name">{slide.title}</span>
                      )}
                      {unreachable.has(slide.id) && (
                        <span
                          className="overview-unreachable"
                          title="No trigger, button or automatic advance leads here from the first slide"
                        >
                          Not reachable
                        </span>
                      )}
                    </span>
                  </div>
                  {selected && (
                    <div className="overview-actions" role="toolbar" aria-label="Slide actions">
                      <button onClick={() => setRenaming({ kind: 'slide', id: slide.id })}>
                        Rename
                      </button>
                      <button onClick={() => overview.duplicateSlide(slide.id)}>Duplicate</button>
                      <button onClick={() => overview.deleteSlide(slide.id)}>Delete</button>
                    </div>
                  )}
                </li>
              );
            })}
            <li className="overview-add">
              <button onClick={() => overview.addSlide(scene.id)}>
                Add slide to {scene.title}
              </button>
            </li>
          </ol>
        </section>
      ))}
    </main>
  );
}

interface Arrow {
  key: string;
  d: string;
}

/**
 * Arrows from each slide to the slides its triggers jump to, drawn over the
 * Overview. Positions are measured from the cards after layout and again
 * whenever the Overview changes size.
 */
function LinkArrows({
  jumps,
  shown,
}: {
  jumps: readonly { from: string; to: string }[];
  shown: boolean;
}) {
  // Measured from its own marker's parent (the Overview): a parent's ref is not
  // set yet when a child's layout effect runs, so the Overview's ref cannot be used.
  const marker = useRef<HTMLSpanElement>(null);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = marker.current?.parentElement;
    if (!element || !shown) return;
    const measure = () => {
      const origin = element.getBoundingClientRect();
      const box = (slideId: string) => {
        const card = element.querySelector<HTMLElement>(`[data-card-slide="${slideId}"]`);
        if (!card) return null;
        const r = card.getBoundingClientRect();
        const left = r.left - origin.left + element.scrollLeft;
        const top = r.top - origin.top + element.scrollTop;
        return {
          left,
          top,
          right: left + r.width,
          bottom: top + r.height,
          cx: left + r.width / 2,
          cy: top + r.height / 2,
        };
      };
      const next: Arrow[] = [];
      for (const { from, to } of jumps) {
        const a = box(from);
        const b = box(to);
        if (!a || !b) continue;
        // Leave from the side facing the target, arrive at the side facing the source.
        const forward = b.cx >= a.cx;
        const sameRow = Math.abs(a.cy - b.cy) < 4;
        const start = sameRow
          ? { x: forward ? a.right : a.left, y: a.top + 12 }
          : { x: a.cx, y: b.cy > a.cy ? a.bottom : a.top };
        const end = sameRow
          ? { x: forward ? b.left : b.right, y: b.top + 12 }
          : { x: b.cx, y: b.cy > a.cy ? b.top : b.bottom };
        // Same row: arc above the cards; otherwise a gentle S between rows.
        // Low enough to stay in the gap above the cards, clear of the scene's buttons.
        const bend = sameRow ? -Math.min(30, Math.max(14, Math.abs(end.x - start.x) / 8)) : 0;
        const c1 = sameRow
          ? { x: start.x + (end.x - start.x) / 3, y: start.y + bend }
          : { x: start.x, y: (start.y + end.y) / 2 };
        const c2 = sameRow
          ? { x: start.x + ((end.x - start.x) * 2) / 3, y: end.y + bend }
          : { x: end.x, y: (start.y + end.y) / 2 };
        next.push({
          key: `${from}>${to}`,
          d: `M${start.x} ${start.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`,
        });
      }
      setArrows(next);
      setSize({ width: element.scrollWidth, height: element.scrollHeight });
    };
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [jumps, shown]);
  return (
    <>
      <span ref={marker} hidden />
      {shown && arrows.length > 0 && (
        <svg
          className="overview-links"
          data-testid="overview-links"
          width={size.width}
          height={size.height}
          aria-hidden="true"
        >
          <defs>
            <marker
              id="overview-arrowhead"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" />
            </marker>
          </defs>
          {arrows.map((arrow) => (
            <path
              key={arrow.key}
              data-link={arrow.key}
              d={arrow.d}
              markerEnd="url(#overview-arrowhead)"
            />
          ))}
        </svg>
      )}
    </>
  );
}
