# Accessibility

[Help contents](README.md)

Vedra Opus courses work with screen readers, the keyboard alone, and learners' own settings such as larger text and less motion. Most of that is built in. This page covers what it needs from you, and how the **Check** tab helps you get it right.

## What you provide

### Alt text

**Alt text** is what a screen reader says for an object that has no words of its own: a picture, an icon, a 360° image, a hotspot, a button that is only an icon.

Select the object, open the **Format** panel, and under **Accessibility**:

- **Alt text:** a short description of what matters about it, for example "Map of UK spaceports, with three marked in Scotland and one in Cornwall";
- **Decorative: screen readers skip it**, for objects that add nothing to the meaning: background shapes, dividers, decorative pictures.

Text boxes are read by their words, so they need no alt text. A group with alt text is read as one named thing.

### Tab order

Learners using the keyboard move through a slide's objects with Tab. By default they go in the slide's layout order, top to bottom and left to right.

**Home → Tab Order** opens the slide's **Tab order** (in **Slide Properties**):

- **Follow the layout**, the default;
- **My own order:** list the objects in the order you want, with the arrows to move them. Objects you leave out come after, in layout order.

### Captions

Give narration and videos [captions](audio-and-video.md#captions), so learners who cannot hear them can read them.

### Colours

Text needs enough contrast with what is behind it to be read easily: 4.5 to 1, or 3 to 1 for large text. The **Check** tab tells you where it falls short.

## The Check tab

The **Check** tab of the right-hand panel lists what would keep some learners out, slide by slide. It keeps itself up to date as you work.

| Kind          | What it finds                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Alt text**  | Pictures, icons and 360° images with no alt text; buttons and other clickable objects with no words or alt text, which screen readers can only call by their object name |
| **Tab order** | Objects on the same slide a learner cannot tell apart (they read the same); objects off the slide that Tab still reaches; objects your own Tab order leaves out          |
| **Contrast**  | Text without enough contrast with what is behind it                                                                                                                      |
| **Captions**  | Sound and video with no captions                                                                                                                                         |

**Show** beside a problem goes to the slide and selects the object, so you can fix it. When everything is fine, the tab says **No problems found.**

Shapes with no words or alt text are not listed: they are read as nothing, as decoration is, and most are backgrounds and panels.

## What learners get

Built into every course, with nothing to set:

- **Every object has a role and a name** for screen readers: buttons are buttons, pictures are images named by their alt text, tables are tables, sliders are sliders.
- **Everything works with the keyboard:** Tab to reach things, Enter or Space to press them, the arrow keys for sliders, radio buttons and 360° images, and keyboard dragging for drag-and-drop.
- **A clear focus outline** shows where the keyboard is.
- **"Skip to slide"** is the first stop, to jump past the player's controls.
- **Announcements:** screen readers are told when a layer appears, when feedback shows ("Correct", "Try again"), when a lightbox opens, and the new slide's title.
- **The player's accessibility panel:** **Text view** (the slide's text beside it, in reading order, which also suits learners who prefer reading), **Text size** up to 200%, the size of captions, and the course's keyboard shortcuts. A learner's settings are remembered for their next visit.
- **Less motion:** for learners whose computer asks for it, animations and transitions become fades and zooms cut. See [Timeline and animation](timeline-and-animation.md#animations).
- **The player's colours** meet contrast standards in every look; if your accent colour is too faint, courses use a stronger shade.

## Next

- [Translation](translation.md)
- [Preview and publish](preview-and-publish.md)
