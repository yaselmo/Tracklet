const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = __dirname;
const packageJson = require(path.join(rootDir, 'package.json'));
const nsisVersion = packageJson.build?.nsisWeb?.installerVersion || '3.0.4.1';
const nsisResourcesVersion =
  packageJson.build?.nsis?.customNsisResources?.version || '3.4.1';
const buildResourcesDir = path.join(rootDir, 'build');
const sourceTrackletPng = path.resolve(
  rootDir,
  '../src/backend/Tracklet/Tracklet/static/img/tracklet.png'
);
const generatedWindowsIcon = path.join(buildResourcesDir, 'icon.ico');

function resolveCacheDir() {
  if (process.env.ELECTRON_BUILDER_CACHE) {
    return process.env.ELECTRON_BUILDER_CACHE;
  }

  if (process.platform === 'win32') {
    return path.join('C:\\electron-builder-cache', 'tracklet-electron');
  }

  return path.join(os.tmpdir(), 'electron-builder-cache', 'tracklet-electron');
}

const cacheDir = resolveCacheDir();

function ensureCacheDir() {
  fs.mkdirSync(cacheDir, { recursive: true });
}

function ensureBuildResourcesDir() {
  fs.mkdirSync(buildResourcesDir, { recursive: true });
}

function removePathIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
}

