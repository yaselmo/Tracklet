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
const BACKEND_CONFIG_FILE = 'backend-config.json';
const BACKEND_LOG_FILE = 'backend-startup.log';
const DEFAULT_BACKEND_STARTUP_TIMEOUT_MS = 120000;
let packagedDesktopServer;
let mainWindow;

function getElectronUserDataDir() {
  const override =
    process.env.TRACKLET_ELECTRON_USER_DATA_DIR ||
    process.env.ELECTRON_USER_DATA_DIR;

  if (override) {
    return path.resolve(override);
  }

  const baseDir =
    process.platform === 'win32'
      ? process.env.LOCALAPPDATA || app.getPath('appData')
      : app.getPath('appData');

  return path.resolve(baseDir, 'TrackletDesktop', 'electron');
}

function getTrackletDesktopRootDir() {
  const override =
    process.env.INVENTREE_DESKTOP_DATA_DIR ||
    process.env.TRACKLET_DESKTOP_DATA_DIR ||
    process.env.INVENTREE_DATA_DIR;

  if (override) {
    return path.resolve(override);
  }

  const baseDir =
    process.platform === 'win32'
      ? process.env.LOCALAPPDATA || app.getPath('appData')
      : app.getPath('appData');

  return path.resolve(baseDir, 'TrackletDesktop');
}

function getTrackletLogsDir() {
  return path.join(getTrackletDesktopRootDir(), 'logs');
}

function getBackendLogPath() {
  return path.join(getTrackletLogsDir(), BACKEND_LOG_FILE);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

app.setPath('userData', getElectronUserDataDir());

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

function quotePowerShellArgument(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildPowerShellScriptCommand(scriptPath, args = []) {
  const renderedArgs = args
    .map((arg) => {
      const text = String(arg);
      return text.startsWith('-') ? text : quotePowerShellArgument(text);
    })
    .join(' ');
  const suffix = renderedArgs.length > 0 ? ` ${renderedArgs}` : '';
  return `& { & ${quotePowerShellArgument(scriptPath)}${suffix} }`;
}

function getCreateSuperuserScriptPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'scripts', 'create-superuser.ps1')
    : path.join(__dirname, 'create-superuser.ps1');
}

function getCreateBackupScriptPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'scripts', 'create-backup.ps1')
    : path.join(__dirname, 'create-backup.ps1');
}

function getStartBackendScriptPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'scripts', 'start-backend.ps1')
    : path.join(__dirname, 'start-backend.ps1');
}

function getBackendConfigPath() {
  return path.join(app.getPath('userData'), BACKEND_CONFIG_FILE);
}

function readBackendConfig() {
  const configPath = getBackendConfigPath();

  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.warn('[Tracklet Electron] Failed to read backend config', error);
    return {};
  }
}

function writeBackendConfig(nextConfig) {
  const configPath = getBackendConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2));
}

