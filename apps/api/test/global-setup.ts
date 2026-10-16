/**
 * Creates a throwaway database for the test run from TEST_DATABASE_URL (or DATABASE_URL),
 * applies every migration, and drops it afterwards. The role needs CREATEDB.
 * Without either variable the database tests are skipped and say so.
 */
import { execFileSync } from 'node:child_process';
import 'dotenv/config';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string | null;
  }
}

export default async function setup(project: TestProject) {
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) {
    console.warn('[test] No TEST_DATABASE_URL or DATABASE_URL: database tests are skipped.');
    project.provide('testDatabaseUrl', null);
    return;
  }
  const name = `saac_test_${Date.now()}_${process.pid}`;
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  const url = new URL(base);
  url.pathname = `/${name}`;
  const testUrl = url.toString();
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'ignore',
  });
  project.provide('testDatabaseUrl', testUrl);

  return async () => {
    const c = new pg.Client({ connectionString: base });
    await c.connect();
    await c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await c.end();
  };
}
