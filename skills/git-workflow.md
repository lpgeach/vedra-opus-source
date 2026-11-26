# Git Workflow

## Branches
- `master` is the main branch. Keep it green.
- Each work package from `docs/PLAN.md` gets its own branch: `wp/<id>-<slug>`, for example `wp/p1.2-commands`.
- Branch from `master`. If the previous package is not merged yet and you depend on it, branch from its `wp/` branch and say so in the session log.

## Commits
- One logical change per commit, with a message that says what changed and why.
- Imperative subject line under ~70 characters, blank line, then detail if needed.
- Never commit `node_modules/`, `out/`, `release/`, `test-results/` or `playwright-report/` (all ignored).
- Do not rewrite history on branches that are pushed.

## CI
- CI runs on every push to `master` and to `wp/**` branches, and on pull requests.
- Check it: `gh run list --branch <branch>`; read a failure: `gh run view <id> --log-failed`.
- A work package is not done until CI is green on Linux, macOS and Windows.

## Merging
- Open a pull request from the `wp/` branch into `master`. Luke merges.
- Do not push directly to `master`.
