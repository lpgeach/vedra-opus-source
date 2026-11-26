import type { Project } from '@vedraopus/model';
import { useEffect, useState } from 'react';
import type { SessionInfo } from '../../shared/ipc';
import { t } from '../../shared/strings';
import { handoutSlides } from '../handout';
import { serializeProject } from '@vedraopus/model';
import { takeFocus } from './dialog-focus';

/** Seconds a run-through lasts: each slide in order for its timeline (at least half a second). */
export function runThroughSeconds(project: Project): number {
  return handoutSlides(project, null).reduce(
    (total, { slide }) => total + Math.max(0.5, slide.baseLayer.timeline.duration),
    0,
  );
}

const clock = (seconds: number) => {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/**
 * File → Export Video… (docs/briefs/P11.3-video-and-handout.md, part C): the
 * course played straight through as a WebM video, with its progress.
 */
export function VideoDialog({
  project,
  session,
  onClose,
}: {
  project: Project;
  session: SessionInfo;
  onClose: () => void;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () => window.vedraopus.events.onVideoProgress(({ fraction }) => setProgress(fraction)),
    [],
  );
  const busy = progress !== null;
  const start = async () => {
    setError(null);
    setSaved(null);
    setProgress(0);
    try {
      const path = await window.vedraopus.project.exportVideo({
        workspaceId: session.workspaceId,
        projectJson: serializeProject(project),
      });
      if (path) setSaved(path);
    } catch (thrown) {
      setError(
        (thrown instanceof Error ? thrown.message : String(thrown)).replace(
          /^Error invoking remote method '[^']+': (Error: )?/,
          '',
        ),
      );
    } finally {
      setProgress(null);
    }
  };
  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog video-dialog"
        ref={takeFocus}
        tabIndex={-1}
        role="dialog"
        aria-label={t('video.title')}
        data-testid="video-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) onClose();
        }}
      >
        <h2>{t('video.title')}</h2>
        <p>
          {t('video.summary', {
            length: clock(runThroughSeconds(project)),
            width: project.stage.width,
            height: project.stage.height,
          })}
        </p>
        <p className="muted">{t('video.hint')}</p>
        {busy && (
          <progress
            max={1}
            value={progress}
            aria-label={t('video.progress')}
            data-testid="video-progress"
          />
        )}
        {saved !== null && (
          <p role="status" data-testid="video-saved">
            {t('video.saved', { path: saved })}
          </p>
        )}
        {error !== null && (
          <p role="alert" data-testid="video-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          {busy ? (
            <button type="button" onClick={() => void window.vedraopus.project.cancelVideo()}>
              {t('video.cancel')}
            </button>
          ) : (
            <>
              <button type="button" className="primary" onClick={() => void start()}>
                {t('video.export')}
              </button>
              <button type="button" onClick={onClose}>
                {t('video.close')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
