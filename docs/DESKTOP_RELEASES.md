# Desktop app releases and updates

The desktop app (Tauri) updates itself from GitHub Releases. Nothing checks
automatically: users click the **Check for updates** icon (sidebar footer,
desktop app only), and if a newer version exists they click **Install update**.

## Publishing a new version

1. Merge the changes to `main`. That is all: the website updates on its own,
   and the **Desktop release** workflow starts automatically (pushes that only
   touch docs are skipped). It can also be started by hand from GitHub ->
   **Actions -> Desktop release -> Run workflow**.
2. No version to edit: each release is numbered automatically as the latest
   `v1.0.N` release plus one (1.0.1, 1.0.2, ...).
3. It builds the Windows installer, signs the update and publishes Release
   `v1.0.N` with `latest.json` (~15-20 min).
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

## What a PC needs

Nothing to pre-install. Windows 11 (and updated Windows 10) already has the
WebView2 runtime; if it is missing, the installer downloads it. The C runtime
is linked into the app (src-tauri/.cargo/config.toml). Installs and updates
are per-user, so no administrator rights are needed. Internet is required to
check for and download updates.

## First install

Apps built before this setup have no updater. Install once from the latest
Release (`StarSutra_x.y.z_x64-setup.exe`); from then on, updates come from
inside the app. Windows SmartScreen may warn on that first install because
the installer is not code-signed with a paid certificate - choose
"More info -> Run anyway".
