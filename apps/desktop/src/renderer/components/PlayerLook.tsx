import {
  accentFor,
  DEFAULT_LABELS,
  LABEL_KEYS,
  LANGUAGE_TAG,
  presetOf,
  withPreset,
} from '@vedraopus/model';
import type { LabelKey, PlayerLook as Look, PlayerSettings } from '@vedraopus/model';
import { useState } from 'react';
import type { OpenProject } from '../project-store';
import { ui, useSettings } from '../ui-store';
import { CommitField } from './PlayerTabs';

/**
 * Says when courses will show a stronger shade of the accent than the author's,
 * because it is too faint against a scheme the course can use (`accentFor`,
 * docs/briefs/P10.1-accessibility.md, part C).
 */
function AccentNote({ look }: { look: Look }) {
  const schemes = look.scheme === 'auto' ? (['dark', 'light'] as const) : [look.scheme];
  const changed = schemes
    .map((scheme) => ({ scheme, shade: accentFor(look.accent, scheme) }))
    .filter(({ shade }) => shade !== look.accent.toLowerCase());
  if (changed.length === 0) return null;
  const where = changed
    .map(({ scheme, shade }) => `${shade} on the ${scheme} scheme`)
    .join(', and ');
  return (
    <p className="field-problem" data-testid="accent-note" role="status">
      This accent is too faint to see focus and pressed controls against the player. Courses show a
      stronger shade: {where}.
    </p>
  );
}

/**
 * The Player dialog's Look and Words sections (docs/briefs/P8.3-player-appearance.md),
 * with the installation's presets. Every change is one undo step.
 */
