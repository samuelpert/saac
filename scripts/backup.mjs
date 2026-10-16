// Back up the database with pg_dump and record the result for the dashboard.
// Runs on Windows and macOS. Schedule it with Task Scheduler (see docs/runbook.md).
//
//   node scripts/backup.mjs --kind nightly     keep 30 days
//   node scripts/backup.mjs --kind hourly      keep 2 days
//
// Every attempt writes a BackupRun row, success or failure, so a failure is never silent.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';

const KEEP_DAYS = { hourly: 2, nightly: 30 };

const { values } = parseArgs({ options: { kind: { type: 'string', default: 'nightly' } } });
const kind = values.kind;
if (!(kind in KEEP_DAYS)) {
  console.error('Use --kind hourly or --kind nightly');
  process.exit(2);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
const dir = path.resolve(process.env.BACKUP_DIR || './backups');
const pgDump = process.env.PG_DUMP_PATH || 'pg_dump';

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
const file = path.join(dir, `saac-${kind}-${stamp}.dump`);

function runDump() {
  const u = new URL(databaseUrl);
  const args = ['--format=custom', '--no-owner', `--file=${file}`, `--host=${u.hostname}`, `--port=${u.port || '5432'}`, `--username=${decodeURIComponent(u.username)}`, u.pathname.slice(1)];
  return new Promise((resolve, reject) => {
    // The password goes in the environment, not the command line, so it does not show in process lists.
    const child = spawn(pgDump, args, { env: { ...process.env, PGPASSWORD: decodeURIComponent(u.password) }, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump exited with ${code}: ${stderr.trim().slice(0, 500)}`))));
  });
}

async function prune() {
  const cutoff = Date.now() - KEEP_DAYS[kind] * 86_400_000;
  for (const name of await readdir(dir)) {
    if (!name.startsWith(`saac-${kind}-`) || !name.endsWith('.dump')) continue;
    const full = path.join(dir, name);
    if ((await stat(full)).mtimeMs < cutoff) await unlink(full);
  }
}

async function record(ok, sizeBytes, message) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('INSERT INTO "BackupRun" ("id", "at", "ok", "location", "sizeBytes", "message") VALUES (gen_random_uuid()::text, now(), $1, $2, $3, $4)', [ok, dir, sizeBytes, message]);
  } finally {
    await client.end();
  }
}

try {
  await mkdir(dir, { recursive: true });
  await runDump();
  const { size } = await stat(file);
  await prune();
  await record(true, size, `${kind} backup ${path.basename(file)}`);
  console.log(`Backup written: ${file} (${size} bytes)`);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Backup failed: ${message}`);
  await record(false, null, `${kind} backup failed: ${message}`).catch((e) => console.error(`Could not record the failure: ${e.message}`));
  process.exit(1);
}