function resolveManagePyPath(basePath) {
  const candidates = [
    path.join(basePath, 'manage.py'),
    path.join(basePath, 'src', 'backend', 'Tracklet', 'manage.py')
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function validateBackendSelection(selectedPath) {
  if (!selectedPath || String(selectedPath).trim().length === 0) {
    return {
      ok: false,
      error: 'No backend folder was selected.'
    };
  }

  const resolvedPath = path.resolve(selectedPath);
  const managePyPath = resolveManagePyPath(resolvedPath);

  if (!managePyPath) {
    return {
      ok: false,
      error:
        'Wrong backend folder. Expected a Tracklet project root or backend folder containing src/backend/Tracklet/manage.py.'
    };
  }

  const backendDir = path.dirname(managePyPath);
  const normalizedManagePyPath = managePyPath.replace(/\\/g, '/').toLowerCase();
  const projectRoot = normalizedManagePyPath.endsWith('/src/backend/tracklet/manage.py')
    ? path.resolve(backendDir, '..', '..', '..')
    : backendDir;
  const backendScriptPath = path.join(projectRoot, 'contrib', 'windows', 'start-backend.ps1');
  const settingsPath = path.join(backendDir, 'Tracklet', 'settings.py');
  const pythonCandidates = [
    path.join(projectRoot, 'env', 'Scripts', 'python.exe'),
    path.join(path.dirname(projectRoot), 'env', 'Scripts', 'python.exe')
  ];
  const pythonPath = pythonCandidates.find((candidate) => fs.existsSync(candidate));

  if (!fs.existsSync(settingsPath)) {
    return {
      ok: false,
      error:
        'Wrong backend folder. The selected path does not contain the expected Tracklet Django backend structure.',
      managePyPath,
      backendDir,
      projectRoot
    };
  }

  if (!fs.existsSync(backendScriptPath)) {
    return {
      ok: false,
      error:
        'Wrong backend folder. The Windows Tracklet backend launcher was not found in the selected project.',
      managePyPath,
      backendDir,
      projectRoot
    };
  }

  if (!pythonPath) {
    return {
      ok: false,
      error:
        'Missing Python/dependencies. A Tracklet virtual environment was not found next to the selected backend.',
      managePyPath,
      backendDir,
      projectRoot
    };
  }

  return {
    ok: true,
    selectedPath: resolvedPath,
    managePyPath,
    backendDir,
    projectRoot,
    backendScriptPath,
    pythonPath
  };
}

async function promptForBackendDir() {
  const selectedDirectory = await dialog.showOpenDialog({
    title: 'Select the Tracklet backend folder',
    buttonLabel: 'Use Folder',
    properties: ['openDirectory'],
    message:
      'Choose the Tracklet backend folder or the project root that contains src/backend/Tracklet/manage.py'
  });

  if (selectedDirectory.canceled || selectedDirectory.filePaths.length === 0) {
    return { cancelled: true };
  }

  return validateBackendSelection(selectedDirectory.filePaths[0]);
}

async function getBackendHealth(backendUrl) {
  try {
    const response = await fetch(`${trimTrailingSlash(backendUrl)}/api/`, {
      method: 'GET'
    });

    return {
      ok: response.ok,
      status: response.status
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function wait(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function waitForBackend(
  backendUrl,
  timeoutMs = DEFAULT_BACKEND_STARTUP_TIMEOUT_MS
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const health = await getBackendHealth(backendUrl);

    if (health.ok) {
      return {
        ok: true,
        health
      };
    }

    await wait(1000);
  }

  return {
    ok: false,
    error: 'Timed out waiting for the Tracklet backend to become healthy.'
  };
}

function writeBackendLaunchHeader(logPath, details) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(
    logPath,
    [
      `=== Tracklet backend startup ${new Date().toISOString()} ===`,
      `scriptPath: ${details.scriptPath}`,
      `backendDir: ${details.backendDir}`,
      `projectRoot: ${details.projectRoot}`,
      `managePy: ${details.managePyPath}`,
      `python: ${details.pythonPath}`,
      `address: ${details.backendAddress}`,
      `startupTimeoutMs: ${details.startupTimeoutMs}`,
      `env.INVENTREE_DESKTOP_MODE: ${details.desktopMode}`,
      `env.INVENTREE_DEBUG: ${details.debugMode}`,
      `env.INVENTREE_DESKTOP_DATA_DIR: ${details.desktopDataDir}`,
      ''
    ].join('\n'),
    'utf8'
  );
}

function appendBackendLog(logPath, message) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(
    logPath,
    `[${new Date().toISOString()}] ${message}\n`,
    'utf8'
  );
}

function appendBackendLogChunk(logPath, chunk) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, chunk.toString(), 'utf8');
}

function launchBackendProcess(validation, backendUrl) {
  const scriptPath = getStartBackendScriptPath();

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`The backend launcher script was not found: ${scriptPath}`);
  }

  const backendAddress = new URL(trimTrailingSlash(backendUrl)).host;
  const logPath = getBackendLogPath();
  writeBackendLaunchHeader(logPath, {
    ...validation,
    backendAddress,
    scriptPath,
    startupTimeoutMs: DEFAULT_BACKEND_STARTUP_TIMEOUT_MS,
    desktopMode: process.env.INVENTREE_DESKTOP_MODE || '1',
    debugMode: process.env.INVENTREE_DEBUG || '1',
    desktopDataDir: process.env.INVENTREE_DESKTOP_DATA_DIR || getTrackletDesktopRootDir()
  });

  const launchCommand = buildPowerShellScriptCommand(scriptPath, [
    '-BackendDir',
    validation.backendDir,
    '-Address',
    backendAddress
  ]);

  appendBackendLog(logPath, `launcher.command=${launchCommand}`);

  const child = spawn(
    getPowerShellCommand(),
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      launchCommand
    ],
    {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    }
  );

  appendBackendLog(logPath, `launcher.spawn pid=${child.pid ?? 'unknown'}`);

  child.stdout?.on('data', (chunk) => {
    appendBackendLogChunk(logPath, chunk);
  });

  child.stderr?.on('data', (chunk) => {
    appendBackendLogChunk(logPath, chunk);
  });

  child.on('spawn', () => {
    appendBackendLog(logPath, 'launcher.event=spawn');
  });

  child.on('error', (error) => {
    appendBackendLog(
      logPath,
      `launcher.event=error message=${error instanceof Error ? error.message : String(error)}`
    );
  });

  child.on('exit', (code, signal) => {
    appendBackendLog(
      logPath,
      `launcher.event=exit code=${code ?? 'null'} signal=${signal ?? 'null'}`
    );
  });

  child.on('close', (code, signal) => {
    appendBackendLog(
      logPath,
      `launcher.event=close code=${code ?? 'null'} signal=${signal ?? 'null'}`
    );
  });

  return {
    child,
    logPath
  };
}

