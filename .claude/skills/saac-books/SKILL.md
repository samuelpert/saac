---
name: saac-books
description: Specs, stack, conventions, and feature scope for the SAAC Books web app, a new build for FIU's Student-Athlete Academic Center to lend textbooks and tech (laptops, chargers, other tech) to student-athletes and staff and to track what is out. Use this skill whenever working in the SAAC repo or whenever the user mentions SAAC, SAAC Books, the admin dashboard, UI design and styling, textbook or tech checkout and check-in, Panther ID or PID, the student or scholarship Excel import, the term book import and assigning books to students, barcode scanning and inventory labels, the Barnes & Noble book list, pull lists, receipts, return reminders, holds and the hold list, admin and staff roles and logins, the Windows host computer, backups and the restore guide, or the Prisma schema. Read it before writing any code, schema, import, or UI for this project, even if the request sounds small.
---

# SAAC Books

SAAC lends textbooks and tech to student-athletes and staff, for free, for a term. The app must always know who has what, make checkout and return fast with a barcode scanner, and give the supervisor proof on paper. A Microsoft Access database does this today. It is fast but fragile: items sometimes cannot be checked out when they should be, entry is manual, and nobody on staff can repair it when it breaks.

Design from the jobs in `references/features.md`, not from the old tables. The old app is useful for one thing only, the wording staff already use (checkout, check in, receipt). Keep the words, not the structure. The old database is never modified, and its tables are not mapped or migrated.

## Hard constraints

These shape every decision, so check new work against them.

- Zero cost. No paid services, tiers, or licenses. If a library or tool needs a bill, pick another.
- Everything runs locally on one always-on Windows computer, a desktop preferred and a laptop acceptable. It hosts PostgreSQL, the API, and the web app. No cloud hosting. Details in `references/hosting.md`.
- The host computer is a single point of failure and holds student data, so automatic backups kept off the host, a tested restore guide, and full-disk encryption are not optional.
- Student data is sensitive: names, PIDs, FIU emails, phones, scholarship status, team. Educational-records rules apply. Keep fields minimal, keep student data out of logs and error messages, and never commit real data or real files. Tests, seeds, and fixtures use fake data only.
- Staff are not developers. Every workflow must be doable by a student worker with a barcode scanner and no instructions.
- The supervisor must be able to recover from failure. Backups, a restore guide a non-developer can follow, and printed receipts are part of the product, not extras.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React + TypeScript (Vite), styled from the design tokens in `references/design.md`. Component library or template not chosen yet, it must be themeable from those tokens |
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Validation | zod, with schemas shared between web and api |
| Tests | Vitest, plus integration tests against a real throwaway Postgres |
| PDF | pdfkit (receipts, agreements, printable reports) |
| Excel/CSV | exceljs and csv-parse |
| Barcodes | Decided in the barcode step (see `references/features.md`) |
| Host | One always-on Windows computer, desktop preferred. Native PostgreSQL, one Node process serving the API and the built frontend on one port. See `references/hosting.md` |
| Dev and test | Develop on macOS with a local PostgreSQL and fake data. Test and run for real on the Windows desktop host, which has its own local PostgreSQL. Nothing is set up on the Mac just for testing |

If the user changes any of these, update this table first, then the rest of the skill.

## Scale

The student file holds 3,161 people because it is all-time history. About 1,000 are expected to carry a given term's tag (to confirm). Login accounts are a small separate group: the staff and student workers who run the desk. This is small for PostgreSQL, so do not add caching, queues, or microservices. Spend the effort on correctness (no double checkout, no lost audit entries) and on availability that is always accurate.

## Repository layout

```
(repo root)
  apps/
    web/            React + TS (Vite)
    api/            Express + TS, imports live here as admin features
  packages/
    shared/         zod schemas and types used by both apps
  prisma/
    schema.prisma
    migrations/
    seed.ts         fake data only
  fixtures/         fake files only, start from assets/students.sample.xlsx
  data-private/     real files, git-ignored, never committed
  scripts/          Node scripts that run on Windows and macOS (backup, restore check)
  docs/
    runbook.md      install, backup, restore, upgrade for non-developers
  .env.example
```

Use npm workspaces. Keep the API in layers: routes (HTTP only), services (business rules and transactions), and Prisma access inside services. Routes never talk to Prisma directly.

