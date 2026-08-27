const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const electronDir = __dirname;
const projectRoot = path.resolve(electronDir, '..');
const backendSourceDir = path.join(projectRoot, 'src', 'backend', 'Tracklet');
const requirementsFile = path.join(
  projectRoot,
  'src',
  'backend',
  'requirements-windows.in'
);
const runtimeStageDir = path.join(electronDir, '.runtime-stage');
const runtimeDir = path.join(runtimeStageDir, 'runtime');
const bundledPythonDir = path.join(runtimeDir, 'python');
const bundledBackendDir = path.join(runtimeDir, 'backend');

function fail(message) {
  throw new Error(`[tracklet-runtime] ${message}`);
}

function resolvePython() {
  const configured = process.env.TRACKLET_BUILD_PYTHON;
  const candidates = [
    configured ? path.resolve(configured) : null,
    path.join(projectRoot, 'env', 'Scripts', 'python.exe'),
    process.platform === 'win32' ? 'py' : 'python3',
    'python'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) {
      return candidate;
    }

    if (!path.isAbsolute(candidate)) {
      const probe = spawnSync(candidate, ['-c', 'import sys; print(sys.executable)'], {
        cwd: projectRoot,
        encoding: 'utf8',
        windowsHide: true
      });

      if (probe.status === 0 && probe.stdout.trim()) {
        return probe.stdout.trim().split(/\r?\n/).pop();
      }
    }
  }

  fail(
    'A working Python 3.11 build environment was not found. Set TRACKLET_BUILD_PYTHON to the existing env\\Scripts\\python.exe.'
  );
}

function quotePowerShell(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runPython(pythonPath, script, environment = {}, cwd = projectRoot) {
  const result = spawnSync(pythonPath, ['-c', script], {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        ...environment
      }
    });

  if (result.error || result.status !== 0) {
    fail(
      `Python build helper failed (exit ${result.status ?? 'unknown'}): ${
        result.stderr || result.error?.message || 'unknown error'
      }`
    );
  }

  return result.stdout.trim();
}

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDirectory(source, target, filter) {
  if (!fs.existsSync(source)) {
    fail(`Required runtime directory was not found: ${source}`);
  }

  fs.cpSync(source, target, {
    recursive: true,
    force: true,
    filter
  });
}

function shouldSkipBackendPath(source, sourceRoot) {
  const relative = path.relative(sourceRoot, source);
  const parts = relative.split(path.sep).filter(Boolean);

  return parts.some(
    (part) =>
      part === '__pycache__' ||
      part === '.pytest_cache' ||
      part === '.mypy_cache' ||
      part === '.ruff_cache' ||
      part === '.git'
  );
}

function copyBundledBackend() {
  if (!fs.existsSync(path.join(backendSourceDir, 'manage.py'))) {
    fail(`Tracklet backend source was not found: ${backendSourceDir}`);
  }

  copyDirectory(backendSourceDir, bundledBackendDir, (source) => {
    if (source === backendSourceDir) {
      return true;
    }

    return !shouldSkipBackendPath(source, backendSourceDir);
  });
}

function getPythonProbe(pythonPath) {
  const script = String.raw`
import json
import sys
import sysconfig

print(json.dumps({
    'executable': sys.executable,
    'prefix': sys.prefix,
    'base_prefix': sys.base_prefix,
    'version': '.'.join(str(v) for v in sys.version_info[:3]),
    'major': sys.version_info.major,
    'minor': sys.version_info.minor,
    'purelib': sysconfig.get_path('purelib'),
}))
`;

  return JSON.parse(runPython(pythonPath, script));
}

