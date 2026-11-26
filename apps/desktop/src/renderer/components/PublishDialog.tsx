import { serializeProject } from '@vedraopus/model';
import type { PublishSettings, Tracking } from '@vedraopus/model';
import { checkPublishSettings, defaultIdentifier, settingsFields } from '@vedraopus/publish';
import { useEffect, useState } from 'react';
import { editor } from '../project-store';
import type { OpenProject } from '../project-store';
import { REPORTING } from './TrackingDialog';
import { takeFocus } from './dialog-focus';

type Phase =
  | { kind: 'form' }
  | { kind: 'working'; done: number; total: number }
  | { kind: 'done'; path: string; output: 'folder' | 'zip'; files: number; warnings: string[] }
  | { kind: 'failed'; message: string };

const TARGETS: [PublishSettings['target'], string][] = [
  ['web', 'Web'],
  ['scorm12', 'SCORM 1.2'],
  ['scorm2004', 'SCORM 2004'],
  ['xapi', 'xAPI'],
  ['cmi5', 'cmi5'],
];
const EDITIONS: [PublishSettings['scorm2004Edition'], string][] = [
  [4, '4th edition'],
  [3, '3rd edition'],
  [2, '2nd edition'],
];

/**
 * Publish the course: as a web course or a package for an LMS, into a folder
 * or a zip. The choices are kept with the project (saved when Publish is
 * pressed); the folder is remembered on this computer.
 */
