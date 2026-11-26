import { useEffect, useRef } from 'react';
import { t } from '../../shared/strings';
import { editor } from '../project-store';
import type { EditorView, OpenProject } from '../project-store';
import { Icon } from './icons';

/** `rgb(r, g, b)` as `#rrggbb`; null for anything else. */
export function toHex(rgb: string): string | null {
  const parts = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!parts) return null;
  return `#${parts
    .slice(1, 4)
    .map((value) => Number(value).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * The window's one bar at the top (docs/briefs/B1-title-bar.md): the menu,
 * the common commands, the project's title and the views. Preview and Publish are at the
 * end of the ribbon's tab row (B17). The
 * system's own buttons sit at its end; the bar is the window's handle.
 */
export function TitleBar({ open, view }: { open: OpenProject | null; view: EditorView }) {
  const bar = useRef<HTMLElement>(null);

  // The window's own buttons take the bar's colours, now and whenever the theme changes.
  useEffect(() => {
    const send = () => {
      const element = bar.current;
      if (!element) return;
      const style = getComputedStyle(element);
      const color = toHex(style.backgroundColor);
      const symbolColor = toHex(style.color);
      if (color && symbolColor)
        void window.vedraopus.app.setTitleBarColours({ color, symbolColor });
    };
    send();
    const themes = new MutationObserver(send);
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    system.addEventListener('change', send);
    return () => {
      themes.disconnect();
      system.removeEventListener('change', send);
    };
  }, []);

  const showMenu = (button: HTMLButtonElement) => {
    const at = button.getBoundingClientRect();
    void window.vedraopus.app.showMenu({ x: Math.round(at.left), y: Math.round(at.bottom) });
  };

  return (
    <header className="title-bar" ref={bar} data-testid="title-bar">
      <div className="title-bar-group">
        <button
          className="icon-button"
          aria-label={t('titleBar.menu')}
          title={t('titleBar.menu')}
          aria-haspopup="menu"
          onClick={(event) => showMenu(event.currentTarget)}
        >
          <Icon name="menu" />
        </button>
        {open && (
          <>
            <span className="title-bar-divider" aria-hidden="true" />
            <button
              className="icon-button"
              aria-label={t('topBar.save')}
              title={t('topBar.save')}
              onClick={() => void editor.save()}
            >
              <Icon name="save" />
            </button>
            <button
              className="icon-button"
              aria-label={t('topBar.undo')}
              title={t('topBar.undo')}
              disabled={!open.history.canUndo}
              onClick={() => open.history.undo()}
            >
              <Icon name="undo" />
            </button>
            <button
              className="icon-button"
              aria-label={t('topBar.redo')}
              title={t('topBar.redo')}
              disabled={!open.history.canRedo}
              onClick={() => open.history.redo()}
            >
              <Icon name="redo" />
            </button>
          </>
        )}
      </div>
      {open ? (
        <input
          className="project-title"
          data-testid="project-title"
          aria-label={t('topBar.projectTitle')}
          spellCheck={false}
          value={open.project.title}
          onChange={(event) =>
            open.history.execute('project.rename', { title: event.target.value })
          }
        />
      ) : (
        <span />
      )}
      <div className="title-bar-right">
        {/* On the Welcome screen and in the editor alike (B9). */}
        <button
          className="top-bar-button donate-button"
          data-testid="donate"
          title={t('titleBar.donateHint')}
          onClick={() => void window.vedraopus.app.donate()}
        >
          {t('titleBar.donate')}
        </button>
        {open && (
          <>
            <div className="segmented" role="group" aria-label={t('topBar.views')}>
              <button aria-pressed={view === 'overview'} onClick={() => editor.setView('overview')}>
                <Icon name="overview" />
                <span>{t('topBar.overview')}</span>
              </button>
              <button aria-pressed={view === 'slide'} onClick={() => editor.setView('slide')}>
                <Icon name="slide" />
                <span>{t('topBar.slideView')}</span>
              </button>
              <button aria-pressed={view === 'master'} onClick={() => editor.openMaster()}>
                <Icon name="master" />
                <span>{t('topBar.masterView')}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