function cleanBrokenNsisCache() {
  const nsisDir = path.join(cacheDir, 'nsis');

  if (!fs.existsSync(nsisDir)) {
    return;
  }

  const extractedDir = path.join(
    nsisDir,
    `nsis-${nsisVersion}-nsis-${nsisVersion}`
  );
  const elevatePath = path.join(extractedDir, 'elevate.exe');

  if (fs.existsSync(extractedDir) && !fs.existsSync(elevatePath)) {
    console.log(
      `[tracklet-electron] Removing incomplete NSIS cache entry: ${extractedDir}`
    );
    removePathIfExists(extractedDir);
  }

  for (const entry of fs.readdirSync(nsisDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (/^\d+$/.test(entry.name)) {
      const tempDir = path.join(nsisDir, entry.name);
      console.log(
        `[tracklet-electron] Removing stale NSIS temp cache entry: ${tempDir}`
      );
      removePathIfExists(tempDir);
    }
  }
}

function readPngDimensions(buffer) {
  const pngSignature = '89504e470d0a1a0a';

  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error('Tracklet icon source is not a valid PNG file.');
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function createIcoFromPng(pngBuffer) {
  const { width, height } = readPngDimensions(pngBuffer);
  const header = Buffer.alloc(6);
  const directoryEntry = Buffer.alloc(16);

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  directoryEntry.writeUInt8(width >= 256 ? 0 : width, 0);
  directoryEntry.writeUInt8(height >= 256 ? 0 : height, 1);
  directoryEntry.writeUInt8(0, 2);
  directoryEntry.writeUInt8(0, 3);
  directoryEntry.writeUInt16LE(1, 4);
  directoryEntry.writeUInt16LE(32, 6);
  directoryEntry.writeUInt32LE(pngBuffer.length, 8);
  directoryEntry.writeUInt32LE(header.length + directoryEntry.length, 12);

  return Buffer.concat([header, directoryEntry, pngBuffer]);
}

function ensureWindowsIcon() {
  ensureBuildResourcesDir();

  if (!fs.existsSync(sourceTrackletPng)) {
    throw new Error(
      `[tracklet-electron] Tracklet icon source was not found: ${sourceTrackletPng}`
    );
  }

  const pngBuffer = fs.readFileSync(sourceTrackletPng);
  const icoBuffer = createIcoFromPng(pngBuffer);

  fs.writeFileSync(generatedWindowsIcon, icoBuffer);
  console.log(
    `[tracklet-electron] Generated Windows icon: ${generatedWindowsIcon}`
  );
}

function getCommand(command) {
  if (process.platform === 'win32') {
    if (command === 'npm') {
      return {
        command: process.env.ComSpec || 'cmd.exe',
        argsPrefix: ['/d', '/s', '/c', 'npm']
      };
    }

    if (command.endsWith('.cmd')) {
      return {
        command: process.env.ComSpec || 'cmd.exe',
        argsPrefix: ['/d', '/s', '/c', command]
      };
    }
  }

  return {
    command,
    argsPrefix: []
  };
}

function run(command, args, extraEnv = {}, exitOnFailure = true) {
  const resolved = getCommand(command);
  const result = spawnSync(resolved.command, [...resolved.argsPrefix, ...args], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      ELECTRON_BUILDER_CACHE: cacheDir,
      ...extraEnv
    }
  });

  if (result.error) {
    console.error(
      `[tracklet-electron] Failed to start command: ${command}`,
      result.error
    );
    if (exitOnFailure) {
      process.exit(1);
    }
  }

  if (exitOnFailure && result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function findUsableNsisDir() {
  const nsisDir = path.join(cacheDir, 'nsis');

  if (!fs.existsSync(nsisDir)) {
    return null;
  }

  const preferredDir = path.join(
    nsisDir,
    `nsis-${nsisVersion}-nsis-${nsisVersion}`
  );

  if (fs.existsSync(path.join(preferredDir, 'elevate.exe'))) {
    return preferredDir;
  }

  for (const entry of fs.readdirSync(nsisDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const candidate = path.join(nsisDir, entry.name);
    if (fs.existsSync(path.join(candidate, 'elevate.exe'))) {
      return candidate;
    }
  }

  return null;
}

function findUsableNsisResourcesDir() {
  if (process.env.ELECTRON_BUILDER_NSIS_RESOURCES_DIR) {
    return process.env.ELECTRON_BUILDER_NSIS_RESOURCES_DIR;
  }

  const nsisDir = path.join(cacheDir, 'nsis');

  if (!fs.existsSync(nsisDir)) {
    return null;
  }

  const preferredDir = path.join(
    nsisDir,
    `nsis-resources-${nsisResourcesVersion}-nsis-resources-${nsisResourcesVersion}`
  );

  if (
    fs.existsSync(
      path.join(preferredDir, 'plugins', 'x86-unicode', 'UAC.dll')
    )
  ) {
    return preferredDir;
  }

  for (const entry of fs.readdirSync(nsisDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const candidate = path.join(nsisDir, entry.name);
    if (
      fs.existsSync(path.join(candidate, 'plugins', 'x86-unicode', 'UAC.dll'))
    ) {
      return candidate;
    }
  }

  return null;
}

function runBuilder() {
  const builderExecutable =
    process.platform === 'win32'
      ? path.join(rootDir, 'node_modules', '.bin', 'electron-builder.cmd')
      : path.join(rootDir, 'node_modules', '.bin', 'electron-builder');

  let result = run(builderExecutable, ['--win', 'nsis'], {}, false);

  if (result.status === 0) {
    return;
  }

  const fallbackNsisDir = findUsableNsisDir();
  const fallbackNsisResourcesDir = findUsableNsisResourcesDir();

  if (!fallbackNsisDir || !fallbackNsisResourcesDir) {
    process.exit(result.status ?? 1);
  }

  console.log(
    `[tracklet-electron] Retrying installer build with local NSIS dir: ${fallbackNsisDir}`
  );
  console.log(
    `[tracklet-electron] Retrying installer build with local NSIS resources dir: ${fallbackNsisResourcesDir}`
  );

  result = run(
    builderExecutable,
    ['--win', 'nsis'],
    {
      ELECTRON_BUILDER_NSIS_DIR: fallbackNsisDir,
      ELECTRON_BUILDER_NSIS_RESOURCES_DIR: fallbackNsisResourcesDir
    },
    false
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

ensureCacheDir();
ensureWindowsIcon();
console.log(`[tracklet-electron] Using Electron Builder cache: ${cacheDir}`);
cleanBrokenNsisCache();

run('npm', ['run', 'build:frontend']);
runBuilder();
