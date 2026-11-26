# B18: the brand: Luke's logo, and Outfit as the app's typeface

**Asked by Luke, 2026-11-26.** "Here is the logos to use with this app, you have the full text logo and the VO icon, make SVGs from this; the font is Outfit and is open source for the Vedra Opus text." Then: "make Outfit the default font for the whole app, it's going to be the brand."

## 1. The logo files (`brand/`)

- **Drawn from Luke's artwork**, a picture of the logo in white on black and black on white.
  - The VO mark is geometry, not a trace: the V's arms, then the right arm running on into the O, all as one band drawn in outline. Its tail is cut parallel to the right arm, a gap away from it.
  - The words are Outfit's own outlines: "Vedra" Bold, "Opus" Regular, at the artwork's letter height, centred under the mark.
  - Outfit is narrower than the lettering in the artwork, so "Vedra" is a little narrower than the mark. Luke named the font, so the font wins.
- **Files:** the full logo and the mark alone, each in black and in white, and the app icon (the white mark on a black square with round corners). `brand/README.md` lists them.

## 2. In the app

- **Welcome screen:** the logo in place of the "Vedra Opus" heading. It is a mask in the theme's text colour, so one file serves light and dark. Its accessible name is "Vedra Opus".
- **App icon:** `apps/desktop/icons/icon.png`, the icon SVG at 1024 px. electron-builder makes the Windows, macOS and Linux icons from it.
- **Typeface:** Outfit, bundled from `@fontsource-variable/outfit` (SIL OFL 1.1, `docs/licences.md`), for the whole interface. System fonts stay as the fallback. Course text keeps its own fonts (Inter by default): this is the app's look, not the courses'.

## Not in this package

- **A wider brand identity** (colours, glass effects). Luke pointed to a Dribbble shot; the page could not be read here, so it waits for his screenshots.
- **A heavier mark for very small icon sizes** (16 px). The outline thins out there; this can be done if the taskbar icon looks weak.

## Done when

- [x] The SVGs exist in black and white, mark and full logo, and the app icon (rendered and compared with the artwork by eye).
- [x] The Welcome screen shows the logo, named "Vedra Opus", and the app's text, Welcome and editor, is in Outfit, loaded from the app's own files (e2e).
- [x] Packaging uses the icon on all three systems (electron-builder config; not built: no builds until Luke asks).
