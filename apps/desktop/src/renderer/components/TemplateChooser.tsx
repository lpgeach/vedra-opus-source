import { useEffect, useState } from 'react';
import type { TemplateInfo } from '../../shared/ipc';
import { t } from '../../shared/strings';
import { editor } from '../project-store';
import { takeFocus } from './dialog-focus';

const size = (template: TemplateInfo) => ({
  width: template.stage?.width ?? 0,
  height: template.stage?.height ?? 0,
});

/**
 * File → New from Template… (docs/briefs/P11.2-templates.md): the built-in
 * templates, then the author's own, and Browse… for any project file.
 */
export function TemplateChooser({ onClose }: { onClose: () => void }) {
  const [templates, setTemplates] = useState<TemplateInfo[] | null>(null);
  const reload = () => void window.vedraopus.template.list().then(setTemplates);
  useEffect(reload, []);

  const row = (template: TemplateInfo) => (
    <li key={template.path} data-testid="template">
      <span className="template-text">
        <strong>{template.name}</strong>
        <span className="muted">
          {template.problem !== null
            ? t('templates.cannotUse', { problem: template.problem })
            : template.slides === 1
              ? t('templates.oneSlide', size(template))
              : t('templates.details', { slides: template.slides, ...size(template) })}
        </span>
      </span>
      <span className="actions">
        <button
          type="button"
          disabled={template.problem !== null}
          aria-label={`${t('templates.use')} ${template.name}`}
          onClick={() => void editor.newFromTemplate(template.path)}
        >
          {t('templates.use')}
        </button>
        {!template.builtIn && (
          <button
            type="button"
            aria-label={`${t('templates.delete')} ${template.name}`}
            onClick={() =>
              void window.vedraopus.template.remove(template.path).then((removed) => {
                if (removed) reload();
              })
            }
          >
            {t('templates.delete')}
          </button>
        )}
      </span>
    </li>
  );

  const builtIn = templates?.filter((each) => each.builtIn) ?? [];
  const own = templates?.filter((each) => !each.builtIn) ?? [];
  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog template-chooser"
        ref={takeFocus}
        tabIndex={-1}
        role="dialog"
        aria-label={t('templates.title')}
        data-testid="template-chooser"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2>{t('templates.title')}</h2>
        {templates === null ? (
          <p role="status">{t('templates.loading')}</p>
        ) : (
          <>
            {builtIn.length > 0 && (
              <section aria-label={t('templates.builtIn')}>
                <h3>{t('templates.builtIn')}</h3>
                <ul className="template-list">{builtIn.map(row)}</ul>
              </section>
            )}
            <section aria-label={t('templates.own')}>
              <h3>{t('templates.own')}</h3>
              {own.length === 0 ? (
                <p className="muted">{t('templates.noOwn')}</p>
              ) : (
                <ul className="template-list">{own.map(row)}</ul>
              )}
            </section>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={() => void editor.newFromTemplate(null)}>
            {t('templates.browse')}
          </button>
          <button type="button" onClick={onClose}>
            {t('templates.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
