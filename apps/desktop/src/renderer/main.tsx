import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadSettings } from './ui-store';
import { setLocale } from '../shared/strings';
import '@fontsource/inter/400.css';
import '@fontsource/inter/400-italic.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/700-italic.css';
import './index.css';

// The layout is read before the first render so the editor never appears in
// the default arrangement and then jumps to the remembered one. If settings
// cannot be read the defaults stand, and the app starts all the same.
void Promise.all([
  loadSettings().catch((error: unknown) => console.error('Could not load settings:', error)),
  // The editor's words in main's language (P10.4), before anything is drawn.
  window.vedraopus.app
    .getInfo()
    .then((info) => setLocale(info.uiLocale))
    .catch((error: unknown) => console.error('Could not read the app info:', error)),
]).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
