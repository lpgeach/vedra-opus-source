// Loaded into the app's main process by e2e/launch.ts (`-r`) on Windows and
// macOS, where there is no off-screen surface as on Linux, so that a test run
// does not get in the way of whoever is at the desktop:
//
// - Each window is real (it renders and lays out as usual) but transparent,
//   ignores the mouse, stays out of the taskbar and never takes focus.
//   Playwright drives the pages directly, so the tests see no difference.
// - The app's clipboard calls use a clipboard of this app's own, not the
//   system's, so copy and paste in a test leave the developer's alone.
const { app, clipboard } = require('electron');

app.on('browser-window-created', (_event, window) => {
  window.setOpacity(0);
  window.setIgnoreMouseEvents(true);
  window.setSkipTaskbar(true);
  window.show = () => window.showInactive();
  window.focus = () => {};
});

let text = '';
clipboard.readText = () => text;
clipboard.writeText = (value) => {
  text = value;
};
