// Loaded into the app's main process by e2e/launch.ts (`-r`) on Windows and
// macOS, where there is no off-screen surface as on Linux, so that a test run
// does not get in the way of whoever is at the desktop:
//
// - Each window is real (it renders and lays out as usual) but transparent,
//   ignores the mouse, stays out of the taskbar and never takes focus.
//   Playwright drives the pages directly, so the tests see no difference.
// - The app's clipboard calls use a clipboard of this app's own, not the
//   system's, so copy and paste in a test leave the developer's alone.
// - It makes no sound, and opens nothing outside itself (no browser, Finder or
//   other app; a test that checks what would open replaces these with its own).
//   On macOS it has no Dock icon and does not become the active app.
// - It never asks macOS for the microphone, which would put a prompt on the
//   desktop: the recording test uses Chromium's stand-in microphone.
const { app, clipboard, shell, systemPreferences } = require('electron');

app.commandLine.appendSwitch('mute-audio');

if (process.platform === 'darwin') {
  systemPreferences.askForMediaAccess = () => Promise.resolve(true);
  const stayInBackground = () => app.setActivationPolicy('accessory');
  stayInBackground();
  app.once('will-finish-launching', stayInBackground);
  app.once('ready', stayInBackground);
}

shell.openExternal = () => Promise.resolve();
shell.openPath = () => Promise.resolve('');
shell.showItemInFolder = () => {};

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