## Core rules

1. **Availability is derived, never stored.** A tech item is available when it is in service (not in repair, surplus, or retired) and has no open loan. Only repair, surplus, and retired are set by hand, and an item that is out cannot be moved to repair or surplus until it is checked in. A book copy is available when it is not retired, has no open loan, and is not assigned to a student's need. Nothing stores a "checked out" yes/no flag, because a flag can drift out of sync with reality, which is the likely root of the legacy bug where items could not be checked out. The database enforces one open loan per item and per copy, and one active assignment per copy, with partial unique indexes (see `references/data-model.md`).
2. **Every state change runs in one database transaction** that also writes its audit entry. If the audit write fails, the change fails.
3. **Every mutation is audited.** Record who, what, which entity, and before/after values. The audit log is append-only: no update or delete path exists in the API.
4. **Every staff action needs a logged-in user.** Local accounts with a username and password (argon2 hashes) and httpOnly session cookies. There is no self sign-up: only admins create, reset, and deactivate accounts. A session signs out after a few minutes of inactivity, with a quick switch-user action for the shared desk computer. Roles are `ADMIN` (IT and the supervisor) and `STAFF` (front desk). It is one app with two panels, and the server enforces the role, not only the screen. Only admins manage users, run imports, and add people or books. No shared logins and no hardcoded credentials.
5. **PID is 7 characters of text, digits only, leading zeros kept.** Never store or parse it as a number. Excel drops leading zeros, so the importer pads 6-digit numeric PIDs to 7 and sends anything else that is not 7 digits to a review list (see `references/student-import.md`). The database also enforces the format.
6. **Scans are first-class input.** A barcode scanner types like a keyboard and presses Enter. Keep a scan field focused on every checkout and check-in screen, submit on Enter, give instant visual and audible feedback, and keep focus in the field afterward. An unknown code gives a clear message and a path to add it, never a silent failure.
7. **Imports are safe to run twice and never delete.** Every import upserts on a natural key, shows a dry-run preview (creates, updates, unchanged, needs review), reports row-level problems without aborting the file, and never erases an existing value with a blank. A person missing from a new file is flagged for review, not deleted.
8. **Nothing sends email or marks a person on hold without a human step.** Reminders default to preview mode, and staff send them. Holds are for technology only. The hold list builds itself after the return deadline, but it only lists people: staff check it against the signed paper page, and only an admin marks someone `ON_HOLD`.
9. **Dates.** Store UTC timestamps, display in America/New_York. Terms use codes like `FALL26`, `SPRING27`, `SUMMER27`.
10. **No prices.** SAAC lends for free, so catalog tables hold no prices. If a charge ever happens, the amount is typed on that person's escalation record.
11. **Real student files never enter the repo, chat logs, or tests.** Develop and test with the fake fixture and keep real files in `data-private/`.
12. **Who can borrow what.** One function, `computeEligibility` in `packages/shared`, decides it, and `canBorrow(status, 'book' | 'tech')` answers each cart line. The dashboard, lists, search, person page and the phase 4 checkout service all use them.
    - **Athletes borrow books and tech.** Every student import is for a term and tags everyone in the file (`BorrowerTerm`); a person keeps every tag they earn. An athlete can borrow in a term when they carry its tag, the term's return deadline has not passed, and they are on scholarship. From the day after the deadline nobody borrows in that term (scholarship does not carry over) until the next term's list is imported and that term is made current. Scholarship is one yes/no on the person that every import refreshes.
    - **Staff and graduate assistants borrow tech only, never books.** They have an active switch (`Borrower.staffActive`, default on) that an admin sets on the person page; term tags, deadlines and the scholarship flag do not apply to them. Imports never change the switch.
    - Returning items is never blocked by any of this.
13. **Borrowers never log in.** Students, athletes, and staff who borrow are records, not users, and no page is shown to them. Only desk staff and admins have accounts.

## Conventions

