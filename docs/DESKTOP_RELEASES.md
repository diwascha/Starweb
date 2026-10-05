# Desktop app releases and updates

The desktop app (Tauri) updates itself from GitHub Releases. Nothing checks
automatically: users click the **Check for updates** icon (sidebar footer,
desktop app only), and if a newer version exists they click **Install update**.

## Publishing a new version

1. Bump `"version"` in `package.json` (e.g. `0.1.0` -> `0.2.0`). The desktop
   app takes its version from there.
2. Commit, then tag and push:
   `git tag v0.2.0 && git push origin v0.2.0`
3. GitHub Actions ("Desktop release") builds the Windows installer, signs the
   update and publishes Release `v0.2.0` with `latest.json` (~10-15 min).
4. Users click **Check for updates** -> **Install update**.

The web app (Vercel) is unaffected; it updates on every push to `main`.

## One-time setup

GitHub -> repository **Settings -> Secrets and variables -> Actions -> New
repository secret**:

| Name | Value |
|---|---|
| `TAURI_PRIVATE_KEY` | contents of `starsutra-updater.key` |
| `TAURI_KEY_PASSWORD` | the key's password |

The matching public key is in `src-tauri/tauri.conf.json` (`updater.pubkey`);
the app only installs updates signed with the private key.

**Keep a safe copy of the private key and password.** If they are lost,
installed apps cannot verify new updates and everyone must reinstall once by
hand with an app built from a new key.

## First install

Apps built before this setup have no updater. Install once from the latest
Release (`StarSutra_x.y.z_x64-setup.exe`); from then on, updates come from
inside the app. Windows SmartScreen may warn on that first install because
the installer is not code-signed with a paid certificate - choose
"More info -> Run anyway".
