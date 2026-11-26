# The Model Package (`packages/model`)

Everything about what a project *is*: the saved format, validation, migrations, and (from P1.2) the commands that edit it. Pure TypeScript — no DOM, React, Node or Electron.

## Files

| File | Holds |
|---|---|
| `schema.ts` | The Zod schema for `project.json` and the TypeScript types inferred from it. `FORMAT_VERSION` lives here. |
| `factory.ts` | `createEmptyProject`, `createScene`, `createSlide`, `createLayer`, object factories (`createShapeObject`, `createImageObject`, `createButtonObject`, `createTextObject`, `createGroupObject`), `plainRichText`, defaults. |
| `shapes.ts` | Ready-made shapes (diamond, star, callout, …) as `polygon` geometry. Adding one never changes the saved format. |
| `ids.ts` | `createId(prefix)` → `slide_k3x9…`. |
| `migrations.ts` | `migrateToCurrent(raw)`: upgrades any older format to the current one. |
| `validate.ts` | `parseProject(raw)` (migrate → schema → reference checks) and `serializeProject`. |
| `traverse.ts` | `allSlides`, `slideLayers`, `forEachObject` (walks into groups). |
| `find.ts` | Lookups by id (`findScene`, `findSlide`, `findLayer`, `findObject`), id collection, and `triggerReferences`. |
| `commands/` | One handler per command; `types.ts` holds `CommandMap` (every command and its payload). |
| `history.ts` | `createHistory(project)`: `execute`, `undo`, `redo`, gestures, `subscribe`. |
| `errors.ts` | `ProjectValidationError` with `issues: { path, message }[]`. |

## Things that are true by design

