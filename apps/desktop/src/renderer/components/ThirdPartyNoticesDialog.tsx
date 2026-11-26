import { useEffect, useState } from 'react';
import type { ThirdPartyNotices } from '../../shared/ipc';
import { t } from '../../shared/strings';
import { takeFocus } from './dialog-focus';

/** One entry: its name, version and licence, with its text shown when asked. */
function Notice({
  name,
  version,
  licence,
  text,
  note,
  onOpen,
}: {
  name: string;
  version: string | null;
  licence: string;
  text: string | null;
  note?: string;
  onOpen?: () => void;
}) {
  const [shown, setShown] = useState(false);
  const label = version ? `${name} ${version}` : name;
  return (
    <li className="notice" data-testid="notice">
      <div className="notice-head">
        <span className="notice-label">
          <span className="notice-name">{label}</span>
          <span className="muted">{licence}</span>
        </span>
        <span className="notice-actions">
          {text !== null && (
            <button type="button" aria-expanded={shown} onClick={() => setShown(!shown)}>
              {shown ? t('notices.hide') : t('notices.show')}
            </button>
          )}
          {onOpen && (
            <button type="button" onClick={onOpen}>
              {t('notices.open')}
            </button>
          )}
        </span>
      </div>
      {note && <p className="muted">{note}</p>}
      {shown && text !== null && (
        <pre className="notice-text" aria-label={t('notices.textOf', { name: label })}>
          {text}
        </pre>
      )}
    </li>
  );
}

/**
 * Help → Third-Party Notices… (docs/briefs/R2-notices-and-sources.md): where
 * the source of what we ship is, what Vedra Opus ships alongside its own code,
 * and the libraries built into the editor and the course player.
 */
export function ThirdPartyNoticesDialog({ onClose }: { onClose: () => void }) {
  const [notices, setNotices] = useState<ThirdPartyNotices | null>(null);
  useEffect(() => {
    void window.vedraopus.app.thirdPartyNotices().then(setNotices);
  }, []);
  const where = (usedIn: readonly ('editor' | 'player')[]) =>
    usedIn.length === 2
      ? t('notices.inBoth')
      : usedIn[0] === 'player'
        ? t('notices.inPlayer')
        : t('notices.inEditor');
  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog notices-dialog"
        ref={takeFocus}
        tabIndex={-1}
        role="dialog"
        aria-label={t('notices.title')}
        data-testid="notices-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2>{t('notices.title')}</h2>
        <p data-testid="source-offer">
          {t('notices.sourceOffer', { url: notices?.releasesUrl ?? '' })}
        </p>
        {notices === null ? (
          <p className="muted">{t('notices.loading')}</p>
        ) : (
          <div className="notices-body">
            <h3>{t('notices.components')}</h3>
            <ul className="notices-list" data-testid="notice-components">
              {notices.components.map((each) => (
                <Notice
                  key={each.id}
                  name={each.name}
                  version={each.version}
                  licence={each.licence}
                  text={each.text}
                  {...(each.canOpen
                    ? { onOpen: () => void window.vedraopus.app.openNotice(each.id) }
                    : {})}
                />
              ))}
            </ul>
            <h3>{t('notices.libraries')}</h3>
            <ul className="notices-list" data-testid="notice-packages">
              {notices.packages.map((each) => (
                <Notice
                  key={`${each.name}@${each.version}`}
                  name={each.name}
                  version={each.version}
                  licence={each.licence}
                  text={each.text}
                  note={
                    each.standard
                      ? `${where(each.usedIn)} ${t('notices.standardText')}`
                      : where(each.usedIn)
                  }
                />
              ))}
            </ul>
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t('notices.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