export function PublishDialog({ open, onClose }: { open: OpenProject; onClose: () => void }) {
  const project = open.project;
  const [settings, setSettings] = useState<PublishSettings>(() => ({
    ...project.publish,
    title: project.publish.title || project.title.trim() || 'Course',
  }));
  const [reporting, setReporting] = useState<Tracking['reporting']>(project.tracking.reporting);
  const [folder, setFolder] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const working = phase.kind === 'working';
  const fields = settingsFields(settings.target);
  const problems = checkPublishSettings(settings);
  const ready =
    Boolean(folder) && settings.title.trim() !== '' && Object.keys(problems).length === 0;
  const change = (next: Partial<PublishSettings>) => setSettings((now) => ({ ...now, ...next }));

  useEffect(
    () =>
      window.vedraopus.events.onPublishProgress(({ done, total }) =>
        setPhase((now) => (now.kind === 'working' ? { kind: 'working', done, total } : now)),
      ),
    [],
  );
  useEffect(() => {
    let live = true;
    void window.vedraopus.publish.lastFolder(project.id).then((last) => {
      if (live && last) setFolder((now) => now ?? last);
    });
    return () => {
      live = false;
    };
  }, [project.id]);

  const choose = async () => {
    const chosen = await window.vedraopus.publish.chooseFolder();
    if (chosen) setFolder(chosen);
  };

  const publish = async () => {
    if (!folder || !ready) return;
    // The settings travel with the project: one undoable step, then publish what was saved.
    const title = settings.title.trim();
    const saved: PublishSettings = {
      ...settings,
      title: title === project.title.trim() ? '' : title,
    };
    const settingsChanged = JSON.stringify(saved) !== JSON.stringify(project.publish);
    const reportingChanged = reporting !== project.tracking.reporting;
    if (settingsChanged || reportingChanged) {
      // Through `editor`, so main hears of the change and the project shows it unsaved.
      editor.beginGesture('Publish settings');
      if (settingsChanged) open.history.execute('project.setPublishSettings', { settings: saved });
      if (reportingChanged)
        open.history.execute('project.setTracking', { tracking: { reporting } });
      editor.commitGesture();
    }
    setPhase({ kind: 'working', done: 0, total: 1 });
    try {
      const result = await window.vedraopus.publish.run({
        workspaceId: open.session.workspaceId,
        projectJson: serializeProject(open.history.project),
        folder,
      });
      setPhase(
        result.status === 'done'
          ? {
              kind: 'done',
              path: result.path,
              output: result.kind,
              files: result.files,
              warnings: result.warnings,
            }
          : { kind: 'form' },
      );
    } catch (error) {
      setPhase({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog publish-dialog"
        ref={takeFocus}
        tabIndex={-1}
        role="dialog"
        aria-label="Publish"
        data-testid="publish-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !working) onClose();
        }}
      >
        <h2>Publish</h2>
        <label className="field">
          <span>Publish to</span>
          <select
            aria-label="Publish to"
            value={settings.target}
            disabled={working}
            onChange={(event) => {
              const target = event.target.value as PublishSettings['target'];
              // An LMS takes a zip; moving from the web to an LMS suggests one.
              change({
                target,
                ...(settings.target === 'web' && target !== 'web' ? { zip: true } : {}),
              });
            }}
          >
            {TARGETS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {fields.edition && (
          <label className="field">
            <span>Edition</span>
            <select
              aria-label="Edition"
              value={settings.scorm2004Edition}
              disabled={working}
              onChange={(event) =>
                change({
                  scorm2004Edition: Number(
                    event.target.value,
                  ) as PublishSettings['scorm2004Edition'],
                })
              }
            >
              {EDITIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        {fields.edition && settings.scorm2004Edition === 3 && (
          <p className="muted" data-testid="publish-edition-note">
            The 3rd edition is published without its schema files. Most LMSs do not need them.
          </p>
        )}
        <label className="field">
          <span>Course title</span>
          <input
            aria-label="Course title"
            value={settings.title}
            disabled={working}
            onChange={(event) => change({ title: event.target.value })}
          />
        </label>
        {fields.identifier && (
          <label className="field">
            <span>Identifier</span>
            <input
              aria-label="Identifier"
              value={settings.identifier}
              placeholder={defaultIdentifier(project, settings.target)}
              disabled={working}
              aria-invalid={problems.identifier ? true : undefined}
              aria-describedby={problems.identifier ? 'publish-identifier-problem' : undefined}
              onChange={(event) => change({ identifier: event.target.value })}
            />
          </label>
        )}
        {fields.identifier && problems.identifier && (
          <p className="field-problem" id="publish-identifier-problem" role="alert">
            {problems.identifier}
          </p>
        )}
        {fields.version && (
          <label className="field">
            <span>Version</span>
            <input
              aria-label="Version"
              value={settings.version}
              disabled={working}
              aria-invalid={problems.version ? true : undefined}
              aria-describedby={problems.version ? 'publish-version-problem' : undefined}
              onChange={(event) => change({ version: event.target.value })}
            />
          </label>
        )}
        {fields.version && problems.version && (
          <p className="field-problem" id="publish-version-problem" role="alert">
            {problems.version}
          </p>
        )}
        {fields.description && (
          <label className="field">
            <span>Description</span>
            <textarea
              aria-label="Description"
              value={settings.description}
              rows={2}
              disabled={working}
              onChange={(event) => change({ description: event.target.value })}
            />
          </label>
        )}
        {fields.reporting && (
          <>
            <label className="field">
              <span>Tell the LMS the course is</span>
              <select
                aria-label="Tell the LMS the course is"
                value={reporting}
                disabled={working}
                onChange={(event) => setReporting(event.target.value as Tracking['reporting'])}
              >
                {REPORTING.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">
              When the course counts as complete, and resuming: Design → Tracking.
            </p>
          </>
        )}
        <fieldset className="field publish-output" disabled={working}>
          <legend>Output</legend>
          <label>
            <input
              type="radio"
              name="publish-output"
              checked={!settings.zip}
              onChange={() => change({ zip: false })}
            />
            Folder
          </label>
          <label>
            <input
              type="radio"
              name="publish-output"
              checked={settings.zip}
              onChange={() => change({ zip: true })}
            />
            Zip file
          </label>
        </fieldset>
        <div className="field">
          <span>Output folder</span>
          <span data-testid="publish-folder" className="muted">
            {folder ?? 'None chosen'}
          </span>
          <button type="button" disabled={working} onClick={() => void choose()}>
            Choose folder…
          </button>
        </div>
        {phase.kind === 'working' && (
          <progress
            aria-label="Publishing progress"
            value={phase.done}
            max={Math.max(phase.total, 1)}
          />
        )}
        {phase.kind === 'done' && (
          <>
            <p data-testid="publish-result" role="status">
              Published {phase.files} files {phase.output === 'zip' ? 'into' : 'to'} {phase.path}
            </p>
            {phase.warnings.map((warning) => (
              <p key={warning} className="field-problem" data-testid="publish-warning">
                {warning}
              </p>
            ))}
          </>
        )}
        {phase.kind === 'failed' && (
          <p data-testid="publish-error" role="alert">
            {phase.message}
          </p>
        )}
        <div className="dialog-actions">
          {phase.kind === 'done' && (
            <button
              type="button"
              onClick={() =>
                void window.vedraopus.publish.view({ path: phase.path, kind: phase.output })
              }
            >
              {phase.output === 'zip' ? 'Show zip file' : 'View published course'}
            </button>
          )}
          {working ? (
            <button type="button" onClick={() => void window.vedraopus.publish.cancel()}>
              Cancel publishing
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose}>
                {phase.kind === 'done' ? 'Close' : 'Cancel'}
              </button>
              {phase.kind !== 'done' && (
                <button type="button" disabled={!ready} onClick={() => void publish()}>
                  Publish
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
