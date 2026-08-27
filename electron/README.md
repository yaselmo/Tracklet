# Tracklet Electron Wrapper

This folder contains the Electron shell for Tracklet Desktop. Development still uses the repository’s Django and Vite processes; the packaged Windows app bundles its own portable Python runtime, Django backend, and production frontend.

## Development

Install dependencies in this folder:

```bash
cd electron
npm install
```

Run the existing backend and frontend dev servers, then start Electron:

```bash
npm run dev
```

On Windows, the simplest full desktop-mode launch command from the repo root is:

```powershell
powershell -ExecutionPolicy Bypass -File .\contrib\windows\start-desktop.ps1
```

If the backend and frontend dev servers are already running, you can launch only Electron with:

```powershell
powershell -ExecutionPolicy Bypass -File .\contrib\windows\start-electron.ps1
```

Environment variables:

- `ELECTRON_RENDERER_URL`: frontend URL to load in development. Defaults to `http://127.0.0.1:5173/web/`
- `ELECTRON_API_URL`: API base URL injected into the renderer. In development, prefer the Vite origin such as `http://127.0.0.1:5173` so `/api` and `/auth` stay same-origin and use the dev proxy cleanly
- `ELECTRON_FRONTEND_BUILD_DIR`: optional override for the built frontend directory in packaged mode
- `TRACKLET_ELECTRON_USER_DATA_DIR`: optional override for Electron's own persistent user-data directory

Development frontend origin:

- The Electron development flow is pinned to `http://127.0.0.1:5173`
- This is configured in `src/frontend/vite.config.ts`
- The Windows launcher in `contrib/windows/start-frontend.ps1` also starts Vite with `--host 127.0.0.1 --port 5173 --strictPort`
- If port `5173` is busy, free that port instead of letting Vite choose a random fallback port, or Electron and Django CSRF checks can drift out of sync

Packaged desktop origin:

- The packaged Electron shell serves the frontend from `http://127.0.0.1:64740/web/`
- This port is configured in `electron/desktopServer.js`
- Override it only with `ELECTRON_DESKTOP_PORT` if you also update Django trusted origins to match

The packaged app does not use Vite or port `5173`; that port is development-only.

## Windows Installer

Generate the Windows installer from the `electron` folder:

```powershell
npm run dist:win
```

By default on Windows, the packaging script now uses this Electron Builder cache directory:

```text
C:\electron-builder-cache\tracklet-electron
```

If you need to override it for a specific machine, set `ELECTRON_BUILDER_CACHE` before running the command.

This command:

1. Extracts and compiles Lingui translations so packaged widgets use real labels
2. Builds the production frontend into `src/backend/Tracklet/web/static/web`
3. Stages a relocatable Python 3.11 x64 runtime from the build machine’s base Python installation (not its virtual-environment launcher), copies the runtime dependency closure, and copies the Django backend source
4. Packages the Electron app
5. Produces an NSIS Windows installer `.exe`

The build machine must have the existing Tracklet development environment and Python 3.11 x64 available. Set `TRACKLET_BUILD_PYTHON` to an explicit interpreter path if the environment is not at `env\Scripts\python.exe`. These are build-time requirements only; an installed user needs only the installer.

Installer output folder:

```text
electron/dist/
```

Installer filename pattern:

```text
Tracklet-Setup-<version>.exe
```

Example:

```text
electron/dist/Tracklet-Setup-0.7.0.exe
```

Installed app behavior:

- Uses the packaged production frontend assets
- Starts a small internal local server to serve the UI and proxy `/api` and `/auth`
- Starts the bundled Django backend with the private Python runtime at `http://127.0.0.1:8000` when no healthy Tracklet backend is already serving that address
- Runs first-use database initialization and only performs migration work when pending migrations are detected
- Never asks the user to locate a backend folder in packaged mode
- Uses the bundled backend for the packaged Create Superuser and backup helpers
- Uses the green Tracklet image for the desktop window icon, and the packaging script generates a Windows `.ico` from that same Tracklet image for the app executable and installer
- Shows a desktop-only `Create Superuser` helper on the login screen that launches Django `createsuperuser` against the bundled backend
- Stores Electron user data outside the install folder. On Windows the default path is `%LOCALAPPDATA%\\TrackletDesktop\\electron`
- The NSIS uninstaller is configured to preserve that Electron data directory by default

Bundled runtime files are installed under the application’s `resources\runtime` directory. They contain no machine-specific source paths. Runtime diagnostics are written to `%LOCALAPPDATA%\\TrackletDesktop\\logs\\backend-startup.log` without recording secrets.

After installation, launch Tracklet from the Start Menu or desktop shortcut created by the installer.

## Persistent Desktop Data

The installer never stores the business database or media inside the install directory. The bundled backend is pointed at the persistent desktop root:

```text
%LOCALAPPDATA%\TrackletDesktop
```

Tracklet uses these subfolders by default in desktop mode:

- `config\config.yaml`
- `config\plugins.txt`
- `config\secret_key.txt`
- `data\database.sqlite3`
- `data\media\`
- `data\static\`
- `backups\`
- `logs\`

That means:

- Updating or reinstalling the `.exe` only replaces app files
- Database records survive app restarts and Windows reboots
- Uploaded images and attachments survive updates because they live in `data\media`
- Uninstalling the Electron shell does not remove the Tracklet backend data folders unless you delete them yourself

The packaged app uses this root by default. The standalone Windows development scripts continue to support `INVENTREE_DESKTOP_DATA_DIR` overrides for development and migration work.

## Backup And Restore

Back up both the database and uploaded files from the repository root:

```powershell
.\env\Scripts\python.exe -m invoke backup
```

Restore them later with:

```powershell
.\env\Scripts\python.exe -m invoke restore
```

These commands use the configured backup directory, which defaults to:

```text
%LOCALAPPDATA%\TrackletDesktop\backups
```

## Remaining distribution work

- Code-sign the installer and application binaries before public distribution
- Add an update channel if automatic upgrades are required
