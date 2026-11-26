# Releasing: signing, notarisation and updates

How a release of Vedra Opus is signed (P11.4; `docs/briefs/P11.4-signing-and-updates.md`). The wiring is in place; a release needs only the certificates and accounts below, given through environment variables when packaging. Nothing secret is kept in the repository.

Until real certificates are added, builds are unsigned. Windows and macOS warn about such installers ("unknown publisher", "cannot be opened").

## Windows: a code-signing certificate

**What:** a code-signing certificate from a certificate authority, as a `.pfx` file with its password.

- An OV certificate works.
- An EV certificate (on a hardware token or a cloud signing service) earns SmartScreen's trust sooner.
- Cloud signing services need electron-builder's `azureSignOptions` or a custom `sign` script instead of the two variables; see electron-builder's code-signing guide.

**Set, when packaging on Windows:**

| Variable           | Value                                                |
| ------------------ | ---------------------------------------------------- |
| `CSC_LINK`         | The path to the `.pfx` file (or its base64 content). |
| `CSC_KEY_PASSWORD` | Its password.                                        |

**Then:** `npm run package`.

- electron-builder signs every executable in the package with SHA-256: the app's, and the bundled ffmpeg's and LibreOffice's.
- It then signs the installer.
- Each signature is timestamped by `timestamp.digicert.com`, so it stays valid after the certificate expires.

**Check:** right-click the installer → Properties → Digital Signatures, or `Get-AuthenticodeSignature "Vedra Opus-<version>-x64.exe"` (Status `Valid`).

**Without a real certificate:** `npm run check:signing` (`scripts/check-signing.mjs`) proves the wiring.

- It makes a throwaway certificate, packages the app with it offline (`ELECTRON_BUILDER_OFFLINE=true`, so no timestamp server is contacted), and checks the app is signed by it.
- The status is `UnknownError` because Windows does not trust a self-made certificate; the signer's name is what the check looks at.

## macOS: Developer ID and notarisation

**What:**

- an Apple Developer Program membership;
- a "Developer ID Application" certificate (exported from Keychain as a `.p12` with a password);
- an App Store Connect API key for notarisation (a `.p8` file, its key id, and the issuer id).

**Set, when packaging on a Mac:**

| Variable           | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| `CSC_LINK`         | The `.p12` file (or leave unset and have the certificate in the keychain). |
| `CSC_KEY_PASSWORD` | Its password.                                                              |
| `APPLE_API_KEY`    | The path to the `.p8` key.                                                 |
| `APPLE_API_KEY_ID` | Its key id.                                                                |
| `APPLE_API_ISSUER` | The issuer id.                                                             |

**Then:**

- `npm run package` signs the app with the hardened runtime and the entitlements in `apps/desktop/signing/entitlements.mac.plist`:
  - JIT for the JavaScript engine;
  - the microphone for narration;
  - library validation off, for the bundled tools.
- It sends the app to Apple to be notarised, and staples the ticket.
- Without the `APPLE_API_*` variables, notarisation is skipped and the app is only signed.

**Check:** `codesign --verify --deep --strict --verbose=2 "Vedra Opus.app"` and `spctl --assess --type execute --verbose "Vedra Opus.app"` ("accepted, source=Notarized Developer ID").

### Without a Developer ID: both Macs, ad-hoc signed (alpha 4)

The VM in `skills/macos-vm.md` (the `full` instance) is an Intel Mac. It builds both macOS installers:

1. `node scripts/fetch-ffmpeg.mjs` and `node scripts/fetch-libreoffice.mjs` for Intel.
2. The same with `VEDRAOPUS_TARGET_ARCH=arm64` for Apple Silicon.
   - ffmpeg, its libraries and `vo-decode` are cross-compiled; LibreOffice's arm64 build is fetched.
   - They cannot run on the Intel Mac, so they are checked by architecture (`lipo -archs`) and what they link (`otool -L`). LibreOffice's smoke deck is not drawn.
3. `npx electron-builder --config electron-builder.yml --mac --x64 --arm64 --publish never -c.mac.identity=-` in `apps/desktop`, after `npm run build`.

**`-c.mac.identity=-` signs both apps ad hoc,** with the hardened runtime and the entitlements.

- Without it, the Intel app is unsigned, and the Apple Silicon app keeps Electron's own ad-hoc signature, broken by packaging ("code has no resources but signature indicates they must be present").
- Apple Silicon refuses to run code without a valid signature, so that app would be "damaged".
- Check with `codesign --verify --deep --strict "Vedra Opus.app"`.
- Pass it on the command line only: in `electron-builder.yml` it would stop a real Developer ID from being used.

People still see Gatekeeper's warning for an app that is not notarised: they open it with **System Settings → Privacy & Security → Open Anyway**.

## Linux

AppImage and deb packages are not signed; this is usual for both. Updates to the AppImage come through the updater (P11.4 part B).

## Publishing the source (Luke, 2026-11-26)

