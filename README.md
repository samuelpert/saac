# SAAC Books

Textbook and tech lending for FIU's Student-Athlete Academic Center. One Node process serves the API and the web app on one port, backed by a local PostgreSQL database on the host computer.

Specs, rules and open questions live in `.claude/skills/saac-books/` (start with `SKILL.md`). The design handoff is in `docs/design-handoff/`. Running the app on the Windows host, backups and the restore guide are in `docs/runbook.md`.

## Status

- Phase 0 (scaffold and host): partly done. Monorepo, schema and migrations, login with roles, idle sign-out, audit log, backup script. Still open: Windows service setup, HTTPS between computers, the tested restore guide.
- Phase 1 (admin dashboard and people): done, waiting for the supervisor's review of the dashboard.

## Development (macOS or Windows)

Needs Node 22.12 or later and PostgreSQL 16 or later.

```sh
npm install
cp .env.example .env              # then set DATABASE_URL to your local database
npm run db:migrate                # apply migrations
npm run db:seed                   # FAKE data only; prints the dev password (or set SEED_PASSWORD)
npm run dev                       # API on :3000, web on http://localhost:5173
```

The seed creates two logins, `admin` (admin) and `desk` (front desk). To start over: `npx prisma migrate reset --force`.

On a fresh install with no seed, create the first admin with `npm run user:create -- --username <name> --name "<Full Name>" --role ADMIN`.

## Checks

```sh
npm run lint
npm run typecheck
npm test                          # unit and integration tests
```

Integration tests create a throwaway database from `TEST_DATABASE_URL` (or `DATABASE_URL`), so that role needs `CREATEDB`. Without a database URL they are skipped and say so.

## Production build

```sh
npm run build
npm start                         # http://localhost:3000
```

## Layout

```
apps/web          React + TypeScript (Vite). Styles come from src/styles/tokens.css only.
apps/api          Express + TypeScript. routes/ (HTTP only) -> services/ (rules, transactions, Prisma)
packages/shared   zod schemas and types used by both
prisma/           schema, migrations (with hand-written SQL), fake-data seed
fixtures/         fake files only
data-private/     real files, git-ignored
scripts/          cross-platform Node scripts: backup, create user, dev runner
docs/             runbook and design handoff
```

Real student files never go in the repo. Put them in `data-private/`.