async function resolveBackendDirForDesktopAction(allowPrompt = true) {
  const savedConfig = readBackendConfig();
  let validation =
    validateBackendSelection(process.env.TRACKLET_BACKEND_DIR || '');

  if (!validation.ok) {
    validation = validateBackendSelection(savedConfig.backendDir || '');
  }

  if (!validation.ok && allowPrompt) {
    const prompted = await promptForBackendDir();

    if (prompted?.cancelled) {
      return {
        ok: false,
        cancelled: true
      };
    }

    validation = prompted;
  }

  if (!validation.ok) {
    return validation;
  }

  const backendDir = validation.backendDir;
  if (!backendDir) {
    return null;
  }

  writeBackendConfig({
    ...savedConfig,
    backendDir
  });

  return {
    ok: true,
    ...validation
  };
}

async function ensurePackagedBackendAvailable(
  backendUrl,
  options = {}
) {
  const { forcePrompt = false } = options;
  const currentHealth = await getBackendHealth(backendUrl);

  if (currentHealth.ok) {
    appendBackendLog(
      getBackendLogPath(),
      `backendHealth=ok url=${backendUrl} alreadyRunning=true`
    );
    return {
      ok: true,
      alreadyRunning: true,
      backendUrl
    };
  }

  let validation = forcePrompt
    ? { ok: false }
    : await resolveBackendDirForDesktopAction(false);

  if (!validation?.ok) {
    if (forcePrompt) {
      validation = await promptForBackendDir();
    } else {
      const choice = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Locate Backend', 'Continue'],
        defaultId: 0,
        cancelId: 1,
        title: 'Tracklet backend required',
        message:
          'Tracklet Desktop needs the local backend to run in the background. Choose your Tracklet backend folder once and Tracklet.exe will start it automatically next time.'
      });

      if (choice.response !== 0) {
        return {
          ok: false,
          error:
            currentHealth.status && currentHealth.status !== 200
              ? `Backend is not healthy on ${backendUrl} (HTTP ${currentHealth.status}).`
              : 'Tracklet backend startup was skipped.'
        };
      }

      validation = await promptForBackendDir();
    }

    if (validation?.cancelled) {
      return {
        ok: false,
        cancelled: true,
        error: 'Tracklet backend startup was cancelled.'
      };
    }

    if (!validation?.ok) {
      return validation;
    }

    writeBackendConfig({
      ...readBackendConfig(),
      backendDir: validation.backendDir
    });
  }

  const { child, logPath } = launchBackendProcess(validation, backendUrl);

  appendBackendLog(logPath, `healthCheck.start url=${backendUrl}`);
  const startupResult = await waitForBackend(backendUrl);

  if (startupResult.ok) {
    appendBackendLog(logPath, `backendHealth=ok url=${backendUrl} firstSuccessfulHealthCheck=true`);
    return {
      ok: true,
      backendDir: validation.backendDir,
      backendUrl,
      logPath
    };
  }

  let failureReason = startupResult.error;
  let childExitCode = null;

  if (child.exitCode !== null) {
    childExitCode = child.exitCode;
  }

  appendBackendLog(
    logPath,
    `healthCheck.failed url=${backendUrl} childExitCode=${childExitCode ?? 'null'} reason=${startupResult.error}`
  );

  const logTail = fs.existsSync(logPath)
    ? fs
        .readFileSync(logPath, 'utf8')
        .split(/\r?\n/)
        .slice(-40)
        .join('\n')
    : '';

  if (/Python virtual environment not found/i.test(logTail)) {
    failureReason = 'Missing Python/dependencies for the selected Tracklet backend.';
  } else if (/Tracklet backend was not found/i.test(logTail)) {
    failureReason = 'Wrong backend folder selected.';
  } else if (/Address already in use|Only one usage of each socket address/i.test(logTail)) {
    failureReason = `Port already in use for backend address ${new URL(trimTrailingSlash(backendUrl)).host}.`;
  } else if (/exitCode\(runmigrations\)=([1-9]\d*)/i.test(logTail)) {
    failureReason = 'Backend migration check failed. Check the startup log for details.';
  } else if (/exitCode\(migrate\)=([1-9]\d*)/i.test(logTail)) {
    failureReason = 'Backend migration step failed. Check the startup log for details.';
  } else if (/exitCode\(dev\.server\)=([1-9]\d*)/i.test(logTail)) {
    failureReason = 'Backend server command exited unexpectedly. Check the startup log for details.';
  } else if (/exitCode\(runserver\)=([1-9]\d*)/i.test(logTail)) {
    failureReason = 'Backend server command exited unexpectedly. Check the startup log for details.';
  } else if (
    /Applying Tracklet database migrations|Database Migrations required|Traceback|Error/i.test(
      logTail
    )
  ) {
    failureReason =
      'Backend failed during startup, migration, or configuration. Check the backend startup log for details.';
  } else if (startupResult.error && /Timed out waiting/i.test(startupResult.error)) {
    failureReason = `Timed out waiting ${DEFAULT_BACKEND_STARTUP_TIMEOUT_MS}ms for the Tracklet backend to become healthy.`;
  } else if (childExitCode !== null) {
    failureReason = `Tracklet backend launcher exited with code ${childExitCode} before the backend became healthy.`;
  }

  appendBackendLog(
    logPath,
    `backendHealth=failed url=${backendUrl} reason=${failureReason}`
  );

  return {
    ok: false,
    error: failureReason,
    logPath,
    backendDir: validation.backendDir,
    backendUrl
  };
}

