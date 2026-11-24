// Runs the game server and the Vite dev server side by side.
import { spawn } from 'node:child_process';

const procs = [
  ['server', ['run', 'dev:server']],
  ['client', ['run', 'dev:client']],
].map(([name, args]) => {
  const p = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const tag = name === 'server' ? '\x1b[33m[server]\x1b[0m ' : '\x1b[36m[client]\x1b[0m ';
  const pipe = (stream, out) => stream.on('data', (d) => {
    for (const line of d.toString().split('\n')) if (line.trim()) out.write(tag + line + '\n');
  });
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  p.on('exit', (code) => { console.log(`${tag}exited (${code})`); shutdown(code ?? 0); });
  return p;
});

function shutdown(code) {
  for (const p of procs) if (!p.killed) p.kill();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
