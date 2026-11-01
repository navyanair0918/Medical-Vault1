const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const serviceDirectory = __dirname;
const projectDirectory = path.resolve(serviceDirectory, '..');
const pythonInVenv = path.join(
  serviceDirectory,
  '.venv',
  process.platform === 'win32' ? 'Scripts' : 'bin',
  process.platform === 'win32' ? 'python.exe' : 'python'
);
const python = existsSync(pythonInVenv) ? pythonInVenv : process.env.PYTHON || 'python';

if (!existsSync(pythonInVenv)) {
  console.warn('[ml-service] No ml-service/.venv found; starting with system Python. Install ml-service/requirements.txt first.');
}

const processHandle = spawn(
  python,
  ['-m', 'uvicorn', 'app:app', '--reload', '--port', '8001', '--app-dir', serviceDirectory],
  { cwd: projectDirectory, stdio: 'inherit' }
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => processHandle.kill(signal));
}

processHandle.on('error', error => {
  console.error(`[ml-service] Could not start Python: ${error.message}`);
  process.exitCode = 1;
});

processHandle.on('exit', (code, signal) => {
  if (signal) console.log(`[ml-service] Stopped after ${signal}.`);
  process.exitCode = code ?? 1;
});
