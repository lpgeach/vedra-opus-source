import { forEachObject } from '@vedraopus/model';
import type { AudioObject, RichText, RichTextNode, Speech } from '@vedraopus/model';
import { useEffect, useState } from 'react';
import type { SpeechVoices } from '../../shared/ipc';
import { editor, editedSlide, useEditor } from '../project-store';
import type { OpenProject } from '../project-store';
import { soundLength, stage } from '../stage/actions';
import { takeFocus } from './dialog-focus';

/** The voice chosen last, so the next sound is in the same voice. For this run of the app. */
let lastVoice: string | null = null;

/** The words of rich text, a line for each paragraph or list item. */
function plainText(doc: RichText): string {
  const lines: string[] = [];
  const words = (node: RichTextNode): string =>
    node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(words).join('');
  const walk = (nodes: readonly RichTextNode[]) => {
    for (const node of nodes) {
      if (node.type === 'paragraph') lines.push(words(node));
      else walk(node.content ?? []);
    }
  };
  walk(doc.content);
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

/** The first words of the text, for the sound's name. */
const nameFor = (text: string) => {
  const words = text.trim().split(/\s+/).slice(0, 6).join(' ');
  return `Speech: ${words.length > 40 ? `${words.slice(0, 40)}…` : words}`;
};

/**
 * Text to Speech (docs/briefs/P6.8-text-to-speech.md): make a sound from
 * text with one of the system's voices, and insert it, or (for a sound made
 * this way) change what it says.
 */
export function SpeechDialog({ open, objectId }: { open: OpenProject; objectId: string | null }) {
  const { view, selectedSlideId, masterTargetId } = useEditor();
  const current = editedSlide(open.history.project, view, selectedSlideId, masterTargetId);
  let editing: AudioObject | null = null;
  if (objectId && current) {
    forEachObject(current.slide.baseLayer.objects, (object) => {
      if (object.id === objectId && object.type === 'audio') editing = object;
    });
  }
  const was: Speech | null = (editing as AudioObject | null)?.props.speech ?? null;
  const [voices, setVoices] = useState<SpeechVoices | null>(null);
  const [text, setText] = useState(was?.text ?? '');
  const [voice, setVoice] = useState<string>('');
  const [rate, setRate] = useState(was?.rate ?? 1);
  const [phase, setPhase] = useState<
    { kind: 'ready' | 'making' } | { kind: 'failed'; message: string }
  >({
    kind: 'ready',
  });

  useEffect(() => {
    let live = true;
    window.vedraopus.speech.voices().then(
      (found) => {
        if (!live) return;
        setVoices(found);
        const has = (id: string | null) =>
          id !== null && found.voices.some((each) => each.id === id);
        // The system's own language exactly (en-us), then the language (en), then any of it.
        const exact = navigator.language.toLowerCase();
        const language = exact.slice(0, 2);
        const fallback =
          found.voices.find((each) => each.language.toLowerCase() === exact)?.id ??
          found.voices.find((each) => each.language.toLowerCase() === language)?.id ??
          found.voices.find((each) => each.language.toLowerCase().startsWith(language))?.id ??
          found.voices[0]?.id ??
          '';
        setVoice(has(was?.voice ?? null) ? was!.voice : has(lastVoice) ? lastVoice! : fallback);
      },
      (error: unknown) =>
        live &&
        setPhase({
          kind: 'failed',
          message: error instanceof Error ? error.message : String(error),
        }),
    );
    return () => {
      live = false;
    };
    // The voices are asked for once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const make = async () => {
    const said = text.trim();
    if (!said || !voice) return;
    setPhase({ kind: 'making' });
    try {
      const asset = await window.vedraopus.speech.make({ text: said, voice, rate });
      lastVoice = voice;
      const speech: Speech = { text: said, voice, rate };
      const { history } = open;
      const target = editing as AudioObject | null;
      editor.beginGesture(target ? 'Change speech' : 'Insert speech');
      try {
        history.execute('asset.add', asset);
        if (target) {
          const length = await soundLength(asset.hash);
          const { duration } = target.timing;
          history.execute('object.update', {
            objectId: target.id,
            changes: {
              props: { asset: asset.hash, length, speech },
              // A bar as long as the old sound becomes as long as the new one.
              ...(duration === target.props.length ? { timing: { duration: length } } : {}),
            },
          });
        } else {
          await stage.insertAudio(asset.hash, { name: nameFor(said), speech });
        }
      } finally {
        editor.commitGesture();
      }
      editor.closeSpeech();
    } catch (error) {
      setPhase({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const notes = current ? plainText(current.slide.notes) : '';
  const missingVoice = was && voices && !voices.voices.some((each) => each.id === was.voice);
  const busy = phase.kind === 'making';

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        ref={takeFocus}
        tabIndex={-1}
        className="dialog speech-dialog"
        role="dialog"
        aria-label="Text to speech"
        data-testid="speech-dialog"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape' && !busy) editor.closeSpeech();
        }}
      >
        <h2>{editing ? 'Edit speech' : 'Text to speech'}</h2>
        {voices && !voices.provider ? (
          <p className="muted" data-testid="speech-hint">
            {voices.hint}
          </p>
        ) : (
          <>
            <label className="field">
              <span>What is said</span>
              <textarea
                aria-label="Speech text"
                rows={6}
                maxLength={5000}
                value={text}
                disabled={busy}
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={busy || notes === ''}
              title={notes === '' ? 'This slide has no notes' : undefined}
              onClick={() => setText(notes)}
            >
              Use slide notes
            </button>
            <div className="speech-row">
              <label className="field">
                <span>Voice</span>
                <select
                  aria-label="Voice"
                  value={voice}
                  disabled={busy || !voices}
                  onChange={(event) => setVoice(event.target.value)}
                >
                  {(voices?.voices ?? []).map((each) => (
                    <option key={each.id} value={each.id}>
                      {each.name} ({each.language})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Speed {rate.toFixed(1)}×</span>
                <input
                  type="range"
                  aria-label="Speed"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={rate}
                  disabled={busy}
                  onChange={(event) => setRate(Number(event.target.value))}
                />
              </label>
            </div>
            {missingVoice && (
              <p className="muted" role="status">
                Its voice is not on this computer, so another is chosen.
              </p>
            )}
            {voices?.provider && (
              <p className="muted">Voices from {voices.provider.name}, on this computer.</p>
            )}
          </>
        )}
        {busy && (
          <p role="status" data-testid="speech-making">
            Making the sound…
          </p>
        )}
        {phase.kind === 'failed' && (
          <p className="field-problem" role="alert">
            {phase.message}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={() => editor.closeSpeech()}>
            Cancel
          </button>
          {voices?.provider && (
            <button
              type="button"
              disabled={busy || text.trim() === '' || voice === ''}
              onClick={() => void make()}
            >
              {editing ? 'Update' : 'Insert'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
