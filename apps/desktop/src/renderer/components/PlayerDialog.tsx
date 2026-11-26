import type { PlayerSettings, Slide } from '@vedraopus/model';
import { useState } from 'react';
import { useEditor } from '../project-store';
import { takeFocus } from './dialog-focus';
import { PlayerLook, PlayerWords } from './PlayerLook';
import { PlayerTabs } from './PlayerTabs';

/**
 * Design → Player… (docs/briefs/P8.1-player-frame.md): what the course's
 * player frame shows, and its menu. Every change is applied at once, as one
 * undo step (`project.setPlayer`).
 */

const CONTROLS: [Exclude<keyof PlayerSettings['controls'], 'seekbar'>, string][] = [
  ['submit', 'Submit button (on question slides)'],
  ['volume', 'Volume'],
  ['captions', 'Captions button (when the course has captions)'],
  ['speed', 'Playback speed'],
  ['accessibility', 'Accessibility panel'],
  ['fullscreen', 'Full screen'],
];
const SEEKBAR: [PlayerSettings['controls']['seekbar'], string][] = [
  ['off', 'Off'],
  ['view', 'Shows the time only'],
  ['drag', 'Learners can drag it'],
];
const NAVIGATION: [PlayerSettings['menu']['navigation'], string][] = [
  ['free', 'Free: any slide'],
  ['restricted', 'Restricted: slides already seen'],
  ['locked', 'Locked: shows where the learner is only'],
];

export function PlayerDialog({ onClose }: { onClose: () => void }) {
  const { open } = useEditor();
  if (!open) return null;
  const { player } = open.project;
  const set = (change: Partial<PlayerSettings>) =>
    open.history.execute('project.setPlayer', { player: change });
  const setControls = (change: Partial<PlayerSettings['controls']>) =>
    set({ controls: { ...player.controls, ...change } });
  const setMenu = (change: Partial<PlayerSettings['menu']>) =>
    set({ menu: { ...player.menu, ...change } });
  /** One slide's menu entry; an entry back to the slide's own is dropped. */
  const setEntry = (
    slideId: string,
    change: Partial<{ title: string | null; hidden: boolean }>,
  ) => {
    const entry = { title: null, hidden: false, ...player.menu.entries[slideId], ...change };
    const entries = { ...player.menu.entries };
    if (entry.title === null && !entry.hidden) delete entries[slideId];
    else entries[slideId] = entry;
    setMenu({ entries });
  };
  const pictures = Object.entries(open.project.assets).filter(([, meta]) => meta.kind === 'image');

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog player-dialog"
        ref={takeFocus}
        tabIndex={-1}
        role="dialog"
        aria-label="Player"
        data-testid="player-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2>Player</h2>
        <fieldset>
          <legend>Features</legend>
          <label className="field-check">
            <input
              type="checkbox"
              checked={player.title}
              onChange={(e) => set({ title: e.target.checked })}
            />
            Course title
          </label>
          <label className="field">
            <span>Logo</span>
            <select
              aria-label="Logo"
              value={player.logo ?? ''}
              onChange={(e) => set({ logo: e.target.value || null })}
            >
              <option value="">None</option>
              {pictures.map(([hash, meta]) => (
                <option key={hash} value={hash}>
                  {meta.fileName}
                </option>
              ))}
            </select>
          </label>
          {pictures.length === 0 && (
            <p className="muted">Insert a picture into the course to use it as the logo.</p>
          )}
          <label className="field">
            <span>Seekbar</span>
            <select
              aria-label="Seekbar"
              value={player.controls.seekbar}
              onChange={(e) =>
                setControls({ seekbar: e.target.value as PlayerSettings['controls']['seekbar'] })
              }
            >
              {SEEKBAR.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {CONTROLS.map(([key, label]) => (
            <label key={key} className="field-check">
              <input
                type="checkbox"
                checked={player.controls[key]}
                onChange={(e) => setControls({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Menu</legend>
          <label className="field-check">
            <input
              type="checkbox"
              checked={player.menu.show}
              onChange={(e) => setMenu({ show: e.target.checked })}
            />
            Show the menu
          </label>
          <label className="field">
            <span>Navigation</span>
            <select
              aria-label="Navigation"
              value={player.menu.navigation}
              onChange={(e) =>
                setMenu({ navigation: e.target.value as PlayerSettings['menu']['navigation'] })
              }
            >
              {NAVIGATION.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">Leave a title blank for the slide’s own.</p>
          {open.project.scenes.map((scene, sceneIndex) => (
            <section key={scene.id} className="player-menu-scene">
              <h3>{scene.title || 'Untitled scene'}</h3>
              {scene.slides.map((slide, index) => (
                <MenuEntry
                  key={slide.id}
                  slide={slide}
                  number={
                    open.project.scenes
                      .slice(0, sceneIndex)
                      .reduce((n, each) => n + each.slides.length, 0) +
                    index +
                    1
                  }
                  title={player.menu.entries[slide.id]?.title ?? null}
                  hidden={player.menu.entries[slide.id]?.hidden ?? false}
                  onChange={(change) => setEntry(slide.id, change)}
                />
              ))}
            </section>
          ))}
        </fieldset>
        <PlayerTabs open={open} />
        <PlayerLook open={open} />
        <PlayerWords open={open} />
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** A slide's row in the menu list: its title in the menu, and whether it is hidden. */
function MenuEntry({
  slide,
  number,
  title,
  hidden,
  onChange,
}: {
  slide: Slide;
  /** Its place in the course, counting from 1: what names its fields. */
  number: number;
  title: string | null;
  hidden: boolean;
  onChange: (change: Partial<{ title: string | null; hidden: boolean }>) => void;
}) {
  const own = slide.title || 'Untitled slide';
  const [text, setText] = useState(title ?? '');
  const [shown, setShown] = useState(title);
  // An undo or redo changed it.
  if (shown !== title) {
    setShown(title);
    setText(title ?? '');
  }
  const commit = () => {
    const next = text.trim() === '' ? null : text.trim();
    if (next !== title) onChange({ title: next });
  };
  return (
    <div className="player-menu-entry" data-testid="player-menu-entry">
      <span className="player-menu-number">{number}</span>
      <input
        type="text"
        aria-label={`Menu title for slide ${number}`}
        placeholder={own}
        maxLength={200}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
      <label className="field-check">
        <input
          type="checkbox"
          aria-label={`Hide slide ${number}`}
          checked={hidden}
          onChange={(e) => onChange({ hidden: e.target.checked })}
        />
        Hide
      </label>
    </div>
  );
}
