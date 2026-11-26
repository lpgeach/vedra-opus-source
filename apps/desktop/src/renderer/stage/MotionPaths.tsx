import { pathPolyline } from '@vedraopus/engine';
import type { MotionPath, SceneObject, Slide } from '@vedraopus/model';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { addMotionPath, strokeToPath } from '../animations-edit';
import { editor, useEditor } from '../project-store';
import type { OpenProject } from '../project-store';

type Point = MotionPath['points'][number];

/**
 * The selected object's motion paths on the stage (docs/briefs/P6.5-animations.md):
 * each drawn from the object's middle, the chosen one with a handle on each of
 * its points to drag, and where the object ends up. While the author is
 * drawing a freeform path, the whole stage takes the drawing instead.
 */
export function MotionPaths({
  open,
  slide,
  object,
  zoom,
  canvas,
}: {
  open: OpenProject;
  slide: Slide;
  object: SceneObject;
  zoom: number;
  canvas: RefObject<HTMLDivElement | null>;
}) {
  const { motionPath, drawingPathFor } = useEditor();
  const { frame } = object;
  const centre = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  const paths = object.animations.motionPaths;
  const chosen = paths.find((path) => path.id === motionPath) ?? paths[0];
  const toStage = (event: { clientX: number; clientY: number }): Point => {
    const box = canvas.current!.getBoundingClientRect();
    return { x: (event.clientX - box.left) / zoom, y: (event.clientY - box.top) / zoom };
  };
  const at = (point: Point) => ({ x: (centre.x + point.x) * zoom, y: (centre.y + point.y) * zoom });

  // ------------------------------------------------------------ dragging points
  const drag = useRef<{ pointer: number; index: number; from: Point; points: Point[] } | null>(
    null,
  );
  const endDrag = () => {
    if (drag.current) editor.commitGesture();
    drag.current = null;
  };
  useEffect(() => () => endDrag(), []);
  const press = (event: ReactPointerEvent<SVGElement>, path: MotionPath, index: number) => {
    event.stopPropagation();
    event.preventDefault();
    endDrag();
    editor.chooseMotionPath(path.id);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    editor.beginGesture('Edit motion path');
    drag.current = {
      pointer: event.pointerId,
      index,
      from: toStage(event),
      points: path.points.map((point) => ({ ...point })),
    };
  };
  const move = (event: ReactPointerEvent<SVGElement>, path: MotionPath) => {
    const now = drag.current;
    if (!now || now.pointer !== event.pointerId) return;
    const here = toStage(event);
    const original = now.points[now.index]!;
    const moved = {
      x: Math.round(original.x + here.x - now.from.x),
      y: Math.round(original.y + here.y - now.from.y),
    };
    const points = now.points.map((point, i) => (i === now.index ? moved : point));
    open.history.execute('object.update', {
      objectId: object.id,
      changes: {
        animations: {
          ...object.animations,
          motionPaths: paths.map((each) => (each.id === path.id ? { ...each, points } : each)),
        },
      },
    });
  };

  // ---------------------------------------------------------- drawing freeform
  const [stroke, setStroke] = useState<Point[] | null>(null);
  const drawing = drawingPathFor === object.id;
  useEffect(() => {
    if (!drawing) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setStroke(null);
      editor.drawPathFor(null);
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  }, [drawing]);

  if (drawing) {
    return (
      <div
        className="path-drawing"
        data-testid="path-drawing"
        aria-label="Draw the motion path"
        onPointerDown={(event) => {
          event.stopPropagation();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          setStroke([toStage(event)]);
        }}
        onPointerMove={(event) => {
          if (stroke) setStroke([...stroke, toStage(event)]);
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          const points = stroke && strokeToPath([...stroke, toStage(event)]);
          setStroke(null);
          editor.drawPathFor(null);
          if (points) addMotionPath(open, slide, object, 'freeform', points);
        }}
      >
        <p className="path-drawing-hint">
          Draw the path {object.name} follows. Press Escape to stop.
        </p>
        {stroke && (
          <svg className="motion-paths" aria-hidden="true">
            <polyline
              className="motion-path chosen"
              points={stroke.map((point) => `${point.x * zoom},${point.y * zoom}`).join(' ')}
            />
          </svg>
        )}
      </div>
    );
  }

  if (paths.length === 0) return null;
  return (
    <svg className="motion-paths" data-testid="motion-paths" aria-label="Motion paths">
      {paths.map((path) => {
        const line = pathPolyline(path).map(at);
        const isChosen = path === chosen;
        return (
          <g key={path.id} data-path-id={path.id} data-chosen={isChosen ? 'true' : undefined}>
            <polyline
              className={`motion-path${isChosen ? ' chosen' : ''}`}
              data-testid="motion-path"
              points={line.map((point) => `${point.x},${point.y}`).join(' ')}
            />
            {/* A wide invisible line, so a thin path is easy to pick. */}
            <polyline
              className="motion-path-hit"
              points={line.map((point) => `${point.x},${point.y}`).join(' ')}
              onPointerDown={(event) => {
                event.stopPropagation();
                editor.chooseMotionPath(path.id);
              }}
            />
          </g>
        );
      })}
      {chosen && (
        <g>
          {/* Where the object ends up. */}
          <rect
            className="motion-path-ghost"
            data-testid="motion-path-end"
            x={(frame.x + chosen.points.at(-1)!.x) * zoom}
            y={(frame.y + chosen.points.at(-1)!.y) * zoom}
            width={frame.width * zoom}
            height={frame.height * zoom}
          />
          {chosen.points.map((point, index) => {
            const { x, y } = at(point);
            const role =
              index === 0 ? 'start' : index === chosen.points.length - 1 ? 'end' : 'middle';
            return (
              <circle
                key={index}
                className={`motion-path-handle ${role}`}
                data-testid="path-handle"
                data-role={role}
                aria-label={`${chosen.name} point ${index + 1}`}
                cx={x}
                cy={y}
                r={role === 'middle' && chosen.shape === 'freeform' ? 3.5 : 5.5}
                onPointerDown={(event) => press(event, chosen, index)}
                onPointerMove={(event) => move(event, chosen)}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onLostPointerCapture={endDrag}
              />
            );
          })}
        </g>
      )}
    </svg>
  );
}
