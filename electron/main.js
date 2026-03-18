const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, dialog, globalShortcut, ipcMain, shell } = require('electron');
const { startDesktopServer } = require('./desktopServer');

const DEFAULT_RENDERER_URL = 'http://127.0.0.1:5173/web/';
const DEFAULT_API_URL = 'http://127.0.0.1:8000';
const APP_TITLE = 'Tracklet';
const APP_ID = 'org.tracklet.desktop';
const DEFAULT_BUILD_DIR = path.resolve(
  __dirname,
  app.isPackaged
    ? path.join(process.resourcesPath, 'web')
    : '../src/backend/Tracklet/web/static/web'
);
const DEFAULT_ICON = path.resolve(
  __dirname,
  app.isPackaged
    ? path.join(process.resourcesPath, 'web', 'tracklet.png')
    : '../src/backend/Tracklet/Tracklet/static/img/tracklet.png'
);
const SMOKE_TEST_REPORT = path.resolve(__dirname, '.smoke-test.json');
let packagedDesktopServer;
let mainWindow;

function createSplashWindow() {
  const splashWindow = new BrowserWindow({
    title: APP_TITLE,
    width: 480,
    height: 320,
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#0d4b48',
    icon: DEFAULT_ICON,
    show: true,
    frame: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const splashHtml = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${APP_TITLE}</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: Segoe UI, Arial, sans-serif;
            background:
              radial-gradient(circle at top, rgba(72, 201, 176, 0.35), transparent 40%),
              linear-gradient(135deg, #0b2d34 0%, #0d4b48 45%, #168f86 100%);
            color: #eefbf7;
          }
          .panel {
            width: 320px;
            padding: 28px 32px;
            border-radius: 22px;
            text-align: center;
            background: rgba(5, 20, 23, 0.34);
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
            backdrop-filter: blur(8px);
          }
          img {
            width: 84px;
            height: 84px;
            object-fit: contain;
            margin-bottom: 18px;
          }
          h1 {
            margin: 0 0 10px;
            font-size: 32px;
            font-weight: 700;
          }
          p {
            margin: 0;
            color: rgba(238, 251, 247, 0.88);
            font-size: 15px;
          }
          .bar {
            margin-top: 20px;
            height: 8px;
            border-radius: 999px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.14);
          }
          .bar::after {
            content: '';
            display: block;
            width: 45%;
            height: 100%;
            border-radius: 999px;
            background: linear-gradient(90deg, #8fe2b5 0%, #d9f4a6 100%);
            animation: slide 1.3s ease-in-out infinite;
          }
          @keyframes slide {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(320%); }
          }
        </style>
      </head>
      <body>
        <div class="panel">
          <img src="file:///${DEFAULT_ICON.replace(/\\/g, '/')}" alt="Tracklet" />
          <h1>${APP_TITLE}</h1>
          <p>Starting desktop workspace...</p>
          <div class="bar"></div>
        </div>
      </body>
    </html>
  `;

  splashWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`
  );

  return splashWindow;
}

function getPowerShellCommand() {
  return process.env.ComSpec
    ? path.join(
        path.dirname(process.env.ComSpec),
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe'
      )
    : 'powershell.exe';
}

function getCreateSuperuserScriptPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'scripts', 'create-superuser.ps1')
    : path.join(__dirname, 'create-superuser.ps1');
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function withTrailingSlash(value) {
  return `${trimTrailingSlash(value)}/`;
}

function getRendererUrl() {
  return withTrailingSlash(
    process.env.ELECTRON_RENDERER_URL || DEFAULT_RENDERER_URL
  );
}

function getBackendUrl() {
  return trimTrailingSlash(process.env.ELECTRON_API_URL || DEFAULT_API_URL);
}

function getBuildDir() {
  return process.env.ELECTRON_FRONTEND_BUILD_DIR || DEFAULT_BUILD_DIR;
}

function isSmokeTestMode() {
  return process.argv.includes('--smoke-test');
}

