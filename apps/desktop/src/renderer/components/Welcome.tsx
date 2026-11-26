import { useEffect, useState } from 'react';
import type { AppInfo, RecentFile, RecoverableProject } from '../../shared/ipc';
import { editor } from '../project-store';
import { t } from '../../shared/strings';

/** What the window shows with no project open: start one, open one, or pick up where a crash left off. */
export function Welcome() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const [recoverable, setRecoverable] = useState<RecoverableProject[]>([]);

  useEffect(() => {
    const { app, project } = window.vedraopus;
    void app.getInfo().then(setInfo);
    void project.listRecent().then(setRecent);
    void project.listRecoverable().then(setRecoverable);
  }, []);

  const discard = async (workspaceId: string) => {
    await window.vedraopus.project.discardRecovery(workspaceId);
    setRecoverable((list) => list.filter((each) => each.workspaceId !== workspaceId));
  };

  return (
    <main className="welcome">
      <h1>Vedra Opus</h1>
      <p>{t('welcome.tagline')}</p>
      <div className="actions">
        <button className="primary" onClick={() => void editor.newProject()}>
          {t('welcome.new')}
        </button>
        <button onClick={() => void editor.openProject()}>{t('welcome.open')}</button>
        <button onClick={() => editor.setTemplatesOpen(true)}>
          {t('welcome.newFromTemplate')}
        </button>
        <button onClick={() => void editor.importPowerPoint()}>
          {t('welcome.importPowerPoint')}
        </button>
        <button onClick={() => void editor.importStoryline()}>
          {t('welcome.importStoryline')}
        </button>
        <button onClick={() => void editor.openDemo()}>{t('welcome.demo')}</button>
      </div>

      {recoverable.length > 0 && (
        <section className="card" data-testid="recovery">
          <h2>{t('welcome.recovered')}</h2>
          <p className="muted">{t('welcome.recoveredHint')}</p>
          <ul>
            {recoverable.map((each) => (
              <li key={each.workspaceId}>
                <span>
                  <strong>{each.title}</strong>
                  <span className="muted"> · {new Date(each.modifiedAt).toLocaleString()}</span>
                </span>
                <span className="actions">
                  <button onClick={() => void editor.recover(each.workspaceId)}>
                    {t('welcome.recover')}
                  </button>
                  <button onClick={() => void discard(each.workspaceId)}>
                    {t('welcome.discard')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section className="card" data-testid="recent">
          <h2>{t('welcome.recent')}</h2>
          <ul>
            {recent.map((file) => (
              <li key={file.path}>
                <button
                  className="link"
                  title={file.path}
                  onClick={() => void editor.openPath(file.path)}
                >
                  {file.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="muted" data-testid="app-info">
        {info
          ? t('welcome.version', { version: info.version, platform: info.platform })
          : t('welcome.starting')}
      </p>
    </main>
  );
}