function buildStartupFailureMessage(startupFailure) {
  return startupFailure?.error || 'Tracklet backend failed to start.';
}

function createStartupErrorWindow(startupFailure) {
  const errorWindow = new BrowserWindow({
    title: APP_TITLE,
    width: 720,
    height: 560,
    minWidth: 640,
    minHeight: 500,
    autoHideMenuBar: true,
    backgroundColor: '#f5f7fb',
    icon: DEFAULT_ICON,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  errorWindow.on('closed', () => {
    if (mainWindow === errorWindow) {
      mainWindow = undefined;
    }
  });

  const logPath = startupFailure?.logPath || getBackendLogPath();
  const reason = buildStartupFailureMessage(startupFailure);

  const startupErrorHtml = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${APP_TITLE}</title>
        <style>
          :root {
            color-scheme: light;
            font-family: "Segoe UI", Arial, sans-serif;
          }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background:
              radial-gradient(circle at top, rgba(72, 201, 176, 0.18), transparent 38%),
              linear-gradient(135deg, #eef6f5 0%, #f8fbff 100%);
            color: #163137;
          }
          .panel {
            width: min(560px, calc(100vw - 48px));
            padding: 32px;
            border-radius: 24px;
            background: rgba(255, 255, 255, 0.96);
            box-shadow: 0 24px 70px rgba(20, 52, 61, 0.16);
            border: 1px solid rgba(22, 49, 55, 0.08);
          }
          h1 {
            margin: 0 0 12px;
            font-size: 30px;
            line-height: 1.15;
          }
          p {
            margin: 0 0 16px;
            line-height: 1.5;
          }
          .reason {
            padding: 14px 16px;
            border-radius: 14px;
            background: #fff3f2;
            color: #8a2d23;
            border: 1px solid #f2c8c3;
            margin-bottom: 18px;
            white-space: pre-wrap;
          }
          .meta {
            font-size: 13px;
            color: #496068;
            margin-bottom: 24px;
            word-break: break-word;
          }
          .actions {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            margin-bottom: 14px;
          }
          button {
            appearance: none;
            border: 0;
            border-radius: 12px;
            padding: 12px 16px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
          }
          .primary {
            background: #186f6a;
            color: white;
          }
          .secondary {
            background: #e6f3f1;
            color: #18524f;
          }
          .ghost {
            background: #f1f5f9;
            color: #28424a;
          }
          .status {
            min-height: 22px;
            font-size: 13px;
            color: #496068;
          }
        </style>
      </head>
      <body>
        <main class="panel">
          <h1>Tracklet backend failed to start</h1>
          <p>Tracklet Desktop could not get the local backend into a healthy ready state, so login has been blocked until startup succeeds.</p>
          <div class="reason">${escapeHtml(reason)}</div>
          <div class="meta">
            <strong>Backend log:</strong><br />
            ${escapeHtml(logPath)}
          </div>
          <div class="actions">
            <button class="primary" id="locate">Locate Backend Again</button>
            <button class="secondary" id="retry">Retry Startup</button>
            <button class="ghost" id="logs">Open Logs Folder</button>
          </div>
          <div class="status" id="status"></div>
        </main>
        <script>
          const status = document.getElementById('status');
          const buttons = Array.from(document.querySelectorAll('button'));
          const setBusy = (busy, message = '') => {
            buttons.forEach((button) => {
              button.disabled = busy;
              button.style.opacity = busy ? '0.7' : '1';
              button.style.cursor = busy ? 'progress' : 'pointer';
            });
            status.textContent = message;
          };

          document.getElementById('locate').addEventListener('click', async () => {
            setBusy(true, 'Opening backend folder picker...');
            await window.TRACKLET_ELECTRON?.locateBackendAgain?.();
          });

          document.getElementById('retry').addEventListener('click', async () => {
            setBusy(true, 'Retrying backend startup...');
            await window.TRACKLET_ELECTRON?.retryBackendStartup?.();
          });

          document.getElementById('logs').addEventListener('click', async () => {
            setBusy(true, 'Opening logs folder...');
            try {
              await window.TRACKLET_ELECTRON?.openLogsFolder?.();
            } finally {
              setBusy(false, '');
            }
          });
        </script>
      </body>
    </html>
  `;

  errorWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(startupErrorHtml)}`
  );

  errorWindow.once('ready-to-show', () => {
    errorWindow.setTitle(APP_TITLE);
    errorWindow.show();
  });

  mainWindow = errorWindow;
  return errorWindow;
}

function runPowerShellJsonCommand(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      getPowerShellCommand(),
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        buildPowerShellScriptCommand(scriptPath, args)
      ],
      {
        windowsHide: true
      }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const jsonLine = [...lines].reverse().find((line) => line.startsWith('{'));

      if (!jsonLine) {
        reject(
          new Error(
            stderr || stdout || `Tracklet helper exited with code ${code ?? 'unknown'}`
          )
        );
        return;
      }

      try {
        resolve(JSON.parse(jsonLine));
      } catch (error) {
        reject(
          new Error(
            `Tracklet helper returned invalid JSON: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        );
      }
    });
  });
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
  const backendDir = await resolveBackendDirForDesktopAction(true);

  if (!backendDir?.ok) {
    return {
      ok: false,
      cancelled: backendDir?.cancelled === true,
      error: backendDir?.error
    };
  }

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
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-NoExit',
        '-Command',
        buildPowerShellScriptCommand(scriptPath, [
          '-BackendDir',
          backendDir.backendDir
        ])
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
      backendDir: backendDir.backendDir
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
ipcMain.handle('tracklet:create-backup', async () => {
  const backendUrl = getBackendUrl();

  if (!(await getBackendHealth(backendUrl)).ok) {
    return {
      ok: false,
      error:
        'Tracklet backend is not currently available. Start the backend and try again.'
    };
  }

  const backendDir = await resolveBackendDirForDesktopAction(true);

  if (!backendDir?.ok) {
    return {
      ok: false,
      cancelled: backendDir?.cancelled === true,
      error: backendDir?.error
    };
  }

  const scriptPath = getCreateBackupScriptPath();

  if (!fs.existsSync(scriptPath)) {
    return {
      ok: false,
      error: 'The desktop backup helper script was not found.'
    };
  }

  try {
    const result = await runPowerShellJsonCommand(scriptPath, [
      '-BackendDir',
      backendDir.backendDir
    ]);

    return {
      ...result,
      backendDir: backendDir.backendDir
    };
  } catch (error) {
    console.error('[Tracklet Electron] Failed to run backup helper', error);

    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});
ipcMain.handle('tracklet:open-logs-folder', async () =>
  shell.openPath(getTrackletLogsDir())
);
ipcMain.handle('tracklet:retry-backend-startup', async () => {
  const currentWindow = mainWindow;

  if (currentWindow && !currentWindow.isDestroyed()) {
    currentWindow.destroy();
  }

  mainWindow = undefined;

  try {
    await createWindow({ forcePromptBackend: false });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});
ipcMain.handle('tracklet:locate-backend-again', async () => {
  const currentWindow = mainWindow;

  if (currentWindow && !currentWindow.isDestroyed()) {
    currentWindow.destroy();
  }

  mainWindow = undefined;

  try {
    await createWindow({ forcePromptBackend: true });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

async function createWindow(options = {}) {
  const { forcePromptBackend = false } = options;
  let rendererUrl = getRendererUrl();
  let apiUrl = trimTrailingSlash(new URL(rendererUrl).origin);
  let splashWindow;

  if (app.isPackaged) {
    splashWindow = createSplashWindow();

    try {
      const backendStartup = await ensurePackagedBackendAvailable(getBackendUrl(), {
        forcePrompt: forcePromptBackend
      });

      if (!backendStartup.ok) {
        splashWindow?.destroy();
        return createStartupErrorWindow(backendStartup);
      }

      packagedDesktopServer = await startDesktopServer({
        staticDir: getBuildDir(),
        backendUrl: getBackendUrl()
      });
      rendererUrl = packagedDesktopServer.frontendUrl;
      apiUrl = packagedDesktopServer.origin;
    } catch (error) {
      splashWindow?.destroy();
      return createStartupErrorWindow({
        error:
          error instanceof Error
            ? error.message
            : 'The packaged desktop server could not be started.',
        logPath: getBackendLogPath()
      });
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

  function shouldOpenInternally(targetUrl) {
    if (!targetUrl) {
      return false;
    }

    try {
      const parsedUrl = new URL(targetUrl);
      const rendererOrigin = new URL(rendererUrl).origin;
      const apiOrigin = apiUrl ? new URL(apiUrl).origin : undefined;

      return (
        parsedUrl.origin === rendererOrigin ||
        (!!apiOrigin && parsedUrl.origin === apiOrigin)
      );
    } catch (error) {
      console.warn('[Tracklet Electron] Could not classify window.open target', {
        targetUrl,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenInternally(url)) {
      return { action: 'allow' };
    }

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