Work happens in the private `lpgeach/project-eloquent` (git remote `origin`). The public `lpgeach/vedra-opus-source` (remote `public`, GPL-3.0-or-later) holds **only the source of the latest release**. It is updated only when Luke asks for a new release build, never as work goes on.

For a release:

1. **Check nothing private is in the tree:** no client course names or content, no personal email, no keys. For example: `git grep -I -n -i -E "<client names>|@gmail|PRIVATE KEY" -- . ':!package-lock.json'`, and `git ls-files | grep -E "\.(story|pfx|p12|pem|env)$"`. Fix anything found in the private repository first.
2. **Publish the tree as one commit** on the public repository's `master`, titled `Vedra Opus <version>`, with no private history:

   ```bash
   git fetch public
   git checkout -B public-release public/master
   git rm -rq . && git checkout master -- .
   git commit -m "Vedra Opus <version>"
   git push public public-release:master
   ```

   The commit's author is Luke's GitHub noreply address (`git config user.email`).

3. **CI runs there**, on Linux, macOS and Windows. The release's installers are built from that commit, and signed there once code signing is set up.
4. **Tag it** `v<version>` on the public repository, so each release's source can be found again.

## Where people download it

**The public downloads repository** (Luke, 2026-11-24) is `lpgeach/vedra-opus-releases`: https://github.com/lpgeach/vedra-opus-releases. This repository is private, so that is the one to send people. It holds a README with download steps and no code.

Each release is published there: the installers' (`v…`) and the third-party sources' (`sources-…`). The sources must be public wherever the installers are: they are how the LGPL and MPL source offer is kept (see "The source code we offer" below).

**From alpha 4 the app points there too** (Luke, 2026-11-25): the update feed (`publish` in `apps/desktop/electron-builder.yml`), `PUBLIC_REPOSITORY` and `RELEASES_URL` in `apps/desktop/src/main/third-party.ts` (Help → Project Repository, the notices' source link, the updater's releases link). Alpha 3 and earlier still point at this private repository, so they cannot see new versions: people get alpha 4 by downloading it.

## Updates

The update feed is the public `vedra-opus-releases` repository's GitHub releases (`publish` in `apps/desktop/electron-builder.yml`), from alpha 4.

**To publish a release:**

- Set `GH_TOKEN` (a token that can write releases), and run `npx electron-builder --config electron-builder.yml --publish always` in `apps/desktop` after `npm run build`.
- It uploads the installers and `latest.yml`, `latest-mac.yml` and `latest-linux.yml`, which installed copies read.
- **Windows:** from alpha 4 the release carries `latest.yml` and the installer's `.blockmap` beside it, so installed copies can update.
- **macOS:** updates in place need a `.zip` beside the `.dmg` (electron-updater installs from it) and a real Developer ID signature (macOS will not replace an app with an ad-hoc one). Until then the macOS release carries only its two `.dmg`s, without `latest-mac.yml`, and macOS users update by downloading. Help → Check for Updates on macOS reports that it cannot find an update.
- Publish a release marked "pre-release" for the Beta channel.

**In the app** (Help menu), updates are checked only when the author chooses Check for Updates…, or once they tick Check for Updates Automatically (at start, then daily).

- Windows, macOS and the AppImage update in place.
- A deb install is pointed to the releases page.

## The source code we offer (ffmpeg and LibreOffice)

The app's Help → Third-Party Notices… promises that the complete source of the ffmpeg and LibreOffice it ships, exactly as built for that version, is published with each release and kept there for at least three years (`docs/licences.md`; `docs/briefs/R2-notices-and-sources.md`). For every release:

1. Run `npm run collect:sources`. It downloads, and checks against their SHA-256:
   - the seven archives `scripts/build-ffmpeg.sh` builds ffmpeg from, with a copy of the script;
   - The Document Foundation's source archive for the LibreOffice version `scripts/fetch-libreoffice.mjs` fetches.
     It writes them to `release-sources/`, with a `README.txt` saying what each is. Archives already there and matching are kept, so a second run downloads nothing.
2. Publish every file in `release-sources/` (`ffmpeg/*`, `libreoffice/*`, `README.txt`) as a release of its own on the same Releases page: tag `sources-<version>`, titled "Third-party source for Vedra Opus <version>". Then the app's release holds only its installers, one file per system to download (Luke, 2026-11-24). The app's notice points at the Releases page as a whole (`RELEASES_URL`), so the offer holds. The tag must not start with `v`: electron-updater would read `v<version>-sources` as a newer version with no `latest.yml`.
3. **Do not delete a release, or its source files, within three years of publishing it.** The LGPL's offer (for ffmpeg) runs for three years from the last time that version was distributed.

If LibreOffice's version changes in `fetch-libreoffice.mjs`, change `LIBREOFFICE_SOURCE` in `collect-sources.mjs` with it (its file name and The Document Foundation's published SHA-256). A unit test fails until they agree.
