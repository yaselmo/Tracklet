# Tracklet Electron Wrapper

This folder contains an optional Electron shell for running Tracklet as a desktop app without replacing the existing web application.

The packaged desktop app currently targets an external Tracklet backend. It does not bundle the Django backend or database into the installer.

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

Development frontend origin:

- The Electron development flow is pinned to `http://127.0.0.1:5173`
- This is configured in `src/frontend/vite.config.ts`
- The Windows launcher in `contrib/windows/start-frontend.ps1` also starts Vite with `--host 127.0.0.1 --port 5173 --strictPort`
- If port `5173` is busy, free that port instead of letting Vite choose a random fallback port, or Electron and Django CSRF checks can drift out of sync

Packaged desktop origin:

- The packaged Electron shell serves the frontend from `http://127.0.0.1:64740/web/`
- This port is configured in `electron/desktopServer.js`
- Override it only with `ELECTRON_DESKTOP_PORT` if you also update Django trusted origins to match

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
3. Packages the Electron app
4. Produces an NSIS Windows installer `.exe`

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
- Expects an external Tracklet backend, defaulting to `http://127.0.0.1:8000`
- Can be pointed at a different backend by setting `ELECTRON_API_URL` before launch
- Uses the green Tracklet image for the desktop window icon, and the packaging script generates a Windows `.ico` from that same Tracklet image for the app executable and installer
- Shows a desktop-only `Create Superuser` helper on the login screen that launches Django `createsuperuser` against your existing backend checkout

After installation, launch Tracklet from the Start Menu or desktop shortcut created by the installer.

## What Still Needs To Happen For A Full Desktop Build

- Bundle and manage a local Tracklet backend if standalone offline installation is required
- Add a user-facing settings screen for choosing the backend URL after install
- Add app signing, updates, and platform-specific distribution settings
