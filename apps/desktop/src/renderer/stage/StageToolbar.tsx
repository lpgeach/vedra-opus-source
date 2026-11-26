import { findSlide } from '@vedraopus/model';
import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CurrentSlide, OpenProject } from '../project-store';
import { editor, useEditor } from '../project-store';
import { Icon } from '../components/icons';
import { popupPlace, useDismiss } from '../components/popover';

/** The zoom levels the menu offers, as fractions. */
export const ZOOM_LEVELS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8] as const;

interface StageToolbarProps {
  open: OpenProject;
  current: CurrentSlide | undefined;
  /** The zoom as drawn, a fraction. */
  zoom: number;
  fitting: boolean;
  onStep: (direction: 1 | -1) => void;
  onZoom: (level: number | 'fit') => void;
}

/**
 * The bar above the stage (docs/briefs/B17-ribbon-and-panels.md, part 3): which slide and layer
 * are being edited, the slide's size, and the zoom. It replaces the zoom bar that floated over
 * the stage, which the stage's scrollbars and objects could cover.
 */
export function StageToolbar({ open, current, zoom, fitting, onStep, onZoom }: StageToolbarProps) {
  const { width, height } = open.project.stage;
  return (
    <div className="stage-toolbar" role="toolbar" aria-label="Stage" data-testid="stage-toolbar">
      {current && (
        <span className="stage-toolbar-slide" data-testid="stage-slide" title={current.slide.title}>
          {current.isMaster ? current.slide.title : `${current.number} · ${current.slide.title}`}
        </span>
      )}
      {current && !current.isMaster && <LayerChooser open={open} slideId={current.slide.id} />}
      <span className="stage-toolbar-gap" />
      <span className="muted" data-testid="stage-size" title="Slide size">
        {width} × {height}
      </span>
      <div className="zoom-control" role="group" aria-label="Zoom" data-testid="zoom-control">
        <button className="icon-button" aria-label="Zoom out" onClick={() => onStep(-1)}>
          −
        </button>
        <ZoomMenu zoom={zoom} fitting={fitting} onZoom={onZoom} />
        <button className="icon-button" aria-label="Zoom in" onClick={() => onStep(1)}>
          +
        </button>
        <button className="zoom-fit" aria-pressed={fitting} onClick={() => onZoom('fit')}>
          Fit
        </button>
        <button
          className="zoom-fit"
          aria-pressed={!fitting && zoom === 1}
          title="Actual size"
          onClick={() => onZoom(1)}
        >
          100%
        </button>
      </div>
    </div>
  );
}

/** The layer being edited: the base layer or one of the slide's own. */
function LayerChooser({ open, slideId }: { open: OpenProject; slideId: string }) {
  const { editingLayerId } = useEditor();
  // The slide as stored: while a layer is edited, the current slide stands in for that layer.
  const slide = findSlide(open.project, slideId)?.slide;
  if (!slide) return null;
  return (
    <select
      className="stage-toolbar-select"
      aria-label="Layer being edited"
      data-testid="stage-layer"
      value={editingLayerId ?? ''}
      onChange={(event) => editor.editLayer(event.target.value || null)}
    >
      <option value="">{slide.baseLayer.name}</option>
      {slide.layers.map((layer) => (
        <option key={layer.id} value={layer.id}>
          {layer.name}
        </option>
      ))}
    </select>
  );
}

/** The zoom level, which opens a list of levels to choose from. */
function ZoomMenu({
  zoom,
  fitting,
  onZoom,
}: Pick<StageToolbarProps, 'zoom' | 'fitting' | 'onZoom'>) {
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const isOpen = place !== null;
  useDismiss(container, isOpen, () => setPlace(null));
  const choose = (level: number | 'fit') => {
    setPlace(null);
    onZoom(level);
  };
  return (
    <div className="gallery" ref={container}>
      <button
        className="zoom-level"
        aria-label={`Zoom level ${Math.round(zoom * 100)}%`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setPlace(isOpen ? null : popupPlace(container))}
      >
        <span data-testid="zoom-level">{Math.round(zoom * 100)}%</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {place && (
        <div className="menu-panel" role="menu" aria-label="Zoom levels" style={place}>
          <button
            role="menuitemradio"
            aria-checked={fitting}
            className="menu-item"
            onClick={() => choose('fit')}
          >
            Fit
          </button>
          {ZOOM_LEVELS.map((level) => (
            <button
              key={level}
              role="menuitemradio"
              aria-checked={!fitting && Math.abs(zoom - level) < 0.001}
              className="menu-item"
              onClick={() => choose(level)}
            >
              {Math.round(level * 100)}%
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