function getRuntimeDependencyManifest(pythonPath, runtimeRequirements) {
  const script = String.raw`
import importlib.metadata as metadata
import json
import os
from collections import defaultdict
from pathlib import Path
from packaging.requirements import Requirement

site_packages = Path(os.environ['TRACKLET_RUNTIME_SITE_PACKAGES']).resolve()
requirements_path = Path(os.environ['TRACKLET_RUNTIME_REQUIREMENTS']).resolve()

def normalize(name):
    return ''.join(ch for ch in name.lower() if ch.isalnum())

def requirements(path):
    parsed = []
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.split('#', 1)[0].strip()
        if not line or line.startswith(('-', 'git+', 'http:', 'https:')):
            continue
        try:
            parsed.append(Requirement(line))
        except Exception as error:
            raise RuntimeError(f'Could not parse runtime requirement {line!r}: {error}')
    return parsed

distributions = {}
for distribution in metadata.distributions():
    name = distribution.metadata.get('Name')
    if not name:
        continue
    try:
        location = Path(distribution.locate_file('')).resolve()
    except Exception:
        continue
    if location != site_packages:
        continue
    distributions[normalize(name)] = distribution

selected = {}
queue = [(requirement.name, set(requirement.extras)) for requirement in requirements(requirements_path)]
queue.append(('setuptools', set()))
active_extras = defaultdict(set)
processed_extras = defaultdict(set)
missing = []

while queue:
    requested, requested_extras = queue.pop(0)
    key = normalize(requested)
    new_extras = requested_extras - active_extras[key]
    active_extras[key].update(requested_extras)
    if key in processed_extras and not new_extras:
        continue
    distribution = distributions.get(key)
    if distribution is None:
        missing.append(requested)
        continue

    selected[key] = distribution
    processed_extras[key].update(new_extras)
    for dependency in distribution.requires or []:
        try:
            requirement = Requirement(dependency)
            extras_to_check = [''] + sorted(active_extras[key])
            if any(
                requirement.marker is None or
                requirement.marker.evaluate({'extra': extra})
                for extra in extras_to_check
            ):
                queue.append((requirement.name, set(requirement.extras)))
        except Exception:
            continue

files = set()
for distribution in selected.values():
    for package_file in distribution.files or []:
        relative = Path(str(package_file))
        if relative.is_absolute() or '..' in relative.parts:
            continue
        files.add(relative.as_posix())

for path in site_packages.glob('*.pth'):
    files.add(path.name)

print(json.dumps({
    'distributions': sorted(d.metadata.get('Name') for d in selected.values()),
    'files': sorted(files),
    'missing': sorted(set(missing)),
}))
`;

  const manifest = JSON.parse(
    runPython(pythonPath, script, {
      TRACKLET_RUNTIME_SITE_PACKAGES: runtimeRequirements.sitePackages,
      TRACKLET_RUNTIME_REQUIREMENTS: requirementsFile
    })
  );

  const requiredNames = runtimeRequirements.names;
  const missingRequired = manifest.missing.filter((name) =>
    requiredNames.some(
      (requiredName) =>
        requiredName.toLowerCase().replaceAll(/[-_.]/g, '') ===
        name.toLowerCase().replaceAll(/[-_.]/g, '')
    )
  );

  if (missingRequired.length > 0) {
    fail(
      `The build environment is missing runtime distributions: ${[
        ...new Set(missingRequired)
      ].join(', ')}`
    );
  }

  return manifest;
}

function parseRequirementNames() {
  return fs
    .readFileSync(requirementsFile, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.split('#', 1)[0].trim())
    .filter((line) => line && !line.startsWith('-'))
    .map((line) => line.replace(/\[.*?\]/, '').match(/^[A-Za-z0-9_.-]+/)?.[0])
    .filter(Boolean);
}

function copyDependencyFiles(sourceSitePackages, manifest) {
  const destinationSitePackages = path.join(
    bundledPythonDir,
    'Lib',
    'site-packages'
  );

  fs.mkdirSync(destinationSitePackages, { recursive: true });

  // Copy only files recorded in the distribution metadata. Using fs.cpSync with
  // a recursive filter still walks the complete site-packages tree on Windows,
  // which makes repeated installer builds unnecessarily slow.
  for (const relativeFile of manifest.files) {
    const source = path.join(sourceSitePackages, ...relativeFile.split('/'));
    const target = path.join(destinationSitePackages, ...relativeFile.split('/'));

    if (!fs.existsSync(source)) {
      continue;
    }

    copyFile(source, target);
  }
}

