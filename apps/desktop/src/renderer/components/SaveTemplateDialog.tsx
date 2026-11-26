import { useState } from 'react';
import { t } from '../../shared/strings';
import { editor } from '../project-store';
import { takeFocus } from './dialog-focus';

/**
 * File → Save as Template… (docs/briefs/P11.2-templates.md): a name, then a
 * copy of the project in the templates folder. The project is not changed.
 */
export function SaveTemplateDialog({
  suggested,
  onClose,
}: {
  suggested: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(suggested);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      setSaved(await editor.saveAsTemplate(name.trim()));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog save-template"
        ref={takeFocus}
        tabIndex={-1}
        role="dialog"
        aria-label={t('saveTemplate.title')}
        data-testid="save-template"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2>{t('saveTemplate.title')}</h2>
        {saved !== null ? (
          <p role="status">{t('saveTemplate.saved', { name: saved })}</p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label>
              {t('saveTemplate.name')}
              <input
                type="text"
                value={name}
                maxLength={200}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <p className="muted">{t('saveTemplate.hint')}</p>
            <div className="dialog-actions">
              <button type="submit" className="primary" disabled={!name.trim() || busy}>
                {t('saveTemplate.save')}
              </button>
              <button type="button" onClick={onClose}>
                {t('saveTemplate.cancel')}
              </button>
            </div>
          </form>
        )}
        {saved !== null && (
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>
              {t('saveTemplate.close')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