- TypeScript `strict` everywhere. No `any` without a comment explaining why.
- Validate every request body, query, and imported row with zod. Reuse the shared schemas on the frontend forms.
- Prisma migrations only. Never edit the database by hand. Raw SQL belongs inside a migration file.
- REST names: `/api/borrowers`, `/api/books`, `/api/copies`, `/api/items`, `/api/loans/books`, `/api/loans/items`, `/api/terms`, `/api/needs`, `/api/dashboard`, `/api/imports/*`, `/api/reports/*`. Errors return `{ code, message }` with a proper HTTP status.
- Config through environment variables, documented in `.env.example`. No secrets in git.
- Follow `references/design.md` on every screen: FIU blue and gold, modern and minimal, sans-serif type, Apple-style rounded corners. Colors, radii, and fonts come from tokens only, never hardcoded in components.
- Name screens by task: Check out, Check in, Checked-out items, Checked-out books, Student books, Pull list. Item history is a page opened from any item, not a menu button. Reuse the words staff already use, not the old Access layout.
- Menu. Staff: Home, Check out, Check in, Checked-out items, Checked-out books, Student books. Admin adds Imports, Inventory, Terms, Users, Audit log, Backups, Settings. `Student books` is the screen for each student's book needs for the term (classes times titles), assigning copies, shortages, and the pull list. It is built in phase 3, and the menu item stays hidden until then.
- Print views use a print stylesheet or server-side PDF and must print cleanly on letter paper.
- Every script and npm command must run on both Windows and macOS. Write them in Node or use cross-platform packages, never bash-only.
- Keep commits small and scoped. Run lint, typecheck, and tests before declaring work done.

## Where to read next

- `references/features.md`: every feature grouped by job, the pending barcode step, acceptance criteria per phase, and the status tracker. Read before starting any feature.
- `references/dashboard.md`: the admin dashboard, widget by widget. Read before building the home screen or any count shown on it.
- `references/design.md`: colors, tokens, type, corners, components, and accessibility checks. Read before building or changing any screen.
- `references/term-books.md`: the term book import, needs, assigning copies to students, pull list, and shortage report. Read before touching books, classes, or needs.
- `references/receipt.md`: the book receipt layout, where each value comes from, and its open points. Read before building receipts, loans, or the agreement text.
- `references/student-import.md`: the student Excel import, column by column, with the data problems found in the real file. Read before touching people, imports, or teams.
- `references/data-model.md`: the proposed Prisma schema and the raw SQL a migration needs. Read before touching the schema.
- `references/hosting.md`: running on the Windows host computer, power, access from other computers, backups, the restore guide, the later live standby, security. Read before touching deployment, scripts, or backups.
- `assets/students.sample.xlsx`: a fake file in the real column layout with the known problems built in. Copy it to `fixtures/`.

## Build order

Finish each phase before starting the next, and update the tracker in `references/features.md`.

0. Scaffold, host setup, login and roles, audit log, automatic backups, and the restore guide (high priority)
1. Admin dashboard and people: dashboard shell, student import, search, person page
2. Inventory: tech items, book titles, book copies (labels wait for the barcode step)
3. Term books and needs: terms, book list import, class schedules, needs, assigning copies, pull list, shortage report
4. Lend and return: books, tech, receipts, agreements
5. Lookups and reports
6. Follow-up: reminders, escalation, holds
7. Pilot and go-live: one month of dual entry in Access and the new app, then the go-live data load
8. Later add-ons, low priority: one-click reminder button, live standby host

## Open questions

Do not guess these. Ask the user, and move the answer to Settled when it is known.

