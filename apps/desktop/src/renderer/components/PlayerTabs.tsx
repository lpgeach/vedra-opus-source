import { createId, RESOURCE_URL } from '@vedraopus/model';
import type { PlayerSettings } from '@vedraopus/model';
import { useState } from 'react';
import { editor } from '../project-store';
import type { OpenProject } from '../project-store';

type Tabs = PlayerSettings['tabs'];

/**
 * The Player dialog's Tabs section (docs/briefs/P8.2-player-tabs.md):
 * Resources, Glossary, Notes and the author's own tabs. Each change is one
 * undo step; text is kept when its field loses focus.
 */
export function PlayerTabs({ open }: { open: OpenProject }) {
  const { tabs } = open.project.player;
  const set = (change: Partial<Tabs>) =>
    open.history.execute('project.setPlayer', { player: { tabs: { ...tabs, ...change } } });
  const { resources, glossary } = tabs;
  const setItems = (items: Tabs['resources']['items']) =>
    set({ resources: { ...resources, items } });
  const setTerms = (terms: Tabs['glossary']['terms']) => set({ glossary: { ...glossary, terms } });

  const setTab = (id: string, change: Partial<Tabs['custom'][number]>) =>
    set({ custom: tabs.custom.map((each) => (each.id === id ? { ...each, ...change } : each)) });
  /** Slides a custom tab can open as a lightbox (P8.4): scene slides, not draws. */
  // Numbered as the Menu list numbers them: slide titles are often the same (the Phase 8 review).
  const lightboxSlides = open.project.scenes
    .flatMap((scene) => scene.slides)
    .map((slide, index) => ({ slide, number: index + 1 }))
    .filter(({ slide }) => !slide.draw);

  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const urlOk = RESOURCE_URL.test(linkUrl.trim());

  return (
    <fieldset data-testid="player-tabs">
      <legend>Tabs</legend>

      <h3>Resources</h3>
      <label className="field-check">
        <input
          type="checkbox"
          checked={resources.show}
          onChange={(e) => set({ resources: { ...resources, show: e.target.checked } })}
        />
        Show the Resources tab
      </label>
      {resources.items.map((item, index) => (
        <div key={item.id} className="player-tab-row" data-testid="resource-item">
          <CommitField
            label={`Resource ${index + 1} title`}
            value={item.title}
            maxLength={200}
            required
            onCommit={(title) =>
              setItems(
                resources.items.map((each) => (each.id === item.id ? { ...each, title } : each)),
              )
            }
          />
          <span className="muted player-tab-target">
            {item.target.kind === 'link'
              ? item.target.url
              : (open.project.assets[item.target.asset]?.fileName ?? 'a missing file')}
          </span>
          <button
            type="button"
            aria-label={`Remove resource ${index + 1}`}
            onClick={() => setItems(resources.items.filter((each) => each.id !== item.id))}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="player-tab-row">
        <input
          type="text"
          aria-label="New link title"
          placeholder="Title"
          maxLength={200}
          value={linkTitle}
          onChange={(e) => setLinkTitle(e.target.value)}
        />
        <input
          type="url"
          aria-label="New link address"
          placeholder="https://"
          maxLength={2000}
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
        />
        <button
          type="button"
          disabled={!urlOk}
          onClick={() => {
            const url = linkUrl.trim();
            setItems([
              ...resources.items,
              {
                id: createId('res'),
                title: linkTitle.trim().slice(0, 200) || url.slice(0, 200),
                target: { kind: 'link', url },
              },
            ]);
            setLinkTitle('');
            setLinkUrl('');
          }}
        >
          Add link
        </button>
      </div>
      {linkUrl.trim() !== '' && !urlOk && (
        <p className="muted">A link starts with https://, http:// or mailto:.</p>
      )}
      <button type="button" onClick={() => void editor.addResourceFiles()}>
        Add file…
      </button>

      <h3>Glossary</h3>
      <label className="field-check">
        <input
          type="checkbox"
          checked={glossary.show}
          onChange={(e) => set({ glossary: { ...glossary, show: e.target.checked } })}
        />
        Show the Glossary tab
      </label>
      {glossary.terms.map((term, index) => (
        <div
          key={term.id}
          className="player-tab-row player-glossary-row"
          data-testid="glossary-term"
        >
          <CommitField
            label={`Term ${index + 1}`}
            value={term.term}
            maxLength={200}
            required
            onCommit={(text) =>
              setTerms(
                glossary.terms.map((each) =>
                  each.id === term.id ? { ...each, term: text } : each,
                ),
              )
            }
          />
          <CommitField
            label={`Definition ${index + 1}`}
            value={term.definition}
            maxLength={5000}
            multiline
            onCommit={(definition) =>
              setTerms(
                glossary.terms.map((each) =>
                  each.id === term.id ? { ...each, definition } : each,
                ),
              )
            }
          />
          <button
            type="button"
            aria-label={`Remove term ${index + 1}`}
            onClick={() => setTerms(glossary.terms.filter((each) => each.id !== term.id))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setTerms([...glossary.terms, { id: createId('term'), term: 'New term', definition: '' }])
        }
      >
        Add term
      </button>

      <h3>Notes</h3>
      <label className="field-check">
        <input
          type="checkbox"
          checked={tabs.notes.show}
          onChange={(e) => set({ notes: { show: e.target.checked } })}
        />
        Show the Notes tab (the slides’ notes)
      </label>

      <h3>Custom tabs</h3>
      <p className="muted">
        A custom tab runs the slide’s triggers for “the learner clicks the player tab”, or opens a
        slide as a lightbox.
      </p>
      {tabs.custom.map((tab, index) => (
        <div key={tab.id} className="player-tab-row" data-testid="custom-tab">
          <CommitField
            label={`Custom tab ${index + 1} label`}
            value={tab.label}
            maxLength={40}
            required
            onCommit={(label) =>
              set({
                custom: tabs.custom.map((each) => (each.id === tab.id ? { ...each, label } : each)),
              })
            }
          />
          <select
            aria-label={`Custom tab ${index + 1} does`}
            value={tab.lightbox?.slide ?? ''}
            onChange={(e) => {
              const slide = e.target.value;
              const lightbox = slide ? { slide, controls: tab.lightbox?.controls ?? false } : null;
              setTab(tab.id, { lightbox });
            }}
          >
            <option value="">Runs the slide’s triggers</option>
            {lightboxSlides.map(({ slide, number }) => (
              <option key={slide.id} value={slide.id}>
                Opens slide {number} (“{slide.title || 'Untitled slide'}”) as a lightbox
              </option>
            ))}
          </select>
          {tab.lightbox && (
            <label className="field-check">
              <input
                type="checkbox"
                aria-label={`Custom tab ${index + 1} lightbox shows Previous and Next`}
                checked={tab.lightbox.controls}
                onChange={(e) =>
                  setTab(tab.id, {
                    lightbox: { slide: tab.lightbox!.slide, controls: e.target.checked },
                  })
                }
              />
              Previous and Next
            </label>
          )}
          <button
            type="button"
            aria-label={`Remove custom tab ${index + 1}`}
            title="Its triggers are removed with it"
            onClick={() => set({ custom: tabs.custom.filter((each) => each.id !== tab.id) })}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={tabs.custom.length >= 10}
        onClick={() =>
          set({
            custom: [
              ...tabs.custom,
              { id: createId('tab'), label: `Tab ${tabs.custom.length + 1}`, lightbox: null },
            ],
          })
        }
      >
        Add tab
      </button>
    </fieldset>
  );
}

/**
 * A text field kept when it loses focus (or on Enter, for one line). A
 * required one left blank goes back to what it was.
 */
export function CommitField({
  label,
  value,
  maxLength,
  required = false,
  multiline = false,
  onCommit,
}: {
  label: string;
  value: string;
  maxLength: number;
  required?: boolean;
  multiline?: boolean;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  // An undo or redo changed it.
  if (shown !== value) {
    setShown(value);
    setText(value);
  }
  const commit = () => {
    const next = multiline ? text : text.trim();
    if (required && next.trim() === '') {
      setText(value);
      return;
    }
    if (next !== value) onCommit(next);
  };
  return multiline ? (
    <textarea
      aria-label={label}
      maxLength={maxLength}
      value={text}
      rows={2}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
    />
  ) : (
    <input
      type="text"
      aria-label={label}
      maxLength={maxLength}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}