export function PlayerLook({ open }: { open: OpenProject }) {
  const { player } = open.project;
  const { look } = player;
  const set = (change: Partial<PlayerSettings>) =>
    open.history.execute('project.setPlayer', { player: change });
  const setLook = (change: Partial<Look>) => set({ look: { ...look, ...change } });
  const { playerPresets } = useSettings();
  const [presetId, setPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const chosen = playerPresets.find((each) => each.id === presetId) ?? playerPresets[0];

  return (
    <fieldset data-testid="player-look">
      <legend>Look</legend>
      <label className="field">
        <span>Colours</span>
        <select
          aria-label="Colour scheme"
          value={look.scheme}
          onChange={(e) => setLook({ scheme: e.target.value as Look['scheme'] })}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="auto">The learner’s system setting</option>
        </select>
      </label>
      <label className="field">
        <span>Accent colour</span>
        <input
          type="color"
          aria-label="Accent colour"
          value={look.accent}
          onChange={(e) => setLook({ accent: e.target.value })}
        />
      </label>
      <AccentNote look={look} />
      <label className="field">
        <span>Font</span>
        <select
          aria-label="Player font"
          value={look.font}
          onChange={(e) => setLook({ font: e.target.value as Look['font'] })}
        >
          <option value="system">The system’s</option>
          <option value="body">The theme’s body font ({open.project.theme.fonts.body})</option>
          <option value="heading">
            The theme’s heading font ({open.project.theme.fonts.heading})
          </option>
        </select>
      </label>
      <label className="field">
        <span>Controls</span>
        <select
          aria-label="Controls position"
          value={look.controlsAt}
          onChange={(e) => setLook({ controlsAt: e.target.value as Look['controlsAt'] })}
        >
          <option value="bottom">Under the course</option>
          <option value="top">Above the course</option>
        </select>
      </label>
      <label className="field">
        <span>Menu</span>
        <select
          aria-label="Menu side"
          value={look.menuSide}
          onChange={(e) => setLook({ menuSide: e.target.value as Look['menuSide'] })}
        >
          <option value="left">At the left</option>
          <option value="right">At the right</option>
        </select>
      </label>

      <h3>Presets</h3>
      <p className="muted">
        A preset keeps the look, the words and the controls, for any project on this computer.
      </p>
      {playerPresets.length > 0 && (
        <div className="player-tab-row">
          <select
            aria-label="Preset"
            value={chosen?.id ?? ''}
            onChange={(e) => setPresetId(e.target.value)}
          >
            {playerPresets.map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!chosen}
            onClick={() => chosen && set(withPreset(player, chosen))}
          >
            Apply preset
          </button>
          <button
            type="button"
            disabled={!chosen}
            onClick={() => chosen && ui.deletePlayerPreset(chosen.id)}
          >
            Delete preset
          </button>
        </div>
      )}
      <div className="player-tab-row">
        <input
          type="text"
          aria-label="New preset name"
          placeholder="Preset name"
          maxLength={80}
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
        />
        <button
          type="button"
          disabled={presetName.trim() === ''}
          onClick={() => {
            const preset = presetOf(player, presetName.trim());
            ui.savePlayerPreset(preset);
            setPresetId(preset.id);
            setPresetName('');
          }}
        >
          Save as preset
        </button>
      </div>
    </fieldset>
  );
}

/** The frame's words for the course's language; blank uses the English. */
export function PlayerWords({ open }: { open: OpenProject }) {
  const { labels } = open.project.player;
  // The words kept for each language (P10.3, part C): the course's, and any other
  // that has some, from a translation or typed in before the language changed.
  const languages = [labels.language, ...Object.keys(labels.words)].filter(
    (tag, index, all) => all.indexOf(tag) === index,
  );
  const [chosen, setChosen] = useState(labels.language);
  const editing = languages.includes(chosen) ? chosen : labels.language;
  const words = labels.words[editing] ?? {};
  const setLabels = (change: Partial<PlayerSettings['labels']>) =>
    open.history.execute('project.setPlayer', { player: { labels: { ...labels, ...change } } });
  const setWord = (key: LabelKey, text: string) => {
    const next = { ...words };
    if (text.trim() === '') delete next[key];
    else next[key] = text;
    setLabels({ words: { ...labels.words, [editing]: next } });
  };
  const [language, setLanguage] = useState(labels.language);
  const [shownLanguage, setShownLanguage] = useState(labels.language);
  if (shownLanguage !== labels.language) {
    setShownLanguage(labels.language);
    setLanguage(labels.language);
  }
  const languageOk = LANGUAGE_TAG.test(language.trim());
  const commitLanguage = () => {
    const tag = language.trim();
    if (!languageOk) setLanguage(labels.language);
    else if (tag !== labels.language) setLabels({ language: tag });
  };

  return (
    <fieldset data-testid="player-words">
      <legend>Words</legend>
      <label className="field">
        <span>Course language</span>
        <input
          type="text"
          aria-label="Course language"
          maxLength={35}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          onBlur={commitLanguage}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitLanguage();
          }}
        />
      </label>
      {!languageOk && <p className="muted">A language tag, such as en, fr or pt-BR.</p>}
      <p className="muted">
        The player’s own words, in this language. Blank uses the English shown; the words for each
        language are kept when you change it.
      </p>
      {languages.length > 1 && (
        <label className="field">
          <span>Words for</span>
          <select
            aria-label="Words for"
            value={editing}
            onChange={(e) => setChosen(e.target.value)}
          >
            {languages.map((tag) => (
              <option key={tag} value={tag}>
                {tag === labels.language ? `${tag} (the course’s)` : tag}
              </option>
            ))}
          </select>
        </label>
      )}
      <details>
        <summary>Every word ({LABEL_KEYS.length})</summary>
        {LABEL_KEYS.map((key) => (
          <WordField
            key={`${editing}:${key}`}
            label={`Word for ${DEFAULT_LABELS[key]}`}
            english={DEFAULT_LABELS[key]}
            value={words[key] ?? ''}
            onCommit={(text) => setWord(key, text)}
          />
        ))}
      </details>
    </fieldset>
  );
}

function WordField({
  label,
  english,
  value,
  onCommit,
}: {
  label: string;
  english: string;
  value: string;
  onCommit: (text: string) => void;
}) {
  return (
    <div className="player-tab-row player-word">
      <span className="muted player-word-english">{english}</span>
      <span className="player-word-input">
        <CommitField label={label} value={value} maxLength={300} onCommit={onCommit} />
      </span>
    </div>
  );
}
