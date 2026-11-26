# B1 One title bar: the menu, the commands and the window's buttons on one row

**Not a plan package:** work Luke asked for after alpha 1 (2026-11-23), testing the app on Windows.

## Luke's decisions (2026-11-23)

- **One row at the top.** The menus (File, Edit, View, Insert, Help) go into a hamburger button on the same row as Save and Undo. The common commands are icons. Minimise, maximise and close are at the top right, on the same row.
- **The compact layout:**
  - left: the hamburger, Save, Undo, Redo, Preview;
  - centre: the project's title;
  - right: Publish, the views (Overview, Slide, Master), then the window's buttons.
- **macOS keeps its conventions:** the traffic lights at the top left of our bar, and the menu in the macOS menu bar as always. The hamburger is there too, for one way of working on every system.

## How

- **The window has no frame of its own** (`titleBarStyle: 'hidden'`):
  - On Windows and Linux, the system draws minimise, maximise and close over our bar's right end (`titleBarOverlay`). They behave as native buttons, Windows 11's snap layouts included. Their colours follow the editor's theme: the renderer sends the bar's colours whenever the theme changes, and main calls `setTitleBarOverlay`.
  - On macOS, the traffic lights sit in our bar (`trafficLightPosition`).
  - In both cases the CSS window-controls variables (`env(titlebar-area-x)`, `env(titlebar-area-width)`) keep our content clear of them.
- **The menus stay one native application menu:** the same items, keyboard shortcuts and tests. The hamburger opens it as a drop-down below itself (`Menu.popup`, IPC `app:showMenu`).
- **Its shortcuts without a menu bar (found while building it):** on Windows and Linux, a window with its title bar hidden shows no menu bar, and the system then sends no keys to the menu's shortcuts. Ctrl+S, Ctrl+Z and the rest stopped. So main matches each key press against the menu's items before the page sees it (`before-input-event`, `main/accelerators.ts`) and runs the item, as the menu bar did. macOS keeps its own menu bar, where they work as always.
- **The bar is the window's handle:** dragging it moves the window, and double-clicking it maximises, as with any title bar. Its buttons and the title field are not.
- **The bar is shown with and without a project:** on the Welcome screen it holds the hamburger and the app's name.
- **New icons,** in our own style (`icons.tsx`): the menu, Preview (a play triangle), and Master view, which no longer shares the slide's icon.
- **The words are in the string catalogue.**

## Tests

- **e2e:**
  - the bar has the hamburger, Save, Undo, Redo, Preview, the title, Publish and the views;
  - the hamburger opens the application menu below itself (`Menu.popup`, recorded in main);
  - Preview opens the preview;
  - a keyboard shortcut (Ctrl+M, a new slide) still works with no menu bar;
  - on Windows and Linux the window controls overlay is on, and switching the theme sends the bar's colours to main.
- **Screenshots** of both themes, the Welcome screen and the editor, looked at.

## Done when

The tests pass, the full checks pass on Windows and Linux, and the macOS VM shows the traffic lights in the bar (its e2e).
