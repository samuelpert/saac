// Start the API and the web dev server together. Works on Windows and macOS.
import { spawn } from 'node:child_process';

const procs = ['@saac/api', '@saac/web'].map((ws) =>
  spawn('npm', ['run', 'dev', '-w', ws], { stdio: 'inherit', shell: process.platform === 'win32' }),
);
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code) { stop(); process.exitCode = code; } });
