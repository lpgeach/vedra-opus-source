import {
  allLayers,
  choiceMarks,
  createPlaceholder,
  forEachObject,
  WEB_URL,
  createSlideLayout,
  createSlideMaster,
  findSlide,
  markerIcons,
} from '@vedraopus/model';
import { createRenderContext } from '@vedraopus/render';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type {
  Appearance,
  ButtonObject,
  Color,
  MarkerObject,
  SceneObject,
  Shadow,
  ShapeObject,
  Slide,
  Stroke,
  VideoObject,
} from '@vedraopus/model';
import { BOTTOM_TABS, LEFT_TABS } from '../../shared/settings';
import { CaptionsPanel } from './CaptionsPanel';
import { NotesPanel } from './NotesPanel';
import type { PanelName } from '../../shared/settings';
import {
  editorAssetUrl,
  editor,
  findMasterTarget,
  selectedObjects,
  slideNumbers,
  useEditor,
} from '../project-store';
import type { CurrentSlide, OpenProject } from '../project-store';
import { stage } from '../stage/actions';
import { ui, useSettings } from '../ui-store';
import { videoPosters } from '../media-posters';
import { Icon } from './icons';
import type { IconName } from './icons';
import { SlideThumbnail } from './SlideThumbnail';
import { StatesPanel } from './StatesPanel';
import { NumericInput } from './NumericInput';
import { CommitField } from './PlayerTabs';
import { LayersPanel } from './LayersPanel';
import { Tabs } from './Tabs';
import { Splitter } from './Splitter';
import { clampRightSplit, RIGHT_PART_MIN } from '../layout';
import { TriggersPanel } from '../triggers/TriggersPanel';
import { Timeline } from './Timeline';
import { PanoramaFormat } from './PanoramaFormat';
import { TabOrder } from './TabOrder';
import { TableFormat } from './TableFormat';
import { AccessibilityCheck } from './AccessibilityCheck';
import { t } from '../../shared/strings';

const TAB_LABELS = {
  slides: 'Slides',
  media: 'Media',
  timeline: 'Timeline',
  states: 'States',
  notes: 'Notes',
  captions: 'Captions',
} as const;
const leftTabs = LEFT_TABS.map((id) => ({ id, label: TAB_LABELS[id] }));
const bottomTabs = BOTTOM_TABS.map((id) => ({ id, label: TAB_LABELS[id] }));

/** Chevrons point the way the panel will move. */
const CHEVRONS: Record<PanelName, { collapse: IconName; expand: IconName }> = {
  left: { collapse: 'chevronLeft', expand: 'chevronRight' },
  right: { collapse: 'chevronRight', expand: 'chevronLeft' },
  bottom: { collapse: 'chevronDown', expand: 'chevronUp' },
};

interface PanelProps {
  name: PanelName;
  /** What the panel is called in tooltips and to screen readers. */
  label: string;
  /** Drawn size along the panel's resize axis. */
  size: number;
  children: ReactNode;
}

/**
 * A panel docked to one edge of the workspace. Collapsed, it leaves a thin
 * rail with a button to bring it back.
 */
function Panel({ name, label, size, children }: PanelProps) {
  const { collapsed } = useSettings().layout[name];
  const style: CSSProperties = name === 'bottom' ? { height: size } : { width: size };

  if (collapsed) {
    return (
      <aside className={`rail rail-${name}`} data-testid={`panel-${name}`} aria-label={label}>
        <button
          className="icon-button"
          data-testid={`expand-${name}`}
          aria-label={`Show ${label}`}
          title={`Show ${label}`}
          onClick={() => ui.setCollapsed(name, false)}
        >
          <Icon name={CHEVRONS[name].expand} />
        </button>
        <span className="rail-label">{label}</span>
      </aside>
    );
  }
  return (
    <aside
      className={`panel panel-${name}`}
      data-testid={`panel-${name}`}
      aria-label={label}
      style={style}
    >
      {children}
    </aside>
  );
}

function CollapseButton({ name, label }: { name: PanelName; label: string }) {
  return (
    <button
      className="icon-button"
      data-testid={`collapse-${name}`}
      aria-label={`Hide ${label}`}
      title={`Hide ${label}`}
      onClick={() => ui.setCollapsed(name, true)}
    >
      <Icon name={CHEVRONS[name].collapse} />
    </button>
  );
}

/** Text standing in for a panel whose contents a later version brings. */
function Placeholder({ children }: { children: ReactNode }) {
  return <p className="placeholder">{children}</p>;
}

interface WithProject {
  open: OpenProject;
  current: CurrentSlide | undefined;
  size: number;
}

export function LeftPanel({ open, current, size }: WithProject) {
  const { leftTab } = useSettings().layout;
  const label = 'Slides and media panel';
  return (
    <Panel name="left" label={label} size={size}>
      <header className="panel-header">
        <Tabs label="Left panel" tabs={leftTabs} active={leftTab} onSelect={ui.showLeftTab} />
        <CollapseButton name="left" label={label} />
      </header>
      <div className="panel-body" role="tabpanel" aria-label={TAB_LABELS[leftTab]}>
        {leftTab === 'slides' ? (
          <SlideList open={open} current={current} />
        ) : (
          <MediaList open={open} />
        )}
      </div>
    </Panel>
  );
}