function writeSmokeTestReport(payload) {
  if (!isSmokeTestMode()) {
    return;
  }

  fs.writeFileSync(
    SMOKE_TEST_REPORT,
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        ...payload
      },
      null,
      2
    )
  );
}

async function launchCreateSuperuserFlow() {
  const selectedDirectory = await dialog.showOpenDialog({
    title: 'Select the Tracklet backend folder',
    buttonLabel: 'Use Folder',
    properties: ['openDirectory'],
    message:
      'Choose the Tracklet backend folder or the project root that contains src/backend/Tracklet/manage.py'
  });

  if (selectedDirectory.canceled || selectedDirectory.filePaths.length === 0) {
    return {
      ok: false,
      cancelled: true
    };
  }

  const backendDir = selectedDirectory.filePaths[0];
  const scriptPath = getCreateSuperuserScriptPath();

  if (!fs.existsSync(scriptPath)) {
    return {
      ok: false,
      error: 'The desktop helper script was not found.'
    };
  }

  try {
    const child = spawn(
      getPowerShellCommand(),
      [
        '-ExecutionPolicy',
        'Bypass',
        '-NoExit',
        '-File',
        scriptPath,
        '-BackendDir',
        backendDir
      ],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      }
    );

    child.unref();

    return {
      ok: true,
      backendDir
    };
  } catch (error) {
    console.error('[Tracklet Electron] Failed to launch superuser helper', error);

    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

ipcMain.handle('tracklet:create-superuser', async () => launchCreateSuperuserFlow());

async function createWindow() {
  let rendererUrl = getRendererUrl();
  let apiUrl = trimTrailingSlash(new URL(rendererUrl).origin);
  let splashWindow;

  if (app.isPackaged) {
    splashWindow = createSplashWindow();

    try {
      packagedDesktopServer = await startDesktopServer({
        staticDir: getBuildDir(),
        backendUrl: getBackendUrl()
      });
      rendererUrl = packagedDesktopServer.frontendUrl;
      apiUrl = packagedDesktopServer.origin;
    } catch (error) {
      splashWindow?.destroy();
      dialog.showErrorBox(
        'Tracklet could not start',
        error instanceof Error
          ? error.message
          : 'The packaged desktop server could not be started.'
      );
      throw error;
    }
  }

  const window = new BrowserWindow({
    title: APP_TITLE,
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: '#f5f7fb',
    icon: DEFAULT_ICON,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--tracklet-api-url=${apiUrl}`]
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  window.on('page-title-updated', (event) => {
    event.preventDefault();
    window.setTitle(APP_TITLE);
  });

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = undefined;
    }
  });

  window.once('ready-to-show', () => {
    console.log('[Tracklet Electron] Window ready');
    window.setTitle(APP_TITLE);
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    window.show();
  });

  window.webContents.on('did-fail-load', (_, errorCode, errorDescription, url) => {
    console.error('[Tracklet Electron] Failed to load renderer', {
      errorCode,
      errorDescription,
      url
    });

    if (isSmokeTestMode()) {
      writeSmokeTestReport({
        ok: false,
        phase: 'did-fail-load',
        errorCode,
        errorDescription,
        url
      });
      app.exit(1);
    }
  });

  window.webContents.on('did-finish-load', async () => {
    console.log('[Tracklet Electron] Renderer finished loading');
    window.setTitle(APP_TITLE);

    if (!app.isPackaged) {
      const diagnostics = await window.webContents.executeJavaScript(`
        (async () => {
          const apiHost = window.INVENTREE_SETTINGS?.api_host || null;
          let apiStatus = null;
          let apiError = null;

          if (apiHost) {
            try {
              const response = await fetch(\`\${apiHost}/api/\`, { credentials: 'include' });
              apiStatus = response.status;
            } catch (error) {
              apiError = error instanceof Error ? error.message : String(error);
            }
          }

          return {
            apiHost,
            apiStatus,
            apiError,
            isElectron: window.TRACKLET_ELECTRON?.isElectron === true,
            location: window.location.href
          };
        })();
      `);

      console.log('[Tracklet Electron] Renderer diagnostics:', diagnostics);

      if (
        process.env.ELECTRON_TEST_USERNAME &&
        process.env.ELECTRON_TEST_PASSWORD
      ) {
        const authDiagnostics = await window.webContents.executeJavaScript(`
          (async () => {
            const username = ${JSON.stringify(process.env.ELECTRON_TEST_USERNAME)};
            const password = ${JSON.stringify(process.env.ELECTRON_TEST_PASSWORD)};

            const cookieValue = (name) =>
              document.cookie
                .split(';')
                .map((value) => value.trim())
                .find((value) => value.startsWith(\`\${name}=\`))
                ?.split('=')[1];

            await fetch('/api/auth/v1/auth/session', {
              credentials: 'include'
            }).catch(() => null);

            const csrfToken = cookieValue('csrftoken') || '';

            const loginResponse = await fetch('/api/auth/v1/auth/login', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
              },
              body: JSON.stringify({ username, password })
            });

            const userResponse = await fetch('/api/user/me/', {
              credentials: 'include'
            });

            const dashboardResponse = await fetch('/api/projects/dashboard/', {
              credentials: 'include'
            });

            return {
              csrfTokenPresent: csrfToken.length > 0,
              loginStatus: loginResponse.status,
              userStatus: userResponse.status,
              dashboardStatus: dashboardResponse.status
            };
          })();
        `);

        console.log('[Tracklet Electron] Auth diagnostics:', authDiagnostics);

        if (isSmokeTestMode()) {
          writeSmokeTestReport({
            ok:
              diagnostics.apiStatus === 200 &&
              diagnostics.isElectron === true &&
              authDiagnostics.loginStatus === 200 &&
              authDiagnostics.userStatus === 200 &&
              authDiagnostics.dashboardStatus === 200,
            phase: 'did-finish-load',
            diagnostics,
            authDiagnostics
          });
          setTimeout(() => {
            app.exit(
              diagnostics.apiStatus === 200 &&
                diagnostics.isElectron === true &&
                authDiagnostics.loginStatus === 200 &&
                authDiagnostics.userStatus === 200 &&
                authDiagnostics.dashboardStatus === 200
                ? 0
                : 1
            );
          }, 500);
          return;
        }
      }

      if (isSmokeTestMode()) {
        writeSmokeTestReport({
          ok: diagnostics.apiStatus === 200 && diagnostics.isElectron === true,
          phase: 'did-finish-load',
          diagnostics
        });
        setTimeout(() => {
          app.exit(
            diagnostics.apiStatus === 200 && diagnostics.isElectron === true
              ? 0
              : 1
          );
        }, 500);
      }
    }
  });

  mainWindow = window;

  if (!app.isPackaged && !isSmokeTestMode()) {
    window.webContents.openDevTools({ mode: 'detach' });
  }

  window.loadURL(rendererUrl);

  return window;
}

app.whenReady().then(() => {
  app.setName(APP_TITLE);
  app.setAppUserModelId(APP_ID);
  console.log('[Tracklet Electron] App ready');
  createWindow().catch((error) => {
    console.error('[Tracklet Electron] Failed to create window', error);
    app.quit();
  });

  globalShortcut.register('CommandOrControl+Shift+I', () => {
    const activeWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getAllWindows()[0];

    if (!activeWindow || activeWindow.isDestroyed()) {
      return;
    }

    activeWindow.webContents.openDevTools({ mode: 'detach' });
  });

  if (isSmokeTestMode()) {
    setTimeout(() => {
      console.error('[Tracklet Electron] Smoke test timed out before verification completed');
      writeSmokeTestReport({
        ok: false,
        phase: 'timeout'
      });
      app.exit(1);
    }, 20000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((error) => {
        console.error('[Tracklet Electron] Failed to recreate window', error);
      });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (packagedDesktopServer) {
    packagedDesktopServer.close().catch(() => {});
    packagedDesktopServer = undefined;
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
