import { cloneLayer, createLayer, findSlide } from '@vedraopus/model';
import type { Layer } from '@vedraopus/model';
import { useState } from 'react';
import { currentSlide, editor, getEditorState, useEditor } from '../project-store';
import type { CurrentSlide, OpenProject } from '../project-store';

const PROPERTIES: {
  key: keyof Omit<Layer['properties'], 'onRevisit' | 'transition'>;
  label: string;
}[] = [
  { key: 'hideOtherLayers', label: 'Hide other layers when shown' },
  { key: 'hideBaseObjects', label: 'Hide the base layer’s objects' },
  { key: 'pauseBaseTimeline', label: 'Pause the base layer’s timeline' },
  { key: 'blockBaseClicks', label: 'Stop clicks on the base layer' },
  { key: 'allowSeek', label: 'Let the learner move through its timeline' },
];

/** A name the slide does not use yet: Layer 1, Layer 2, … */
function freeName(layers: readonly Layer[]): string {
  const used = new Set(layers.map((layer) => layer.name.toLowerCase()));
  for (let n = 1; ; n++) if (!used.has(`layer ${n}`)) return `Layer ${n}`;
}

/**
 * The current slide's layers, top first, ending with the base layer. Choosing
 * one edits it on the stage (with the layers below it drawn beneath, dimmed,
 * unless their eye is closed). The chosen overlay's properties are below.
 */
/**
 * Add a layer to the slide being edited and edit it: the Slide Layers panel's New layer, and
 * Insert → Slide Layer (B17). Undoable; nothing happens in Master View or with no slide.
 */
export function addSlideLayer(): void {
  const { open, view, selectedSlideId } = getEditorState();
  if (!open || view !== 'slide') return;
  // The slide shown: the first, until another is chosen.
  const slide = currentSlide(open.project, selectedSlideId)?.slide;
  if (!slide) return;
  const layer = createLayer(freeName(slide.layers));
  open.history.execute('layer.add', { slideId: slide.id, layer });
  editor.editLayer(layer.id);
  editor.showSlidePanel('layers');
}

export function LayersPanel({
  open,
  current,
}: {
  open: OpenProject;
  current: CurrentSlide | undefined;
}) {
  const { editingLayerId, layersHiddenInEditor } = useEditor();
  const [renaming, setRenaming] = useState<string | null>(null);
  const slide =
    current && !current.isMaster ? findSlide(open.project, current.slide.id)?.slide : undefined;
  if (!slide) return <p className="placeholder">Layers belong to slides, in Slide View.</p>;
  const { history } = open;
  const overlays = slide.layers;
  const editing = overlays.find((layer) => layer.id === editingLayerId) ?? null;

  const finishRename = (layer: Layer, value: string | null) => {
    setRenaming(null);
    const name = value?.trim();
    if (name && name !== layer.name) history.execute('layer.rename', { layerId: layer.id, name });
  };

  const row = (layer: Layer, isBase: boolean) => {
    const active = isBase ? editing === null : editing?.id === layer.id;
    const index = overlays.indexOf(layer);
    const hidden = layersHiddenInEditor.includes(layer.id);
    return (
      <li
        key={layer.id}
        className="layer-row"
        data-testid="layer-row"
        data-layer-id={layer.id}
        aria-current={active ? 'true' : undefined}
      >
        <button
          className="layer-eye"
          aria-label={`${hidden ? 'Show' : 'Hide'} ${layer.name} beneath other layers`}
          aria-pressed={!hidden}
          title="Shown beneath the layer being edited"
          onClick={() => editor.toggleLayerInEditor(layer.id)}
        >
          {hidden ? '○' : '●'}
        </button>
        {renaming === layer.id ? (
          <input
            className="overview-rename"
            aria-label="Layer name"
            defaultValue={layer.name}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') finishRename(layer, e.currentTarget.value);
              else if (e.key === 'Escape') finishRename(layer, null);
            }}
            onBlur={(e) => finishRename(layer, e.currentTarget.value)}
          />
        ) : (
          <button
            className="layer-name"
            onClick={() => editor.editLayer(isBase ? null : layer.id)}
            onDoubleClick={() => setRenaming(layer.id)}
            title="Click to edit; double-click to rename"
          >
            {layer.name}
          </button>
        )}
        {!isBase && (
          <span className="layer-tools">
            <button
              aria-label={`Move ${layer.name} up`}
              disabled={index === overlays.length - 1}
              onClick={() => history.execute('layer.move', { layerId: layer.id, index: index + 1 })}
            >
              ▲
            </button>
            <button
              aria-label={`Move ${layer.name} down`}
              disabled={index === 0}
              onClick={() => history.execute('layer.move', { layerId: layer.id, index: index - 1 })}
            >
              ▼
            </button>
            <button
              aria-label={`Duplicate ${layer.name}`}
              onClick={() => {
                const copy = cloneLayer(slide, layer.id);
                history.execute('layer.add', {
                  slideId: slide.id,
                  layer: copy.layer,
                  index: index + 1,
                  triggers: copy.triggers,
                });
                editor.editLayer(copy.layer.id);
              }}
            >
              ⧉
            </button>
            <button
              aria-label={`Delete ${layer.name}`}
              onClick={() => {
                if (active) editor.editLayer(null);
                history.execute('layer.remove', { layerId: layer.id });
              }}
            >
              ✕
            </button>
          </span>
        )}
      </li>
    );
  };

  return (
    <div className="layers-panel" data-testid="layers-panel">
      <div className="panel-actions">
        <button onClick={addSlideLayer}>New layer</button>
      </div>
      <ul className="layer-list">
        {[...overlays].reverse().map((layer) => row(layer, false))}
        {row(slide.baseLayer, true)}
      </ul>
      {editing && (
        <section className="layer-properties" aria-label={`${editing.name} properties`}>
          <h3 className="panel-subtitle">When {editing.name} is shown</h3>
          {PROPERTIES.map(({ key, label }) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={editing.properties[key]}
                onChange={(e) =>
                  history.execute('layer.setProperties', {
                    layerId: editing.id,
                    properties: { [key]: e.target.checked },
                  })
                }
              />
              {label}
            </label>
          ))}
          <label>
            When shown again
            <select
              aria-label="When shown again"
              value={editing.properties.onRevisit}
              onChange={(e) =>
                history.execute('layer.setProperties', {
                  layerId: editing.id,
                  properties: { onRevisit: e.target.value as Layer['properties']['onRevisit'] },
                })
              }
            >
              <option value="auto">Decide automatically</option>
              <option value="reset">Start again</option>
              <option value="resume">Carry on where it was</option>
            </select>
          </label>
        </section>
      )}
    </div>
  );
}