/** Master View's left panel: the masters and their layouts, and what can be done to them. */
export function MasterPanel({ open, size }: { open: OpenProject; size: number }) {
  const { masterTargetId } = useEditor();
  const { project, history } = open;
  const [renaming, setRenaming] = useState<string | null>(null);
  const target = masterTargetId ? findMasterTarget(project, masterTargetId) : undefined;
  const isLayout =
    !!masterTargetId && project.masters.some((m) => m.layouts.some((l) => l.id === masterTargetId));
  const owner = project.masters.find(
    (m) => m.id === masterTargetId || m.layouts.some((l) => l.id === masterTargetId),
  );
  const label = 'Masters panel';
  // Slide masters, then the one feedback master (P7.5), which keeps its four layouts.
  const slideMasters = project.masters.filter((m) => m.kind === 'slide');
  const listed = [...slideMasters, ...project.masters.filter((m) => m.kind === 'feedback')];
  const fixed = owner?.kind === 'feedback';

  const finish = (id: string, value: string | null) => {
    setRenaming(null);
    const name = value?.trim();
    if (!name) return;
    if (project.masters.some((m) => m.id === id)) {
      if (project.masters.find((m) => m.id === id)!.name !== name) {
        history.execute('master.rename', { masterId: id, name });
      }
    } else {
      history.execute('layout.rename', { layoutId: id, name });
    }
  };
  const rename = (id: string, name: string) =>
    renaming === id ? (
      <input
        className="overview-rename"
        aria-label="Name"
        defaultValue={name}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') finish(id, e.currentTarget.value);
          else if (e.key === 'Escape') finish(id, null);
        }}
        onBlur={(e) => finish(id, e.currentTarget.value)}
      />
    ) : (
      <span className="slide-name">{name}</span>
    );

  const addPlaceholder = (kind: 'title' | 'content') => {
    if (!masterTargetId || !isLayout) return;
    const layer = owner?.layouts.find((l) => l.id === masterTargetId)?.layer;
    if (!layer) return;
    const object = createPlaceholder(
      kind,
      kind === 'title'
        ? { x: 80, y: 48, width: 1120, height: 96 }
        : { x: 80, y: 176, width: 1120, height: 472 },
    );
    history.execute('object.add', { layerId: layer.id, object });
    editor.select([object.id]);
  };

  return (
    <Panel name="left" label={label} size={size}>
      <header className="panel-header">
        <h2 className="panel-title">Masters</h2>
        <CollapseButton name="left" label={label} />
      </header>
      <div className="panel-body master-list" data-testid="master-list">
        {slideMasters.length === 0 && (
          <Placeholder>
            No masters yet. Add one to give slides shared backgrounds and layouts.
          </Placeholder>
        )}
        {listed.map((master) => (
          <section key={master.id} aria-label={master.name}>
            <button
              className="master-item"
              aria-current={master.id === masterTargetId ? 'true' : undefined}
              onClick={() => editor.openMaster(master.id)}
              onDoubleClick={() => setRenaming(master.id)}
            >
              <strong>{rename(master.id, master.name)}</strong>
            </button>
            <ol>
              {master.layouts.map((layout) => (
                <li key={layout.id}>
                  <button
                    className="master-item"
                    aria-current={layout.id === masterTargetId ? 'true' : undefined}
                    onClick={() => editor.openMaster(layout.id)}
                    onDoubleClick={() => setRenaming(layout.id)}
                  >
                    {rename(layout.id, layout.name)}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ))}
        <div className="master-actions" role="toolbar" aria-label="Master actions">
          <button
            onClick={() => {
              const master = createSlideMaster(`Master ${slideMasters.length + 1}`);
              history.execute('master.add', { master });
              editor.openMaster(master.id);
            }}
          >
            Add master
          </button>
          <button
            disabled={!owner || fixed}
            onClick={() => {
              if (!owner || fixed) return;
              const layout = createSlideLayout(`Layout ${owner.layouts.length + 1}`);
              history.execute('layout.add', { masterId: owner.id, layout });
              editor.openMaster(layout.id);
            }}
          >
            Add layout
          </button>
          <button disabled={!target} onClick={() => masterTargetId && setRenaming(masterTargetId)}>
            Rename
          </button>
          <button
            disabled={!target || fixed}
            onClick={() => {
              if (!masterTargetId || fixed) return;
              if (isLayout) history.execute('layout.remove', { layoutId: masterTargetId });
              else history.execute('master.remove', { masterId: masterTargetId });
              editor.openMaster();
            }}
          >
            Delete
          </button>
        </div>
        {isLayout && (
          <div className="master-actions" role="toolbar" aria-label="Placeholders">
            <button onClick={() => addPlaceholder('title')}>Add title placeholder</button>
            <button onClick={() => addPlaceholder('content')}>Add content placeholder</button>
          </div>
        )}
      </div>
    </Panel>
  );
}

function SlideList({ open, current }: Pick<WithProject, 'open' | 'current'>) {
  const numbers = slideNumbers(open.project);
  const { theme, stage, assets } = open.project;
  const context = useMemo(
    () =>
      createRenderContext(
        { theme, stage, assets, masters: open.project.masters },
        {
          assetUrl: (hash) => editorAssetUrl(open.session, { assets, stage }, hash),
          idPrefix: 'list-',
        },
      ),
    [theme, stage, assets, open.project.masters, open.session],
  );
  const row = (slide: Slide) => {
    const selected = slide.id === current?.slide.id;
    return (
      <li key={slide.id}>
        <button
          className="slide-item"
          aria-current={selected ? 'true' : undefined}
          data-transition={slide.properties.transition?.kind}
          onClick={() => editor.selectSlide(slide.id)}
        >
          <span className="slide-number">{numbers.get(slide.id)}</span>
          {slide.question && (
            <span
              className="slide-question-mark"
              data-testid="slide-question-mark"
              title="A question"
              aria-hidden="true"
            >
              ?
            </span>
          )}
          {slide.draw && (
            <span
              className="slide-question-mark"
              data-testid="slide-draw-mark"
              title="Questions drawn from a bank"
              aria-hidden="true"
            >
              ⇉
            </span>
          )}
          {slide.properties.transition && (
            <span
              className="slide-transition-mark"
              data-testid="slide-transition-mark"
              title={`Transition: ${slide.properties.transition.kind}`}
              aria-hidden="true"
            >
              ⇢
            </span>
          )}
          <SlideThumbnail slide={slide} context={context} className="slide-thumb" />
          <span className="slide-name">{slide.title}</span>
        </button>
      </li>
    );
  };
  return (
    <nav className="slide-list" data-testid="slide-list" aria-label="Scenes and slides">
      {open.project.scenes.map((scene) => (
        <section key={scene.id}>
          <h3 className="scene-title">{scene.title}</h3>
          {scene.slides.length === 0 && <Placeholder>No slides in this scene.</Placeholder>}
          <ol>{scene.slides.map(row)}</ol>
        </section>
      ))}
      {/* Question banks (P7.6): question slides drawn from by draw slides, never played here. */}
      <section aria-label="Question banks" data-testid="bank-list">
        <h3 className="scene-title">Question Banks</h3>
        {open.project.banks.map((bank) => (
          <section key={bank.id} aria-label={bank.title || 'Untitled bank'} data-testid="bank">
            <div className="bank-header">
              <input
                className="bank-name"
                aria-label={`Name of ${bank.title || 'untitled bank'}`}
                defaultValue={bank.title}
                key={bank.title}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                onBlur={(event) => {
                  const title = event.currentTarget.value.trim();
                  if (title && title !== bank.title) {
                    open.history.execute('bank.rename', { bankId: bank.id, title });
                  }
                }}
              />
              <button
                type="button"
                aria-label={`Delete ${bank.title || 'untitled bank'}`}
                onClick={() => open.history.execute('bank.remove', { bankId: bank.id })}
              >
                Delete
              </button>
            </div>
            <ol>{bank.slides.map(row)}</ol>
          </section>
        ))}
        <button type="button" onClick={() => editor.addBank()}>
          New Question Bank
        </button>
      </section>
    </nav>
  );
}

function MediaList({ open }: Pick<WithProject, 'open'>) {
  // A web object's folder files (P9.6) would bury the author's media: they are not listed.
  const folderFiles = new Set<string>();
  for (const { layer } of allLayers(open.project)) {
    forEachObject(layer.objects, (object) => {
      if (object.type === 'web' && object.props.source.kind === 'folder') {
        for (const hash of Object.values(object.props.source.files)) folderFiles.add(hash);
      }
    });
  }
  // A video's poster is shown as the video's picture, not as a picture of its own.
  const posters = videoPosters(open.project.assets);
  const posterHashes = new Set(posters.values());
  const assets = Object.entries(open.project.assets).filter(
    ([hash]) => !folderFiles.has(hash) && !posterHashes.has(hash),
  );
  return (
    <>
      {assets.length === 0 && (
        <Placeholder>Nothing imported yet. Use Insert → Import Media.</Placeholder>
      )}
      <ul className="media-list" data-testid="assets">
        {assets.map(([hash, meta]) => (
          <li key={hash}>
            {meta.kind === 'image' || posters.has(hash) ? (
              <img
                className="media-thumb"
                src={editorAssetUrl(open.session, open.project, posters.get(hash) ?? hash)}
                alt=""
              />
            ) : (
              <span className="media-thumb" aria-hidden="true" />
            )}
            <span className="media-name">
              <span title={meta.fileName}>{meta.fileName}</span>
              <span className="muted">
                {meta.width && meta.height ? `${meta.width}×${meta.height} · ` : ''}
                {formatBytes(meta.byteLength)}
              </span>
            </span>
            {meta.kind === 'image' && (
              <button
                className="media-insert"
                aria-label={`Insert ${meta.fileName}`}
                title="Put this picture on the slide"
                onClick={() => stage.insertImage(hash)}
              >
                Insert
              </button>
            )}
            {(meta.kind === 'audio' || meta.kind === 'video') && (
              <button
                className="media-insert"
                aria-label={`Insert ${meta.fileName}`}
                title={
                  meta.kind === 'audio'
                    ? 'Put this sound on the slide'
                    : 'Put this video on the slide'
                }
                onClick={() =>
                  void (
                    meta.kind === 'audio'
                      ? stage.insertAudio(hash)
                      : stage.insertVideo(hash, posters.get(hash))
                  ).catch((error: unknown) =>
                    editor.showError(error instanceof Error ? error.message : String(error)),
                  )
                }
              >
                Insert
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BottomPanel({ open, current, size }: WithProject) {
  const { bottomTab } = useSettings().layout;
  const label = 'Timeline, states and notes panel';
  return (
    <Panel name="bottom" label={label} size={size}>
      <header className="panel-header">
        <Tabs
          label="Bottom panel"
          tabs={bottomTabs}
          active={bottomTab}
          onSelect={ui.showBottomTab}
        />
        <CollapseButton name="bottom" label={label} />
      </header>
      <div className="panel-body" role="tabpanel" aria-label={TAB_LABELS[bottomTab]}>
        {bottomTab === 'timeline' &&
          (current ? (
            <Timeline open={open} current={current} />
          ) : (
            <Placeholder>Add a slide to see its timeline.</Placeholder>
          ))}
        {bottomTab === 'states' &&
          (current ? (
            <StatesPanel open={open} current={current} />
          ) : (
            <Placeholder>Add a slide to work with states.</Placeholder>
          ))}
        {bottomTab === 'notes' &&
          (current ? (
            <NotesPanel key={current.slide.id} open={open} current={current} />
          ) : (
            <Placeholder>Add a slide to write its notes.</Placeholder>
          ))}
        {bottomTab === 'captions' && <CaptionsPanel open={open} current={current} />}
      </div>
    </Panel>
  );
}

function readColorValue(color: unknown): { kind: 'theme' | 'literal'; value: string } {
  if (typeof color === 'string') return { kind: 'literal', value: color };
  if (color && typeof color === 'object' && 'theme' in (color as object)) {
    return { kind: 'theme', value: String((color as { theme: string }).theme) };
  }
  return { kind: 'literal', value: '#000000' };
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | 'mixed';
  onChange: (v: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <NumericInput
        value={value === 'mixed' ? '' : String(Number.isFinite(value) ? value : 0)}
        placeholder={value === 'mixed' ? 'Mixed' : undefined}
        undoLabel={`Change ${label}`}
        onValue={(n) => {
          if (n !== null) onChange(n);
        }}
      />
    </label>
  );
}

function ColorField({
  label,
  color,
  themeSlots,
  onChange,
}: {
  label: string;
  color: unknown;
  themeSlots: readonly string[];
  onChange: (color: unknown) => void;
}) {
  const current = readColorValue(color);
  return (
    <div className="field color-field">
      <span>{label}</span>
      <select
        aria-label={`${label} source`}
        value={current.kind === 'theme' ? `theme:${current.value}` : 'literal'}
        onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith('theme:')) onChange({ theme: v.slice('theme:'.length) });
          else onChange(current.kind === 'literal' ? current.value : '#000000');
        }}
      >
        <option value="literal">Custom</option>
        {themeSlots.map((slot) => (
          <option key={slot} value={`theme:${slot}`}>{`Theme: ${slot}`}</option>
        ))}
      </select>
      {current.kind === 'literal' ? (
        <input
          aria-label={`${label} colour`}
          type="color"
          value={String(current.value).slice(0, 7)}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <span className="muted">{current.value}</span>
      )}
    </div>
  );
}

/** How the current slide behaves in the course: moving on, revisiting, and the player buttons it shows. */
function SlideProperties({ open, slideId }: { open: OpenProject; slideId: string }) {
  const slide = findSlide(open.project, slideId)?.slide;
  if (!slide) return null;
  const { properties } = slide;
  const set = (
    changes: Parameters<typeof open.history.execute<'slide.setProperties'>>[1]['properties'],
  ) => open.history.execute('slide.setProperties', { slideId, properties: changes });
  return (
    <section className="format-panel slide-properties" data-testid="slide-properties">
      <h3 className="panel-subtitle">Slide</h3>
      <label className="field">
        <span>Moves on</span>
        <select
          aria-label="Moves on"
          value={properties.advance}
          onChange={(e) => set({ advance: e.target.value as 'auto' | 'user' })}
        >
          <option value="user">When the learner chooses</option>
          <option value="auto">By itself when its timeline ends</option>
        </select>
      </label>
      <label className="field">
        <span>When revisited</span>
        <select
          aria-label="When revisited"
          value={properties.onRevisit}
          onChange={(e) => set({ onRevisit: e.target.value as 'auto' | 'resume' | 'reset' })}
        >
          <option value="auto">Decide automatically</option>
          <option value="reset">Start again</option>
          <option value="resume">Carry on where the learner left it</option>
        </select>
      </label>
      <fieldset>
        <legend>Player buttons on this slide</legend>
        <label>
          <input
            type="checkbox"
            checked={properties.controls.previous}
            onChange={(e) => set({ controls: { previous: e.target.checked } })}
          />
          Previous
        </label>
        <label>
          <input
            type="checkbox"
            checked={properties.controls.next}
            onChange={(e) => set({ controls: { next: e.target.checked } })}
          />
          Next
        </label>
      </fieldset>
      <TabOrder slide={slide} set={(focusOrder) => set({ focusOrder })} />
    </section>
  );
}

function FormatPanel({ open, current }: { open: OpenProject; current: CurrentSlide | undefined }) {
  const { selection } = useEditor();
  const selected = selectedObjects(current?.slide, selection);
  if (selected.length === 0) {
    return <Placeholder>Select an object to format its appearance and position.</Placeholder>;
  }
  const { history, project } = open;
  const themeSlots = Object.keys(project.theme.colors);
  const first = selected[0]!;
  const sameType = selected.every((o) => o.type === first.type);

  const updateSelected = (changes: (object: SceneObject) => Record<string, unknown>) => {
    editor.beginGesture('Format');
    try {
      for (const obj of selected) {
        history.execute('object.update', { objectId: obj.id, changes: changes(obj) as never });
      }
    } finally {
      editor.commitGesture();
    }
  };
  const shared = (read: (o: SceneObject) => number): number | 'mixed' => {
    const values = selected.map(read);
    return values.every((v) => v === values[0]) ? values[0]! : 'mixed';
  };
  const updateFrame = (
    patch: Partial<{ x: number; y: number; width: number; height: number; rotation: number }>,
  ) => {
    updateSelected(() => ({ frame: patch }));
  };

  const hasAppearance = selected.every((o) => o.type === 'shape' || o.type === 'button');
  const appearanceOf = (o: SceneObject): Appearance =>
    (o as ShapeObject | ButtonObject).props.appearance;
  const appearance = hasAppearance ? appearanceOf(first) : null;

  const setAppearance = (patch: Partial<Appearance>) => {
    updateSelected((o) => ({ props: { appearance: { ...appearanceOf(o), ...patch } } }));
  };
  const mediaAssets = Object.entries(open.project.assets).filter(
    ([, meta]) => meta.kind === 'image' || meta.kind === 'video',
  );
  const soundAssets = Object.entries(open.project.assets).filter(
    ([, meta]) => meta.kind === 'audio',
  );

  return (
    <div className="format-panel" data-testid="format-panel">
      <p className="muted">
        {selected.length === 1
          ? `${first.type} selected`
          : `${selected.length} objects selected${sameType ? '' : ' (mixed types)'}`}
      </p>
      <section>
        <h3 className="panel-subtitle">Position and size</h3>
        <div className="field-grid">
          <NumberField
            label="X"
            value={shared((o) => o.frame.x)}
            onChange={(v) => updateFrame({ x: v })}
          />
          <NumberField
            label="Y"
            value={shared((o) => o.frame.y)}
            onChange={(v) => updateFrame({ y: v })}
          />
          <NumberField
            label="W"
            value={shared((o) => o.frame.width)}
            onChange={(v) => updateFrame({ width: Math.max(1, Math.round(v)) })}
          />
          <NumberField
            label="H"
            value={shared((o) => o.frame.height)}
            onChange={(v) => updateFrame({ height: Math.max(1, Math.round(v)) })}
          />
          <NumberField
            label="Rotation"
            value={shared((o) => o.frame.rotation)}
            onChange={(v) => updateFrame({ rotation: v })}
          />
        </div>
      </section>
      {selected.length === 1 && (
        // What a screen reader says (P10.2): the alt text, or nothing for decoration.
        <section data-testid="format-a11y">
          <h3 className="panel-subtitle">Accessibility</h3>
          <label className="field">
            <span>Alt text</span>
            <CommitField
              label="Alt text"
              value={first.a11y.altText}
              maxLength={1000}
              multiline
              onCommit={(altText) => updateSelected(() => ({ a11y: { altText } }))}
            />
          </label>
          <label className="field-check">
            <input
              type="checkbox"
              checked={!first.a11y.visibleToAssistiveTech}
              onChange={(e) =>
                updateSelected(() => ({ a11y: { visibleToAssistiveTech: !e.target.checked } }))
              }
            />{' '}
            Decorative: screen readers skip it
          </label>
        </section>
      )}
      {appearance && (
        <section>
          <h3 className="panel-subtitle">Appearance</h3>
          <label className="field">
            <span>Opacity</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={appearance.opacity}
              onChange={(e) => setAppearance({ opacity: Number(e.target.value) })}
              aria-label="Opacity"
            />
          </label>
          {appearance.fill.kind === 'solid' && (
            <ColorField
              label="Fill"
              color={appearance.fill.color}
              themeSlots={themeSlots}
              onChange={(c) => setAppearance({ fill: { kind: 'solid', color: c as Color } })}
            />
          )}
          {appearance.stroke ? (
            <ColorField
              label="Stroke"
              color={appearance.stroke.color}
              themeSlots={themeSlots}
              onChange={(c) =>
                setAppearance({ stroke: { ...(appearance.stroke as Stroke), color: c as Color } })
              }
            />
          ) : (
            <button
              type="button"
              className="ribbon-button small"
              onClick={() =>
                setAppearance({ stroke: { color: { theme: 'text' }, width: 1, dash: 'solid' } })
              }
            >
              Add stroke
            </button>
          )}
          {appearance.shadow ? (
            <>
              <ColorField
                label="Shadow"
                color={appearance.shadow.color}
                themeSlots={themeSlots}
                onChange={(c) =>
                  setAppearance({ shadow: { ...(appearance.shadow as Shadow), color: c as Color } })
                }
              />
              <NumberField
                label="Shadow blur"
                value={appearance.shadow.blur}
                onChange={(v) =>
                  setAppearance({
                    shadow: { ...(appearance.shadow as Shadow), blur: Math.max(0, v) },
                  })
                }
              />
              <button
                type="button"
                className="ribbon-button small"
                onClick={() => setAppearance({ shadow: null })}
              >
                Remove shadow
              </button>
            </>
          ) : (
            <button
              type="button"
              className="ribbon-button small"
              onClick={() =>
                setAppearance({
                  shadow: { color: '#000000', offsetX: 2, offsetY: 2, blur: 4 },
                })
              }
            >
              Add shadow
            </button>
          )}
        </section>
      )}
      {sameType && first.type === 'text' && (
        <section>
          <h3 className="panel-subtitle">Text box</h3>
          <label className="field">
            <span>Autofit</span>
            <select
              value={first.props.autofit}
              onChange={(e) => updateSelected(() => ({ props: { autofit: e.target.value } }))}
            >
              <option value="none">Fixed</option>
              <option value="shrinkText">Shrink text</option>
              <option value="growShape">Grow shape</option>
            </select>
          </label>
          <NumberField
            label="Padding"
            value={first.props.padding}
            onChange={(v) =>
              updateSelected(() => ({ props: { padding: Math.max(0, Math.round(v)) } }))
            }
          />
        </section>
      )}
      {sameType && first.type === 'button' && (
        <section>
          <h3 className="panel-subtitle">Button</h3>
          <NumberField
            label="Corner radius"
            value={first.props.cornerRadius}
            onChange={(v) =>
              updateSelected(() => ({ props: { cornerRadius: Math.max(0, Math.round(v)) } }))
            }
          />
        </section>
      )}
      {sameType && first.type === 'image' && (
        <section>
          <h3 className="panel-subtitle">Image</h3>
          <label className="field">
            <span>Opacity</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={first.props.opacity}
              onChange={(e) =>
                updateSelected(() => ({ props: { opacity: Number(e.target.value) } }))
              }
              aria-label="Image opacity"
            />
          </label>
        </section>
      )}
      {sameType && first.type === 'zoomRegion' && (
        <section>
          <h3 className="panel-subtitle">Zoom region</h3>
          <label className="field">
            <span>Zoom speed (seconds in and out)</span>
            <NumericInput
              aria-label="Zoom speed"
              value={String(first.props.speed)}
              min={0}
              max={3}
              undoLabel="Change zoom speed"
              onValue={(n) => n !== null && updateSelected(() => ({ props: { speed: n } }))}
            />
          </label>
          <p className="muted">
            In the course, the view zooms in to this region while it is on the timeline. It draws
            nothing itself.
          </p>
        </section>
      )}
      {sameType &&
        first.type === 'choice' &&
        !(current?.slide.question && choiceMarks(current.slide.question).includes(first.id)) && (
          <section data-testid="choice-format">
            <h3 className="panel-subtitle">
              {first.props.mark === 'radio' ? 'Radio button' : 'Checkbox'}
            </h3>
            {first.props.mark === 'radio' && (
              <label className="field">
                <span>Group</span>
                <input
                  key={`${first.id}:group`}
                  aria-label="Radio group"
                  maxLength={80}
                  defaultValue={first.buttonSet ?? ''}
                  onBlur={(e) => {
                    const buttonSet = e.target.value.trim() || null;
                    if (buttonSet !== first.buttonSet) updateSelected(() => ({ buttonSet }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
              </label>
            )}
            <label className="field-check">
              <input
                type="checkbox"
                aria-label="Starts checked"
                checked={first.initialState === 'selected'}
                onChange={(e) =>
                  updateSelected(() => ({ initialState: e.target.checked ? 'selected' : 'normal' }))
                }
              />
              Starts checked
            </label>
            <p className="muted">
              {first.props.mark === 'radio'
                ? 'Radio buttons with the same group name select one at a time. Edit the words on the stage.'
                : 'A click checks or unchecks it. Edit the words on the stage.'}
            </p>
          </section>
        )}
      {selected.length === 1 && first.type === 'panorama' && (
        <PanoramaFormat
          key={first.id}
          panorama={first}
          update={(changes) => updateSelected(() => ({ props: changes }))}
        />
      )}
      {selected.length === 1 && first.type === 'table' && (
        <TableFormat
          key={first.id}
          table={first}
          themeSlots={themeSlots}
          ColorField={ColorField}
          update={(changes) => updateSelected(() => ({ props: changes }))}
        />
      )}
      {sameType && first.type === 'graphic' && (
        <section data-testid="graphic-format">
          <h3 className="panel-subtitle">
            {first.props.library === 'lucide' ? 'Icon' : 'Illustration'}
          </h3>
          <ColorField
            label="Graphic ink"
            color={first.props.ink}
            themeSlots={themeSlots}
            onChange={(c) => updateSelected(() => ({ props: { ink: c as Color } }))}
          />
          {first.props.library !== 'lucide' && (
            <ColorField
              label="Graphic accent"
              color={first.props.accent}
              themeSlots={themeSlots}
              onChange={(c) => updateSelected(() => ({ props: { accent: c as Color } }))}
            />
          )}
          {first.props.strokeWidth !== null && (
            <label className="field">
              <span>Line width</span>
              <NumericInput
                aria-label="Graphic line width"
                value={String(first.props.strokeWidth)}
                min={0.25}
                max={6}
                step={0.25}
                undoLabel="Change the line width"
                onValue={(n) => {
                  if (n !== null && n >= 0.25 && n <= 6)
                    updateSelected((o) =>
                      o.type === 'graphic' && o.props.strokeWidth !== null
                        ? { props: { strokeWidth: n } }
                        : {},
                    );
                }}
              />
            </label>
          )}
          <p className="muted">
            {first.props.library === 'lucide'
              ? 'From Lucide (ISC licence).'
              : 'From Open Doodles by Pablo Stanley (CC0).'}
          </p>
        </section>
      )}
      {sameType && first.type === 'web' && (
        <section data-testid="web-format">
          <h3 className="panel-subtitle">Web object</h3>
          <CommitField
            label="Web object title"
            value={first.props.title}
            maxLength={200}
            required
            onCommit={(title) => updateSelected(() => ({ props: { title } }))}
          />
          <label className="field">
            <span>Shown</span>
            <select
              aria-label="Web object shown"
              value={first.props.display}
              onChange={(e) =>
                updateSelected(() => ({
                  props: { display: e.target.value as 'inline' | 'window' },
                }))
              }
            >
              <option value="inline">In the slide</option>
              <option value="window">In a new window, from a button</option>
            </select>
          </label>
          {first.props.source.kind === 'url' ? (
            <CommitField
              label="Web address"
              value={first.props.source.url}
              maxLength={2000}
              required
              onCommit={(url) => {
                if (WEB_URL.test(url)) {
                  updateSelected(() => ({ props: { source: { kind: 'url', url } } }));
                } else {
                  editor.showError('A web address starts with https:// or http://.');
                }
              }}
            />
          ) : (
            <label className="field">
              <span>Starts at</span>
              <select
                aria-label="Web object start page"
                value={first.props.source.entry}
                onChange={(e) => {
                  const { source } = first.props;
                  if (source.kind === 'folder') {
                    updateSelected(() => ({
                      props: { source: { ...source, entry: e.target.value } },
                    }));
                  }
                }}
              >
                {Object.keys(first.props.source.files)
                  .filter((path) => /\.html?$/i.test(path))
                  .sort()
                  .map((path) => (
                    <option key={path} value={path}>
                      {path}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <p className="muted">
            {first.props.source.kind === 'url'
              ? 'The page loads in the published course, in a sandbox. The editor and Preview do not load it.'
              : `${Object.keys(first.props.source.files).length} files from a folder, run in a sandbox in Preview and the course.`}
          </p>
        </section>
      )}
      {current &&
        selected.every(
          (o) =>
            o.type !== 'zoomRegion' &&
            [current.slide.baseLayer, ...current.slide.layers].some((layer) =>
              layer.objects.includes(o),
            ),
        ) && (
          <section data-testid="drag-format">
            <h3 className="panel-subtitle">Dragging</h3>
            <label className="field-check">
              <input
                type="checkbox"
                aria-label="Learners can drag it"
                checked={first.drag !== null}
                onChange={(e) =>
                  updateSelected(() => ({
                    drag: e.target.checked ? { returnToStart: false } : null,
                  }))
                }
              />
              Learners can drag it
            </label>
            {first.drag && (
              <label className="field-check">
                <input
                  type="checkbox"
                  aria-label="Goes back after it is dropped"
                  checked={first.drag.returnToStart}
                  onChange={(e) =>
                    updateSelected(() => ({ drag: { returnToStart: e.target.checked } }))
                  }
                />
                Goes back after it is dropped
              </label>
            )}
          </section>
        )}
      {sameType && first.type === 'group' && (
        <section data-testid="group-format">
          <h3 className="panel-subtitle">{first.scroll ? 'Scrolling panel' : 'Group'}</h3>
          <label className="field-check">
            <input
              type="checkbox"
              aria-label="Group scrolls"
              checked={first.scroll !== null}
              onChange={(e) =>
                updateSelected(() => ({
                  scroll: e.target.checked
                    ? { height: Math.max(40, Math.round(first.frame.height / 2)) }
                    : null,
                }))
              }
            />
            Scrolls: shows a window of its top part, and scrolls the rest into view
          </label>
          {first.scroll && (
            <label className="field">
              <span>Window height</span>
              <NumericInput
                aria-label="Scroll window height"
                value={String(first.scroll.height)}
                min={1}
                undoLabel="Change the scroll window"
                onValue={(n) => {
                  if (n !== null && n > 0)
                    updateSelected(() => ({ scroll: { height: Math.round(n) } }));
                }}
              />
            </label>
          )}
        </section>
      )}
      {sameType && (first.type === 'slider' || first.type === 'dial') && (
        <section data-testid="control-format">
          <h3 className="panel-subtitle">{first.type === 'slider' ? 'Slider' : 'Dial'}</h3>
          <label className="field">
            <span>Variable</span>
            <select
              aria-label="Control variable"
              value={first.props.variable ?? ''}
              onChange={(e) =>
                updateSelected(() => ({ props: { variable: e.target.value || null } }))
              }
            >
              <option value="">None</option>
              {open.project.variables
                .filter((each) => each.type === 'number')
                .map((each) => (
                  <option key={each.id} value={each.id}>
                    {each.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="field-grid">
            {(
              [
                ['min', 'Least', 'Control least value'],
                ['max', 'Greatest', 'Control greatest value'],
                ['step', 'Step', 'Control step'],
                ['initial', 'Starts at', 'Control starting value'],
              ] as const
            ).map(([key, label, aria]) => (
              <label key={key} className="field">
                <span>{label}</span>
                <NumericInput
                  aria-label={aria}
                  value={String(first.props[key])}
                  undoLabel="Change the control’s range"
                  onValue={(n) => {
                    if (n === null) return;
                    const next = { ...first.props, [key]: n };
                    // Keep it a valid control: least below greatest, the step in range, the start inside.
                    if (next.min >= next.max || next.step <= 0 || next.step > next.max - next.min) {
                      return;
                    }
                    const initial = Math.min(next.max, Math.max(next.min, next.initial));
                    updateSelected(() => ({ props: { [key]: n, initial } }));
                  }}
                />
              </label>
            ))}
          </div>
          {first.type === 'slider' && (
            <label className="field">
              <span>Direction</span>
              <select
                aria-label="Slider direction"
                value={first.props.orientation}
                onChange={(e) =>
                  updateSelected(() => ({
                    props: { orientation: e.target.value as 'horizontal' | 'vertical' },
                  }))
                }
              >
                <option value="horizontal">Across</option>
                <option value="vertical">Upright</option>
              </select>
            </label>
          )}
          <ColorField
            label="Control colour"
            color={first.props.color}
            themeSlots={themeSlots}
            onChange={(color) => updateSelected(() => ({ props: { color } }))}
          />
          <ColorField
            label="Control track colour"
            color={first.props.trackColor}
            themeSlots={themeSlots}
            onChange={(trackColor) => updateSelected(() => ({ props: { trackColor } }))}
          />
          <p className="muted">
            A number variable follows the control as the learner moves it, a step at a time.
          </p>
        </section>
      )}
      {sameType && first.type === 'textEntry' && (
        <section data-testid="field-format">
          <h3 className="panel-subtitle">{first.props.numeric ? 'Numeric entry' : 'Text entry'}</h3>
          <label className="field">
            <span>Placeholder</span>
            <input
              key={`${first.id}:placeholder`}
              aria-label="Field placeholder"
              maxLength={200}
              defaultValue={first.props.placeholder}
              onBlur={(e) => {
                const placeholder = e.target.value;
                if (placeholder !== first.props.placeholder) {
                  updateSelected(() => ({ props: { placeholder } }));
                }
              }}
            />
          </label>
          <label className="field">
            <span>Variable</span>
            <select
              aria-label="Field variable"
              value={first.props.variable ?? ''}
              onChange={(e) =>
                updateSelected(() => ({ props: { variable: e.target.value || null } }))
              }
            >
              <option value="">None</option>
              {open.project.variables
                .filter((each) => each.type === (first.props.numeric ? 'number' : 'text'))
                .map((each) => (
                  <option key={each.id} value={each.id}>
                    {each.name}
                  </option>
                ))}
            </select>
          </label>
          {first.props.numeric && (
            <div className="field-grid">
              {(['min', 'max'] as const).map((key) => (
                <label key={key} className="field">
                  <span>{key === 'min' ? 'Least' : 'Greatest'}</span>
                  <NumericInput
                    aria-label={key === 'min' ? 'Field least value' : 'Field greatest value'}
                    value={first.props[key] === null ? '' : String(first.props[key])}
                    undoLabel="Change the field’s limits"
                    onValue={(n) => updateSelected(() => ({ props: { [key]: n } }))}
                  />
                </label>
              ))}
            </div>
          )}
          <p className="muted">
            {first.props.numeric
              ? 'A number variable shows here, and what the learner types is written to it when they leave the field.'
              : 'A text variable shows here, and what the learner types is written to it when they leave the field.'}
          </p>
        </section>
      )}
      {sameType && first.type === 'hotspot' && (
        <section>
          <h3 className="panel-subtitle">Hotspot</h3>
          <label className="field">
            <span>Shape</span>
            <select
              aria-label="Hotspot shape"
              value={first.props.shape}
              onChange={(e) =>
                updateSelected(() => ({
                  props: { shape: e.target.value as 'rect' | 'ellipse' },
                }))
              }
            >
              <option value="rect">Rectangle</option>
              <option value="ellipse">Oval</option>
            </select>
          </label>
          <p className="muted">
            In the course this is an invisible click target for triggers. Here it has a dashed
            outline so it can be selected.
          </p>
        </section>
      )}
      {sameType && first.type === 'marker' && (
        <section>
          <h3 className="panel-subtitle">Marker</h3>
          <label className="field">
            <span>Icon</span>
            <select
              aria-label="Marker icon"
              value={first.props.icon}
              onChange={(e) =>
                updateSelected(() => ({
                  props: { icon: e.target.value as MarkerObject['props']['icon'] },
                }))
              }
            >
              {markerIcons.map((icon) => (
                <option key={icon} value={icon}>
                  {icon.charAt(0).toUpperCase() + icon.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <ColorField
            label="Marker colour"
            color={first.props.color}
            themeSlots={themeSlots}
            onChange={(color) => updateSelected(() => ({ props: { color } }))}
          />
          <CommitField
            label="Marker title"
            value={first.props.title}
            maxLength={200}
            required
            onCommit={(title) => updateSelected(() => ({ props: { title } }))}
          />
          <CommitField
            label="Marker text"
            value={first.props.body}
            maxLength={5000}
            multiline
            onCommit={(body) => updateSelected(() => ({ props: { body } }))}
          />
          <label className="field">
            <span>Picture or video</span>
            <select
              aria-label="Marker media"
              value={first.props.media ?? ''}
              onChange={(e) => updateSelected(() => ({ props: { media: e.target.value || null } }))}
            >
              <option value="">None</option>
              {mediaAssets.map(([hash, meta]) => (
                <option key={hash} value={hash}>
                  {meta.fileName}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Sound</span>
            <select
              aria-label="Marker sound"
              value={first.props.audio ?? ''}
              onChange={(e) => updateSelected(() => ({ props: { audio: e.target.value || null } }))}
            >
              <option value="">None</option>
              {soundAssets.map(([hash, meta]) => (
                <option key={hash} value={hash}>
                  {meta.fileName}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Opens on</span>
            <select
              aria-label="Marker opens on"
              value={first.props.opensOn}
              onChange={(e) =>
                updateSelected(() => ({
                  props: { opensOn: e.target.value as 'click' | 'hover' },
                }))
              }
            >
              <option value="click">Click</option>
              <option value="hover">Hover</option>
            </select>
          </label>
          <label className="field-check">
            <input
              type="checkbox"
              checked={first.props.pulse}
              onChange={(e) => updateSelected(() => ({ props: { pulse: e.target.checked } }))}
            />
            Pulse marker
          </label>
        </section>
      )}
      {sameType && first.type === 'audio' && (
        <section>
          <h3 className="panel-subtitle">Audio</h3>
          <label className="field">
            <span>Volume {Math.round(first.props.volume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={first.props.volume}
              onChange={(e) =>
                updateSelected(() => ({ props: { volume: Number(e.target.value) } }))
              }
              aria-label="Volume"
            />
          </label>
          <label className="field">
            <span>Starts</span>
            <select
              aria-label="Audio starts"
              value={first.props.startOn}
              onChange={(e) => updateSelected(() => ({ props: { startOn: e.target.value } }))}
            >
              <option value="timeline">With the timeline</option>
              <option value="trigger">When a trigger plays it</option>
            </select>
          </label>
          <p className="muted">Length {first.props.length.toFixed(2)} s</p>
          {selected.length === 1 && first.props.speech && (
            <div className="field">
              <p className="muted speech-said" data-testid="speech-said">
                Says: “{first.props.speech.text.slice(0, 120)}
                {first.props.speech.text.length > 120 ? '…' : ''}”
              </p>
              <button type="button" onClick={() => editor.openSpeech(first.id)}>
                Edit speech…
              </button>
            </div>
          )}
        </section>
      )}
      {sameType && first.type === 'video' && selected.length === 1 && (
        <VideoProperties open={open} video={first} update={updateSelected} />
      )}
    </div>
  );
}

/** A video's playing options: volume, how it starts, controls, trim and poster. */
function VideoProperties({
  open,
  video,
  update,
}: {
  open: OpenProject;
  video: VideoObject;
  update: (changes: (object: SceneObject) => Record<string, unknown>) => void;
}) {
  const { props } = video;
  const pictures = Object.entries(open.project.assets).filter(([, meta]) => meta.kind === 'image');
  const setProps = (patch: Partial<VideoObject['props']>) => update(() => ({ props: patch }));
  /** Trim, and the time on the timeline follows the length played. */
  const setTrim = (trimStart: number, trimEnd: number) => {
    const start = Math.max(0, Math.min(trimStart, props.length - 0.1));
    const end = Math.min(props.length, Math.max(trimEnd, start + 0.1));
    const played = Math.round((end - start) * 100) / 100;
    update(() => ({
      props: { trimStart: start, trimEnd: end },
      timing: { start: video.timing.start, duration: played },
    }));
  };
  return (
    <section>
      <h3 className="panel-subtitle">Video</h3>
      <label className="field">
        <span>Volume {Math.round(props.volume * 100)}%</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={props.volume}
          onChange={(e) => setProps({ volume: Number(e.target.value) })}
          aria-label="Volume"
        />
      </label>
      <label className="field">
        <span>Starts</span>
        <select
          aria-label="Video starts"
          value={props.startOn}
          onChange={(e) => setProps({ startOn: e.target.value as VideoObject['props']['startOn'] })}
        >
          <option value="timeline">With the timeline</option>
          <option value="click">When clicked</option>
          <option value="trigger">When a trigger plays it</option>
        </select>
      </label>
      <label className="field-check">
        <input
          type="checkbox"
          checked={props.controls}
          onChange={(e) => setProps({ controls: e.target.checked })}
        />
        Show controls
      </label>
      <label className="field-check">
        <input
          type="checkbox"
          checked={props.pictureInPicture}
          onChange={(e) => setProps({ pictureInPicture: e.target.checked })}
        />
        Allow picture-in-picture
      </label>
      <div className="field-grid">
        <NumberField
          label="Trim start (s)"
          value={props.trimStart}
          onChange={(value) => setTrim(value, props.trimEnd)}
        />
        <NumberField
          label="Trim end (s)"
          value={props.trimEnd}
          onChange={(value) => setTrim(props.trimStart, value)}
        />
      </div>
      <label className="field">
        <span>Poster</span>
        <select
          aria-label="Poster"
          value={props.poster ?? ''}
          onChange={(e) => setProps({ poster: e.target.value || null })}
        >
          <option value="">First frame</option>
          {pictures.map(([hash, meta]) => (
            <option key={hash} value={hash}>
              {meta.fileName}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        Length {props.length.toFixed(2)} s · plays {(props.trimEnd - props.trimStart).toFixed(2)} s
      </p>
    </section>
  );
}

/**
 * The right of the window (B17): two panels, one above the other. The upper has Triggers, Format
 * and Check; the lower, Slide Layers and Slide Properties. The divider between them is dragged
 * or moved with the arrow keys, and remembered with the rest of the layout.
 */
export function RightPanel({ open, current, size, height }: WithProject & { height: number }) {
  const label = 'Triggers, format and slide panel';
  const { slidePanelTab: lowerTab, rightTab: tab } = useEditor();
  const setTab = editor.showRightTab;
  const setLowerTab = editor.showSlidePanel;
  const { rightSplit } = useSettings().layout;
  const lower = clampRightSplit(rightSplit, height);
  const max = clampRightSplit(Number.MAX_SAFE_INTEGER, height);
  return (
    <Panel name="right" label={label} size={size}>
      <div className="right-part" data-testid="right-upper">
        <header className="panel-header">
          <Tabs
            label={t('rightPanel.tabs')}
            tabs={[
              { id: 'triggers' as const, label: t('rightPanel.triggers') },
              { id: 'format' as const, label: t('rightPanel.format') },
              { id: 'check' as const, label: t('rightPanel.check') },
            ]}
            active={tab}
            onSelect={setTab}
          />
          <CollapseButton name="right" label={label} />
        </header>
        <div className="panel-body" role="tabpanel" aria-label={tab}>
          <section data-testid="triggers" hidden={tab !== 'triggers'}>
            <TriggersPanel open={open} current={current} />
          </section>
          <div hidden={tab !== 'format'}>
            <FormatPanel open={open} current={current} />
          </div>
          <section hidden={tab !== 'check'}>
            {tab === 'check' && <AccessibilityCheck open={open} />}
          </section>
        </div>
      </div>
      <Splitter
        panel="rightSplit"
        label="Resize slide layers and properties panel"
        size={lower}
        min={RIGHT_PART_MIN}
        max={max}
        onResize={(wanted) => ui.resizeRightSplit(clampRightSplit(wanted, height))}
        onCommit={ui.commitLayout}
      />
      <div className="right-part right-lower" data-testid="right-lower" style={{ height: lower }}>
        <header className="panel-header">
          <Tabs
            label={t('rightPanel.lowerTabs')}
            tabs={[
              { id: 'layers' as const, label: t('rightPanel.layers') },
              { id: 'properties' as const, label: t('rightPanel.properties') },
            ]}
            active={lowerTab}
            onSelect={setLowerTab}
          />
        </header>
        <div className="panel-body" role="tabpanel" aria-label={lowerTab}>
          <section data-testid="slide-layers" hidden={lowerTab !== 'layers'}>
            <LayersPanel open={open} current={current} />
          </section>
          <div hidden={lowerTab !== 'properties'}>
            {current && !current.isMaster ? (
              <SlideProperties open={open} slideId={current.slide.id} />
            ) : (
              <Placeholder>
                Slide properties are set on the course’s slides, not on masters.
              </Placeholder>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
