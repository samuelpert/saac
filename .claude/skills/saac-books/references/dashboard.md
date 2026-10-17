# Admin dashboard

Contents: purpose, who sees what, layout, widgets, rules, acceptance.

## 1. Purpose

One screen that answers "is everything okay, and what needs me today?" It is the first screen after login and the first thing built (phase 1). Widgets that depend on later phases show an empty state until their data exists, so the dashboard grows as the app does.

## 2. Who sees what

`ADMIN` sees everything. `STAFF` sees the term selector, scan box, tiles, attention queue, and quick actions, but not recent activity, imports, system health, or user management. Sections marked (A) below are admin only. Both roles can open the hold list, and only `ADMIN` sees the action that applies a hold.

## 3. Layout

```
+---------------------------------------------------------------+
| Term: FALL26 v          Scan or search: [___________________] |
+---------------------------------------------------------------+
| People  | Books out | Tech out | Past due | Holds | Deadline   |
+--------------------------------+------------------------------+
| Needs attention                | Return progress by team      |
| one row per problem, each      | bar per team, returned vs    |
| a link to the fix              | still out                    |
+--------------------------------+------------------------------+
| Books this term                | Inventory health             |
| needed, assigned, issued,      | tech by type, copies by      |
| short                          | status                       |
+--------------------------------+------------------------------+
| Recent activity (A) | Imports (A) | System health (A)         |
+---------------------------------------------------------------+
```

Quick actions (Check out, Check in, Checked-out items, Checked-out books, Import students, Import books) sit in the header or a side rail. Import buttons are admin only. The layout must fit a 1366 by 768 screen without scrolling the tiles off view.

Styling follows `design.md`: white cards with continuous 20 px corners on a light gray page, a FIU Blue sidebar, and gold used only as a thin accent. See section 8 of that file for the dashboard specifics.

## 4. Widgets

Tiles, all for the selected term unless noted:

| Tile | Shows | Definition | Opens |
| --- | --- | --- | --- |
| People | People tagged for the selected term, split athletes and staff | Has a `BorrowerTerm` row for the term | People list, filtered to the term |
| Books out | Open book loans | `closedAt IS NULL` | Checked-out books |
| Tech out | Open tech loans | `closedAt IS NULL` | Checked-out items |
| Past due | Open loans past their due date | Open and `dueDate` before now, books and tech | Checked-out items or books, past due filter |
| Holds | People pending review or on hold | Escalation stage `HOLD_PENDING_REVIEW` or `ON_HOLD` | Hold list tab on Checked-out items |
| Deadline | Days to the return deadline and how many people still hold items | Term `returnDeadline`, people with an open loan | Checked-out items and books |

Panels:

| Panel | Shows | Opens |
| --- | --- | --- |
| Needs attention | Only rows with a count above zero: the current term has ended and the next term's list is not in yet (A, says the next step: add the term, import its list, or make it current), import rows to review, past due with no reminder sent, reminders waiting for preview, the hold list ready after the return deadline, holds waiting for an admin, titles short, assignments not picked up, backup too old (A) | The screen that fixes it |
| Return progress by team | Per team: people with items out, loans returned versus total, sorted by most outstanding. A plain horizontal bar is enough | Checked-out items and books filtered to the team |
| Books this term | Needs by state: needed, assigned, issued, waived. Short count highlighted | Student books, shortage report |
| Inventory health | Tech by type: available, out, in repair, surplus, retired. Copies: available, assigned, out, retired | Inventory screens |
| Recent activity (A) | Last 20 audit entries: time, user, action, short entity label | Audit log |
| Imports (A) | Last import of each kind: date, user, counts, unresolved review rows | Import history |
| System health (A) | Last backup time and result, free disk space on the host, database size, app uptime | Backup details |

## 5. Rules

- Every number is computed from the live tables with the same definitions the reports use. No stored counters and no cached totals, so the dashboard can never disagree with a list.
- Every number opens a list showing exactly the rows it counted.
- The dashboard shows counts. Names appear only after a click. Recent activity shows short labels, never contact details.
- Every tile and panel has an empty state that says what is missing and links to the fix, for example "No book list imported for FALL26 yet".
- One API call, `/api/dashboard?term=`, returns all widgets. Each widget fails on its own, so one broken query shows an error in that widget and not a blank page.
- It loads in under 2 seconds with the full 3,161-person table.
- Refresh on window focus and every 60 seconds.
- The term selector defaults to the current term. Past terms are read-only.
- Never rely on color alone. Past due is red and also carries an icon or the word "past due".
- The backup is too old when the last successful `BackupRun` is older than a setting (default 30 hours). That turns system health red and adds a row to the attention queue.

## 6. Acceptance

- With the fake fixtures loaded, each tile equals a direct count query.
- Clicking each tile lists exactly the counted rows.
- Making one widget's query fail leaves the others working.
- A stale backup turns system health red and shows up in the attention queue.
- A `STAFF` user cannot see or call the admin-only widgets.

## 7. Still to confirm

Which numbers the supervisor wants first each day (open question 16). Treat the widget list above as a draft until then.