function copyPythonRuntime(pythonPath, probe, dependencyManifest) {
  const basePythonDir = probe.base_prefix;

  const requiredFiles = [
    'python.exe',
    'pythonw.exe',
    'python3.dll',
    `python${probe.major}${probe.minor}.dll`,
    'vcruntime140.dll',
    'vcruntime140_1.dll'
  ];

  for (const name of requiredFiles) {
    const source = path.join(basePythonDir, name);
    if (!fs.existsSync(source)) {
      fail(`Base Python runtime file was not found: ${source}`);
    }
    copyFile(source, path.join(bundledPythonDir, name));
  }

  copyDirectory(
    path.join(basePythonDir, 'DLLs'),
    path.join(bundledPythonDir, 'DLLs'),
    (source) => !source.split(path.sep).includes('__pycache__')
  );
  copyDirectory(
    path.join(basePythonDir, 'Lib'),
    path.join(bundledPythonDir, 'Lib'),
    (source) => {
      const relative = path.relative(path.join(basePythonDir, 'Lib'), source);
      const parts = relative.split(path.sep).filter(Boolean);
      return (
        parts[0] !== 'site-packages' &&
        !parts.includes('__pycache__') &&
        parts[0] !== 'test'
      );
    }
  );

  copyDependencyFiles(probe.purelib, dependencyManifest);
  fs.writeFileSync(
    path.join(bundledPythonDir, 'runtime-version.json'),
    JSON.stringify(
      {
        python: `${probe.major}.${probe.minor}`,
        runtime: probe.version,
        distributions: dependencyManifest.distributions
      },
      null,
      2
    )
  );
}

function verifyBundledRuntime(probe) {
  const runtimeCheckDir = path.join(runtimeStageDir, 'runtime-check-data');
  const checkScript = String.raw`
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'Tracklet.settings')
import django
import cryptography
import PIL
import psycopg
import yaml
import Tracklet
from pathlib import Path
import py_compile

py_compile.compile(
    str(Path('Tracklet') / 'settings.py'),
    doraise=True,
)
print('bundled-runtime-ok')
`;
  const output = runPython(
    path.join(bundledPythonDir, 'python.exe'),
    checkScript,
    {
      INVENTREE_DESKTOP_MODE: '1',
      INVENTREE_DEBUG: '0',
      INVENTREE_DESKTOP_DATA_DIR: runtimeCheckDir,
      DJANGO_SETTINGS_MODULE: 'Tracklet.settings'
    },
    bundledBackendDir
  );

  fs.rmSync(runtimeCheckDir, { recursive: true, force: true });
  console.log(`[tracklet-runtime] ${output}`);
  console.log(
    `[tracklet-runtime] validated Python ${probe.version} and ${
      fs.readdirSync(path.join(bundledPythonDir, 'Lib', 'site-packages')).length
    } staged site-packages entries`
  );
}

function main() {
  const pythonPath = resolvePython();
  const probe = getPythonProbe(pythonPath);
  const runtimeRequirements = {
    names: parseRequirementNames(),
    sitePackages: probe.purelib
  };
  const dependencyManifest = getRuntimeDependencyManifest(
    pythonPath,
    runtimeRequirements
  );

  if (process.platform === 'win32' && !/^3\.11\./.test(probe.version)) {
    fail(
      `Tracklet Windows packaging requires Python 3.11.x; found ${probe.version}.`
    );
  }

  fs.rmSync(runtimeStageDir, { recursive: true, force: true });
  fs.mkdirSync(runtimeDir, { recursive: true });
  copyBundledBackend();
  copyPythonRuntime(pythonPath, probe, dependencyManifest);

  fs.writeFileSync(
    path.join(runtimeDir, 'manifest.json'),
    JSON.stringify(
      {
        format: 1,
        python: probe.version,
        architecture: process.arch,
        backend: 'bundled',
        backendEntryPoint: 'backend/manage.py',
        dependencyCount: dependencyManifest.distributions.length,
        dependencies: dependencyManifest.distributions,
        generatedAt: new Date().toISOString()
      },
      null,
      2
    )
  );

  verifyBundledRuntime(probe);
  console.log(`[tracklet-runtime] staged portable runtime at ${runtimeDir}`);
}

main();