1. How does a student's class list get into the system: typed per student, imported from a file, or another source?
2. (Settled: there is no active flag. Each import is for a term and tags everyone in the file. See Settled.)
3. What are the column headers of the supervisor's semester scholarship Excel, if they differ from the sample file?
4. (Settled: an athlete who is not on scholarship cannot borrow. See rule 13. Still open: whether an admin may override, with a reason.)
5. Confirm the Sport column mapping in `references/student-import.md` (staff, GA, and tutor values are roles, `5th Year` and blank values go to review).
6. What format does the Barnes & Noble term list arrive in (columns, file type)? Does it mark required versus optional books, and is it per class or per student?
7. When copies are fewer than needs, who gets books first? Default: staff run Assign team by team in the order they choose.
8. At go-live, which loans are open today, and is any history needed? Default: load only open loans, and keep the Access file as a read-only archive.
9. What tech does SAAC lend (types and rough counts), and what is the layout of the book inventory list?
10. How do reminder emails get sent at zero cost from a local machine: FIU mail server, an Outlook mailbox, or a mail-merge export?
11. Which Windows computer will host the app (a desktop that stays on is preferred), which Windows version, can it stay on and plugged in all term, how many desk computers must reach it, which spare computer is the restore target, and where do backups go (the U: network drive, FIU OneDrive, or a copy on the supervisor's computer)? Test early that desk computers can reach the host on the FIU network.
12. Has the supervisor or FIU IT approved holding student records on this computer?
13. Default loan length for books and for tech, and who may override a due date?
14. Does SAAC ever charge for unreturned items? The receipt agreement says students are financially responsible for lost items and technology, so default to yes and keep the `CHARGED` stage and the optional charge amount.
15. Barcode step decisions: what a label encodes, label format, scanner model, and label printer. This also decides whether staff may add book copies at an intake screen or only admins.
16. Which numbers does the supervisor want first each day? The dashboard widget list is a draft until this is answered.
17. Which two people (supervisor, IT, or the developer) are trained to run the restore guide, and where is the printed copy kept?

## Settled

- Frontend is React + TypeScript with no UI library for now. Backend is Express + TypeScript, ORM is Prisma, database is PostgreSQL.
- The database is local, on one always-on Windows computer (a desktop is preferred), with no cloud. It never runs from the network drive.
- Two panels in one app. Admins (IT and the supervisor) see everything, and front desk staff see the staff panel. Login is a username and password, and only admins create accounts. There is no sign-up.
- Students and other borrowers never log in, and there is no student-facing page. The optional availability page was dropped.
- Only admins add people and books, by import. Staff do not add students or books.
- The hold list covers technology only. It builds itself after the return deadline and exports to Excel. Staff check it against the signed paper page, and only an admin applies a hold. Staff can send return reminders after a preview. Reminders cover both books and technology.
- The restore guide is high priority and built first. A live standby host is a later add-on, and it does not replace backups or the restore guide.
- Backups run by themselves every night and hourly during desk hours (a setting), to a location off the host.
- A one-month pilot comes first: staff enter every transaction in both Access and the new app, and Access stays the official system.
- A one-click reminder button is a later, low-priority feature.
- Tech items have the statuses available, checked out, in repair, and surplus. Available and checked out are derived from loans. In repair and surplus are set by an admin with a note, and both block checkout.
- There is no "Who has this" screen and no separate "Student items" screen. Checked-out items (technology) and Checked-out books are two separate screens, each switchable between by student and by item, with a count per student and an Excel export. The hold list is a tab on Checked-out items. Item history opens from any item or tag and shows the current holder and every earlier checkout and check in. The person page shows what one person holds now and in past terms.
- Holds and the escalation steps apply to technology only. Books are different: they have their own screen and no holds.
- The hold list is ready the day after the term's return deadline, with grace days defaulting to 0.
- Scholarship is a yes/no field on the person. There is no separate do-not-borrow list.
- No book or tech prices are stored in the catalog.
- SAAC keeps an inventory of its own books, one record per physical copy, with barcodes. Details come in the barcode step.
- Every term the book list is imported and books are assigned to students by need.
- The admin dashboard is built first.
- The student import columns are the ones in `assets/students.sample.xlsx`. CSV works as well as Excel.
- Legacy Access tables are out of scope. The design starts from first principles.
- The look is modern and minimal in FIU blue and gold, with a sans-serif font and Apple-style rounded corners. Details in `references/design.md`.
- Phase 1 change (user decision): active/inactive no longer applies to students. Athletes carry a term tag per import (FALL26, SPRING27, ...) and borrow books and tech with that tag, an open term and a scholarship. Staff and graduate assistants keep an active switch and borrow tech only. Details in rule 12 and `references/student-import.md`.
- Phase 0 choice: no component library. Plain CSS classes in `apps/web/src/styles/base.css`, all values from `tokens.css`. Icons are Lucide. Data fetching is TanStack Query. A test fails if any hex color appears outside `tokens.css`.
- Sessions are rows in a `Session` table with an httpOnly, SameSite=Strict cookie. Changes must carry the `x-saac-request: 1` header. Automatic refreshes send `x-saac-background: 1` and do not keep a session alive.
- The design handoff (`docs/design-handoff/`) includes the FIU panther and SAAC wordmark images supplied by the user; they are used in the sidebar and sign-in screen. design.md still asks for the supervisor's OK before using FIU marks.
