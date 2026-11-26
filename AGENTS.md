# Agent Guide — Project Vedra Opus

Vedra Opus is an Electron desktop eLearning authoring tool (Linux, macOS, Windows) being built to match Articulate Storyline's capabilities. You are picking up work part-way through. This file tells you how to get oriented and what the rules are.

## Start of every session

0. If `docs/HANDOVER.md` exists, read it first: the standing instructions and where the work stopped, written for picking the work up on another computer.
1. Read `skills/project-specific.md` — current state and known pitfalls. Short; read all of it.
2. Read the most recent file in `logs/`. It says what the last session did, what is unfinished, and what to do next. **If a work package is part-done, the log's "Where this stopped" section is your starting point, and you continue on that package's existing branch.**
3. Otherwise, open `docs/PLAN.md` section 8 and find the first work package with an unticked box whose dependencies are ticked. That is your task. **If that package starts a new phase and the previous phase has not been reviewed yet (no `logs/*` "review of Phase n"), review that phase first**, as `skills/project-specific.md` ("End of a phase") describes. Read sections 1, 3, 4 and 5 of the plan the first time you work here.
4. Check `docs/briefs/` for a brief named after your work package (for example `P1.2-commands-and-undo.md`). If one exists, follow it; it resolves design questions the plan leaves open. If none exists, write one before the code.
5. Run `git status` and `git branch --show-current`, and `gh pr list` to see which branches are still waiting to be merged.
6. Run the checks before changing anything, so you know the starting point is green:

```bash
npm install
npm run typecheck && npm run lint && npm test
env -u ELECTRON_RUN_AS_NODE npm run e2e
```

For an optional macOS spot-check, use the headless VM described in `skills/macos-vm.md` and record the macOS version and exactly what ran in the session log. Linux stays the verification baseline until December 2026 (`docs/HANDOVER.md`).

## Rules

- **One work package per branch**, named `wp/<id>-<slug>` (e.g. `wp/p1.2-commands`), branched from `master` once the previous package is merged, or from the previous `wp/` branch if it is not.
- **Do only your work package.** Do not start later packages or add features the package does not ask for. Extension points are fine; half-built features are not.
- **Tests are part of the package.** Each package's "Done when" line in the plan names what must be proven. Write those tests.
- **Never weaken a check to make it pass.** Do not delete or skip a failing test, loosen a lint rule, add `any`, or add `// @ts-ignore` to get green. Fix the cause. If a test is wrong, say why in the session log.
- **Package boundaries are fixed:** `model ← engine ← render ← player ← publish ← apps/desktop`. `model` and `engine` must not import React, Node, Electron or DOM APIs. Lint and the TypeScript configs enforce this; do not work around them.
- **The renderer has no Node access.** Anything touching disk or the OS goes through the IPC contract in `apps/desktop/src/shared/ipc.ts` (see `docs/development.md`, "Adding an IPC call").
- **Changing the saved project format** (`packages/model/src/schema.ts`) requires a version bump, a migration and a legacy fixture. See `skills/model-package.md`.
- **Check installed versions before writing config or using an API.** This repo uses recent major versions (Vite 8, ESLint 10, Zod 4, React 19, electron-vite 6) that differ from older documentation. Read the package's own types in `node_modules` when unsure.
- **Stop and ask Luke** before: changing the trigger/runtime rules in plan section 5, changing package boundaries, adding a native Node module, bundling third-party binaries, or anything that sends data off the machine.
- **No AI attribution, anywhere.** No `Co-Authored-By` trailers, no "generated with" lines, in commits, pull requests, files or the app. Luke had four commits rewritten to remove them.
- **Do not put windows on Luke's desktop.** `npm run e2e` already runs without visible windows on Linux. Do not run `npm run dev` or open the app yourself unless Luke asks; if you must, use another workspace (`skills/project-specific.md` #6a). The headless macOS VM in `skills/macos-vm.md` is for macOS checks; never start its GUI session or launch the app there without an explicit request.
- **Names must not echo the product we are matching.** Nothing called "Story…" (`skills/project-specific.md` #18).
- **Two repositories** (Luke, 2026-11-26). Work happens in the private `lpgeach/project-eloquent` (git remote `origin`). The public `lpgeach/vedra-opus-source` (remote `public`, GPL-3.0-or-later) holds only the source of the latest release, and is updated only when Luke asks for a new release build (`docs/releasing.md`, "Publishing the source"). Never push to `public` otherwise.
- **Everything here may be published with a release.** Never name a client's course or quote its content (slide text, file names, variables) in code, tests, briefs, logs or commits: call sample courses "Sample A", "Sample B" and so on. Sample files stay in the ignored `samples/` folder.
- **Do not copy from Articulate.** No names, icons, artwork, templates, or help text. We match capabilities, with our own design.
- **Importing `.story` files** (Luke, 2026-11-24: B5) is the one exception to the last two rules.
  - It reads courses authors made, so they can move them here. It is clean-room: it studies the files only, never Storyline's program.
  - The importer may name its source plainly ("Import Articulate Storyline Course…", `import/storyline/`).
  - No Articulate content is committed: test files are made by our own code.
  - Nothing writes `.story` files.

## Definition of done

A work package is done when all of these are true:

- [ ] Every check in its "Done when" line is covered by a test that passes.
- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` and `npm run e2e` pass locally.
- [ ] If you touched `packages/render`: `npm run test:visual` passes (see `docs/development.md`, "Visual tests").
- [ ] CI is green on Linux, macOS and Windows for the branch (`gh run list --branch <branch>`).
- [ ] Its box is ticked in `docs/PLAN.md`.
- [ ] `skills/project-specific.md` is updated: the "Current State" section, plus any new pitfall you hit.
- [ ] A session log exists at `logs/YYYY-MM-DD-session-N.md` saying what was done, what was verified and how, what was **not** verified, and what is next.

If you cannot finish, leave the box unticked and write exactly where you stopped in the session log.

## Reporting honestly

Say what you ran and what happened. "Tests pass" means you ran them and saw them pass in this session. If something is untested, unverified on another OS, or skipped, say so plainly in the log and in your final message.

## Where things are

| Need                                          | Look in                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| What to build, in what order, and why         | `docs/PLAN.md`                                                                       |
| Design details for the next packages          | `docs/briefs/`                                                                       |
| Setup, commands, how the app is put together  | `docs/development.md`, `README.md`                                                   |
| Pitfalls and current state                    | `skills/project-specific.md`                                                         |
| How the project model package works           | `skills/model-package.md`                                                            |
| Branching and commits                         | `skills/git-workflow.md`                                                             |
| Headless macOS VM (cross-platform checks)     | `skills/macos-vm.md`                                                                 |
| SCORM / xAPI background (Phase 5)             | `skills/scorm-xapi.md`                                                               |
| Third-party files we ship, and their licences | `docs/licences.md`                                                                   |
| How courses talk to an LMS (drivers, codec)   | `docs/briefs/P5.2-scorm-12.md`, `P5.3-scorm-2004.md`, `P5.4-xapi.md`, `P5.5-cmi5.md` |
| The JavaScript API courses can use            | `docs/player-api.md`                                                                 |
| History of past sessions                      | `logs/`                                                                              |
