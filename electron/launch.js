const { spawn } = require('node:child_process');
const path = require('node:path');

const electronBinary = require('electron');
const appPath = path.resolve(__dirname);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, [appPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  windowsHide: false
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1);
  }

  process.exit(code ?? 0);
});
