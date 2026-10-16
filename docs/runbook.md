# SAAC Books runbook

For the supervisor, IT, or a student worker. Every command can be copied as is. Run commands in **PowerShell** from the app folder (for example `C:\SAAC\saac-books`) unless a step says otherwise.

> Status: draft. Written during phase 1. It still needs the Windows service steps, the HTTPS decision, and a full test by someone who did not write it (phase 0 acceptance).

## 1. What runs where

| Piece | Where |
| --- | --- |
| Database | PostgreSQL on the host computer, listening on `localhost` only |
| App | One Node process, `npm start`, on the port in `.env` (default 3000) |
| Backups | `scripts/backup.mjs`, run by Task Scheduler, written to the folder in `BACKUP_DIR` |
| Settings | `.env` in the app folder. Never in git. Only the account that runs the app can read it |

## 2. First install

1. Install PostgreSQL (current supported major version) from postgresql.org and Node.js LTS (22 or later) from nodejs.org. Write the exact versions here: PostgreSQL `__`, Node `__`.
2. Create the database and its own user. Open **SQL Shell (psql)** as `postgres` and run, with a long random password:
   ```sql
   CREATE ROLE saac LOGIN PASSWORD 'replace-with-a-long-random-password';
   CREATE DATABASE saac OWNER saac;
   ```
3. Copy the app folder to the host, then:
   ```powershell
   npm ci
   Copy-Item .env.example .env
   notepad .env      # set DATABASE_URL to postgresql://saac:<password>@localhost:5432/saac
   npm run db:migrate
   npm run build
   ```
4. Create the first admin. It asks for a temporary password, which must be changed at first sign-in:
   ```powershell
   npm run user:create -- --username jdoe --name "Jane Doe" --role ADMIN
   ```
5. Start it: `npm start`, then open `http://localhost:3000`.

Never run `npm run db:seed` on the host. It loads fake data and refuses to run with `NODE_ENV=production`.

## 3. Backups

The script writes a `BackupRun` row on every attempt. The dashboard turns red when the last good backup is older than `BACKUP_STALE_HOURS` (default 30).

Test it once by hand:
```powershell
npm run backup -- --kind nightly
```

Schedule it in **Task Scheduler** (Create Task, not Basic Task):

- General: "Run whether user is logged on or not". Use an account with write access to the backup folder.
- Triggers: daily at night for `--kind nightly`, and hourly during desk hours for `--kind hourly`.
- Action: Program `node`, arguments `scripts\backup.mjs --kind nightly`, start in the app folder.
- Scheduled tasks cannot see mapped drive letters. In `.env`, set `BACKUP_DIR` to the full network path, for example `\\server\share\SAAC\backups`, never `U:\`.
- If the account's password changes, the task fails until someone updates it here.
- If `pg_dump` is not found, set `PG_DUMP_PATH` in `.env`, for example `C:\Program Files\PostgreSQL\16\bin\pg_dump.exe`.

Hourly copies are kept 2 days, nightly copies 30 days.

## 4. Restore on a spare computer (target: about 30 minutes)

1. On the spare computer, install the same PostgreSQL major version and Node as the host (versions in section 2).
2. Copy the latest built app folder from the backup location.
3. Create the database and user as in section 2 step 2, with a new password.
4. Create `.env` from `.env.example` with the new password.
5. Restore the latest dump (newest `saac-nightly-*.dump` or `saac-hourly-*.dump`):
   ```powershell
   & "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" --no-owner --dbname=saac --username=saac --host=localhost "\\server\share\SAAC\backups\saac-hourly-YYYYMMDD-HHMM.dump"
   ```
6. `npm start`, open `http://localhost:3000`, sign in as an admin.
7. Check: find a person with an open loan, confirm the last transaction is there, run `npm run backup -- --kind nightly` and confirm the file lands in the backup folder.
8. Point the desk computers to the new address.
9. Keep using the paper receipts until step 7 passes, then enter what happened during the downtime.

## 5. Accounts

- Admins create accounts on **Users**. There is no sign-up and no shared login.
- A reset gives a temporary password and signs the person out everywhere.
- Disable an account instead of deleting it, so the audit log keeps its name.
- A session signs out after `SESSION_IDLE_MINUTES` (default 15) without use. "Switch user" in the sidebar signs out at once for the next person.
