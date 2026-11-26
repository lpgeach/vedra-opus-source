# macOS VM (WSM)

A headless macOS VM on this Windows host, for checking the app on macOS without
leaving Windows. It is a QEMU/WSM instance, not a second physical machine.

Read this before using the VM. It complements (does not replace) the normal
checks in [AGENTS.md](../AGENTS.md).

## When to use it

Use the VM when a change needs a real macOS x86_64 environment:

- A macOS-specific failure reported by Luke or seen in a CI log.
- Platform-specific behaviour: path casing, Electron/darwin packaging,
  native module installs, WebKit/Playwright on macOS.

This is supplementary. The standing rule in `docs/HANDOVER.md` is **Linux only
until December 2026**: Linux checks remain the baseline, and a work package is
not blocked because macOS or Windows is unverified. Say once in the log and PR
that the other systems were or were not checked. The private repository's
commits keep `[skip ci]`; CI runs on the public repository when a release's
source is published there, and covers macOS on GitHub's own runners.

Do not use it for everyday Windows work. Do not use it as a reason to open
an app window on Luke's desktop: the VM has no GUI session. Starting `wsm gui`
or running `npm run dev` with a visible window needs an explicit request.

## What it is

| | |
| --- | --- |
| Installer | WSM 0.1.0 in `%LOCALAPPDATA%\wsm` |
| Guest | macOS Tahoe 26.3, build 25D125, `x86_64` |
| SSH | alias `macos-vm` → `127.0.0.1:52128`, user `dev` |
| Resources | 4 GB RAM, 8 vCPU, 256 GB virtual disk |
| Toolchain | Node v26.13.1, npm 11.20.0, git 2.56.1, Python 3.15.2 |
| Home | `/Volumes/WSMData/Users/dev` |

The base is the **lite** image. It boots quickly and has the tools above, but
has **no Xcode Command Line Tools, no `clang`, and no Homebrew**. Native modules
that compile from source will fail until a compiler is added.

Windows Defender has exclusions for `%LOCALAPPDATA%\wsm` and
`C:\Users\lukeg\macOS-VM` because it falsely flagged `wsm.exe`. Leave them in
place or the VM executable will be quarantined again.

## Commands (run from PowerShell on Windows)

```powershell
$wsm = "$env:LOCALAPPDATA\wsm\wsm.exe"

& $wsm start              # resume from saved state (~3 s), or cold boot
& $wsm status             # look for "state": "running" and "ssh_ready": true
& $wsm stop               # suspend to file; work survives a reboot
& $wsm list
```

Shell access:

```powershell
ssh macos-vm "sw_vers -productVersion; node --version; npm --version"
```

VS Code (Remote-SSH extension is installed):

```powershell
code -n --remote ssh-remote+macos-vm /Volumes/WSMData/Users/dev
```

Or in VS Code: **Remote-SSH: Connect to Host...** → `macos-vm`.

## Getting this repo into the guest

The repo is private and the VM has no GitHub credentials. Do not try to clone
it in the VM. Pick one of these instead.

### Option A — share the Windows folder (best for reading/editing)

```powershell
& $wsm share "C:\Users\lukeg\Repositories\project-eloquent" --as project-eloquent
ssh macos-vm "ls ~/win/project-eloquent"
```

Open VS Code at `~/win/project-eloquent`. This is WebDAV over
`10.0.2.2`, so it is convenient but slower than a local guest filesystem.
Do not run `npm install` or the test suite through the share.

### Option B — native guest copy (best for running checks)

Copy a tarball from Windows, excluding generated/platform-specific files, and
install dependencies natively in the guest:

```powershell
# From WSL (the repo is at /mnt/c/Users/lukeg/Repositories):
wsl -d Ubuntu -- bash -lc "cd /mnt/c/Users/lukeg/Repositories && tar --exclude=project-eloquent/node_modules --exclude=project-eloquent/vendor --exclude=project-eloquent/test-results -czf /mnt/c/Users/lukeg/macOS-VM/project-eloquent.tar.gz project-eloquent"

scp -O "C:\Users\lukeg\macOS-VM\project-eloquent.tar.gz" macos-vm:/tmp/project.tar.gz
ssh macos-vm "mkdir -p ~/Projects && tar -xzf /tmp/project.tar.gz -C ~/Projects"
ssh macos-vm "cd ~/Projects/project-eloquent && npm install"
```

