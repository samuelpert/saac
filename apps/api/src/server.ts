import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { loadConfig } from './config';
import { createDb } from './db';
import { createServices } from './services';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const services = createServices(db, config);

// Serve the built web app when it exists (apps/web/dist). In development Vite serves it instead.
const here = path.dirname(fileURLToPath(import.meta.url));
const builtWeb = path.resolve(here, '../../web/dist');
const webDist = existsSync(builtWeb) ? builtWeb : undefined;

const app = createApp(services, { cookieSecure: config.COOKIE_SECURE, idleMinutes: config.SESSION_IDLE_MINUTES, webDist });

const server = app.listen(config.PORT, () => {
  console.log(`[saac] listening on http://localhost:${config.PORT}${webDist ? '' : ' (API only; run the web dev server for the UI)'}`);
});

const purge = setInterval(() => void services.auth.purgeExpired().catch(() => undefined), 10 * 60_000);

function shutdown() {
  clearInterval(purge);
  server.close(() => void db.$disconnect().finally(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