- **Strict objects.** Unknown keys are an error. A load/save round trip never drops data.
- **Ids are unique across the whole project**, so a reference is just an id. The exception is state ids (`normal`, `hover`, …), which are names local to one object.
- **Every object has a `normal` state** and its `initialState` names one of its states.
- **Array order is meaning:** `layer.objects` is z-order back to front; `scene.slides` is course order; `slide.triggers` is evaluation order.
- **Triggers reference only their own slide's objects and layers**, plus project variables and any slide (for jumps).
- **Group children's frames are in stage units**, not relative to the group.
- **Assets are referenced by SHA-256 hash** and must have an entry in `project.assets`.
- **A slide has at most one role** (Phase 7): a question, a draw, or a result. Questions' parts are objects on their own slide's base layer; feedback parts are their own slide's overlays.
- **Question banks hold question slides only**, outside the course. `allSlides` is the course (scenes, in order); `everySlide` adds the banks' slides. Jumps, branches and results name scene slides only; draws name a bank and that bank's slides.
- **There is exactly one feedback master** (`kind: 'feedback'`), with one layout per result role; slides use slide masters' layouts only.
- **Tracking by a result names a graded result slide.** Removing it falls back to `{ kind: 'trigger' }`; removing any slide clears what named it (branches, results' chosen slides, draws' locks).
- **The player's menu entries name scene slides only** (Phase 8), and only those the author changed; removing a slide drops its entry. The player's logo is an image asset.
- **The player's tabs claim ids like everything else.** A resource file names an asset; a link is http, https or mailto; a `playerTab` trigger names a custom tab, and removing the tab removes its triggers.
- **The player's words are only what the author changed**, by language tag; anything else is `DEFAULT_LABELS`. Presets never carry course content (menu entries, tabs, the logo).
- **A slide moved from a scene into a bank leaves the course:** whatever named it as a course slide (other slides' jumps and lightboxes, branches, results, menu entries, tabs) is cleared, as for removal.
- **A bound data-entry field's variable exists and is of its type** (text, or number for a numeric field). Removing a variable or changing its type unbinds fields that no longer match.
- **A group's members have their own timing and animations** (B8, format 36). A member is on stage while its group is and its own time is; it can have an entrance, an exit and motion paths. Grouping and ungrouping keep them. Members of projects older than format 36 were migrated to span the whole timeline, which is how they played then.
- **Drag-and-drop and retry options** (B11, format 37): `freeDrag.onePerTarget` and `dropStatesAfterSubmit`, and `result.retryIncorrectOnly`. All `false` in older projects, which is how they behaved.
- **Comparisons ignoring case** (B12, format 38): a variable condition's `==i` and `!=i` compare as text, ignoring case. Additive: a v37 file is valid as it is.
- **Path shapes** (B13, format 39): `geometry.kind: 'path'`, a list of outlines (`d`: absolute `M`/`L`/`C`/`Z` only, in the 0–1 box; `fill`, `stroke`). `path-data.ts` reads and writes them. Additive: a v38 file is valid as it is.
- **Dials drawn their own way** (B16, format 40): `DialObject.props.look` (pointer path data, pivot, `from`/`to` degrees, a face picture) or null for ours. A face is an asset of the dial (`assetsOfObject`).
- **Only an object at the top of a layer can be dragged** (`drag`, P9.7). `object.update` refuses `drag` inside a group, and grouping clears it, as for animations. The drag and intersection events name objects on the slide; removing an object removes the triggers that name it as a target or other.
- **A graphic's drawing can only describe shapes** (P9.8): fixed elements, fixed attributes, each value by pattern, paints by name or hex. Never widen `graphicAttrsSchema` to `style`, `href` or event attributes; a project file is untrusted input that render writes into the page.
- **A 360° image's spots have project-unique ids** (P9.10), and `spotClicked` names one of the image's own. Removing a spot removes the triggers that wait for it.
- **Every table row has one cell per column** (P9.9). Change a table's grid only through the helpers in `table.ts`, which keep it so.
- **A slide's Tab order names only its own objects, each once** (`properties.focusOrder`, P10.1). Removing an object, ungrouping or removing a layer prunes it (`pruneFocusOrder`); `null` means the layout's order, and `tabOrder` puts anything unlisted after the list.
- **Translating changes words only** (`project.translate`, P10.3): never ids, structure, marks or paragraph settings. A unit's id is a path to its text (`object/<id>/text/2.0.0`), so a translation file names the same place in any copy of the project; a unit whose source has changed since export is skipped.
- **Imported slides are copies with new ids throughout** (`prepareSlideImport`, `slides.import`, P11.2). Every reference inside the copies is remapped to the copies; one to a slide that did not come is dropped and listed for the author. The copies bring the masters, variables (renamed on a name clash), question banks and media they use that the project lacks. `slides.import` refuses an id already in use or a variable name already taken, so the project stays valid whatever is imported; it is one undo step.
- **A lightbox is a scene slide that is not a draw.** A slide that opens as a lightbox cannot become a draw; removing it removes the triggers that open it and frees a tab that opened it.
- `parseProject` is the only way untrusted data becomes a `Project`. Anything read from disk goes through it.

## Editing a project: commands and history

Nothing outside this package changes a project directly. All edits go through a `History`:

```ts
const history = createHistory(project);
history.execute('object.update', { objectId, changes: { frame: { x: 40 } } });
history.undo();
```

- `history.project` is deeply frozen and replaced after every change. Holding an old one is safe; mutating any of them throws.
- A command that cannot be applied throws `CommandError` and changes nothing.
- A drag is a gesture: `beginGesture(label)` → many `execute` calls (each visible immediately) → `commitGesture()` makes them one undo step; `cancelGesture()` puts everything back. `undo()` during a gesture cancels it and stops there.
- `subscribe` delivers `{ project, patches, source }` for every change; autosave and the UI store hang off this.
- Removing a slide, scene or object also removes every trigger that referred to it (`triggerReferences` in `find.ts`), so the project never holds a dangling reference. Undo restores both.
- Insert indexes past the end are an error, not clamped.

### Adding a command

1. Add its name and payload to `CommandMap` in `commands/types.ts`. Payloads use ids, not array positions.
2. Write the handler in the matching file under `commands/` (or a new file, added to `registry.ts`). It mutates the Immer draft. Use `requireScene` / `requireSlide` / `requireObject` from `commands/util.ts` so unknown ids throw `CommandError`.
3. If it inserts content supplied by the caller, call `assertValid(schema, value, 'thing')` and `assertIdsAreNew(draft, ids)`. If it removes anything that triggers can refer to, remove those triggers too.
4. Test it in `history.test.ts` using `createHistory(project, { validate: true })`, which re-validates the whole project after every command and fails loudly if a handler produced an invalid one. Test the rejection paths and that undo restores the exact previous project.
5. Add a step for it to the property test at the bottom of `history.test.ts`, so it is covered by the random undo/redo check.

## Adding a new object type

1. Add `<name>ObjectSchema` in `schema.ts` using `...objectBase`, with `type: z.literal('<name>')` and a `props` object.
2. Add it to the `SceneObject` type union **and** the `sceneObjectSchema` union.
3. If it references assets, layers or variables, add the checks to `findReferenceIssues` in `validate.ts`.
4. Add it to a fixture and add tests.
5. This changes the saved format — follow the next section.

## Changing the saved format

Any change to what `project.json` can contain — a new field, a renamed field, a new object type, a new trigger action:

1. Bump `FORMAT_VERSION` in `schema.ts`.
2. Add `migrations[<old version>]` in `migrations.ts`. It receives untyped data and returns the next version's shape. For a purely additive change it fills in the new field's default (or returns the document unchanged if nothing needs filling). Never edit an existing migration.
3. Copy a current fixture into `fixtures/legacy/v<old>-<name>/` **before** updating fixtures, so the old shape is frozen. Never edit files under `fixtures/legacy/`.
4. Update `fixtures/projects/*` to the new shape.
5. `npm test` — `fixtures/fixtures.test.ts` checks that every legacy fixture still loads and every current fixture round-trips.

## Zod 4 notes

- Use `z.strictObject`, not `z.object`.
- Recursive schemas (`sceneObjectSchema`, `richTextNodeSchema`) are declared with `z.lazy` and an explicit `z.ZodType<T>` annotation, with the TypeScript type written by hand. Keep the hand-written type and the schema in step.
- Issue paths are arrays of keys; `formatPath` turns them into `scenes[0].slides[1].id`.