Use lowercase `-O` for `scp`. It forces the legacy SCP-over-exec protocol,
which works here. The guest has **no SFTP subsystem**, so plain `scp`/`sftp`
and `wsm cp` fail with `subsystem request failed on channel 0`. VS Code
Remote-SSH is unaffected because it bootstraps over the exec channel.

The copy includes `.git`, so `git status`, `git log`, and `git diff` work in the
guest. Pushing from the guest needs credentials; do commits/pushes on Windows.

## Running checks in the guest

Run the same commands as `AGENTS.md`, from the native copy:

```powershell
ssh macos-vm "cd ~/Projects/project-eloquent && npm install"
ssh macos-vm "cd ~/Projects/project-eloquent && npm run typecheck && npm run lint && npm test"
ssh macos-vm "cd ~/Projects/project-eloquent && npm run format:check"
```

For the Electron app's Playwright suite, browsers must be installed in the
guest first (`npx playwright install chromium webkit`). The guest has no
passwordless `sudo`, so OS-level dependency installs are not available. The VM
is headless; a GUI-dependent Electron launch is not expected to work without a
display session. Report what actually ran — if a suite is skipped because of
the headless environment, say so in the session log.

`npm run dev` opens an Electron window. Do not run it here unless Luke asks.
It will not appear on his Windows desktop, which is the point of the VM.

## Reporting

When a check is run in the VM, the session log should say:

- macOS version and architecture (`sw_vers -productVersion`, `uname -m`).
- The exact command and its result.
- Whether browsers/dependencies were installed in the guest.
- Anything that could not be verified in the headless environment.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `ssh_ready: false` | `& $wsm start`, then `& $wsm status` |
| `subsystem request failed` | Use `scp -O`; SFTP is unavailable in the lite base |
| `wsm.exe` missing | Defender quarantined it. Confirm exclusions, re-extract `wsm-setup.zip` in `C:\Users\lukeg\macOS-VM`, run `install.ps1` |
| QEMU fails to start | Reboot after enabling `HypervisorPlatform`; confirm `wsm doctor` reports WHPX |
| Guest `git` asks for credentials | Don't authenticate in the VM; work with the copy on Windows and push there |

## The full image (`full`, GPU), session 85

Built from the installer with `wsm base build --iso "...\macOS Tahoe 26.3.iso" --clt`. It took about 2 hours with one interrupted run, resumed with `--resume-install` and finished with `--from-stage 3`. The result is `base-tahoe-26.3-141175a2823e.qcow2` (17.9 GB) and an instance named `full`:

```powershell
& $wsm create --gpu -n full --ram 4096 --vcpus 8   # GPU instances are capped at 4096 MiB
& $wsm start -n full
& $wsm gui stop -n full                            # at once: see the warning below
```

- **Warning: a GPU instance shows a "Reims vGPU" window on Luke's desktop when it cold-boots.** It did in session 85, for about two minutes. Run `wsm gui stop -n full` straight after every `wsm start -n full`, which hides it and keeps the session. GPU instances cannot suspend, so every start is a cold boot.
- It has macOS 26.3 (25D125, x86_64), the Command Line Tools (`clang`, `git`, `python3`) and 45 GB free. It has no Node. Copy `node-v26.13.1-darwin-x64.tar.xz` in, and unpack it to `~/node`.
- `wsm cp -n full <file> :/path` works with this image. Run wsm from PowerShell: Git Bash turns `/bin/sh` into a Windows path. Copy scripts in as files: long `wsm exec ... -c "..."` arguments are cut short.
- `npm ci` and `node node_modules/electron/install.js` work. Electron 45.3.2 and the Playwright browsers install.

**What runs from an SSH session (results at `b049dce`):**

- typecheck, lint, format: pass.
- `npm test`: 1024 passed, 10 skipped (ffmpeg and espeak).
- Both builds: pass.
- **Player suite:** Chromium 108 passed and Firefox 107 passed. They failed the three video tests (no macOS ffmpeg build), and Firefox's `audio.spec.ts:149` (the known flake).
- **LMS:** Chromium and Firefox passed.

**What does not run yet:**

- **The Electron e2e,** and every **WebKit** test (player, LMS, visual). From SSH, macOS gives a background session with no WindowServer: Electron and WebKit wait for it (Electron logs `Connection interrupted` for `ClientCallsAuxiliary`). The console session is `root`: nobody is logged in to the desktop.
- `wsm gui prewarm` (logging in the hidden desktop session) might make them run. It was not tried, because it may show a window: that is Luke's call.
