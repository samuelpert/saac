# SAAC Books: features

Contents: 1 feature catalog by job, 2 the barcode step (pending), 3 phases with acceptance criteria, 4 status tracker.

Priority: P1 is needed at go-live, P2 soon after, P3 later.

## 1. Feature catalog by job

### A. People

| ID | Feature | P |
| --- | --- | --- |
| A1 | Person record: PID, name, email, phone, team, role, scholarship yes/no, the term tags they carry, and for staff an active switch. Shows what they can borrow now: students (athletes and graduate assistants) books and tech, staff tech only. An admin switches a student's scholarship on the profile | P1 |
| A2 | Import the student list for a term (`.xlsx` or `.csv`): everyone in the file gets that term's tag. Dry run, review list, and no deletes. Admin only. Spec in `student-import.md` | P1 |
| A3 | Search as you type by PID or name. Clicking a person's name in any list opens a small card: photo placeholder (no photos for now), first name, last name and Panther ID, each with a copy button, and a link to the person page. The person page shows classes, books and tech held now with counts by type, what they held in past terms, scholarship, team, and contact | P1 |
| A4 | Add or edit a person by hand for the rare late addition. Admin only, staff do not add people | P1 |
| A5 | Teams with coach name and email, used by reports and escalation | P2 |

### B. Inventory

| ID | Feature | P |
| --- | --- | --- |
| B1 | Tech items: type, name or number, asset tag, status (available, checked out, in repair, surplus), retire without losing history | P1 |
| B2 | Book titles, admin only: from the bookstore list, manual add and edit, Open Library lookup by ISBN to fill gaps (cached, works offline) | P1 |
| B3 | Book copies: every physical book SAAC owns is its own record, counted per title, so the app knows how many are on the shelf and who has one. Copies carry no labels; the ISBN on the cover identifies the title at the desk. Admins add and retire copies | P1 |
| B4 | Inventory screens: copies per title, condition, status, who holds each | P2 |
| B5 | Print labels for items and copies. Design is pending, see section 2 | P1 |
| B6 | Tech status: an admin sets In repair or Surplus with a note, such as a broken screen. Both block checkout, and an item that is out must be checked in first. Available and Checked out are derived from loans, never set by hand | P1 |

### C. Term books and needs

Spec in `term-books.md`.

| ID | Feature | P |
| --- | --- | --- |
| C1 | Terms: code, dates, return deadline, current term. The agreement defines the deadline as three business days after the last official final exam, so the form can suggest it from the last exam date, and an admin can change it | P1 |
| C2 | Import the term's book list (Barnes & Noble) every term, admin only: classes, titles, and which classes need which titles. Preview, idempotent, shows what changed since the last list. Format pending | P1 |
| C3 | Class schedule per person per term. Quick manual entry (subject, catalog, section) and bulk import if a source exists. Source is open question 1 | P1 |
| C4 | Needs: for each person and term, the titles they need (their classes times each class's titles, or straight from the list if it names students), minus what they already hold. Staff can add, waive, or cancel a need by hand | P1 |
| C5 | Assign books: reserve an available copy for each need, by person, by team, or for the whole term. Preview first. Needs with no available copy show as short. Staff can reassign or release a copy | P1 |
| C6 | Pull list: for one person or a whole team, the reserved titles to pull (title, ISBN, how many), printable, feeds checkout | P1 |
| C7 | Shortage report: titles needed versus copies available, with the quantity to order from the bookstore | P2 |

### D. Lend

| ID | Feature | P |
| --- | --- | --- |
| D1 | Book checkout: find the person, scan each book's ISBN into a cart, review, check out. The app picks the copy reserved for that person, else any copy on the shelf. An assigned copy fulfils its need. All rows commit together or none | P1 |
| D2 | Tech checkout: scan the item, record condition and comments such as a broken screen | P1 |
| D3 | Book receipt (printed title `SAAC Book Receipt`), a PDF per person per term in the layout in `receipt.md`: books grouped by class, each line with transaction number, ISBN, item name, edition, bookstore checkbox, checked out and due dates, and two blanks on the left (received by student) and two on the right (returned to SAAC), then the agreement and signature lines. Kept on paper as the fallback if the system is down | P1 |
| D4 | Tech agreement printout: the item filled in, condition and comments, signature line, no hand-filling. Use the existing paper agreement as the template | P1 |
| D5 | Due dates default from the term's return deadline. An override needs a reason. Tech can be renewed | P1 |
| D6 | Late additions: add a class or a book by hand after the term starts | P1 |

### E. Return

| ID | Feature | P |
| --- | --- | --- |
| E1 | Check in by scan. A tech tag alone finds its open loan. A book's ISBN finds the title; if more than one person has it, staff pick the person or scan their Panther ID first | P1 |
| E2 | Condition and notes on return | P1 |
| E3 | Not for return: close a loan without a return (kept, lost, bought out) with a reason | P1 |
| E4 | Partial returns: some items on a receipt returned, the rest still out | P1 |

### F. Lookups and reports

| ID | Feature | P |
| --- | --- | --- |
| F1 | Checked-out items (technology): every tech item out now, switchable between by student (each person with their items and a count, with a filter for people holding more than one) and by item (each tag with its holder). Search by PID, name, or a scanned tag. Past due in red, grouped by team, filter by term, export to Excel, print. Tabs: Now, Past due, and the hold list (G3) | P1 |
| F2 | Checked-out books: the same screen for book copies, by student or by title and copy. A separate screen from tech. Its Hold list and Holds tabs show the same people as the tech screen, because holds cover books and tech | P1 |
| F3 | Item history: open any tech item or book copy from a list or by scanning its tag and see who has it now (person, due date, contact) and its whole history: every checkout and check in with person, dates, and condition, plus status changes such as repair or surplus. It is a page, not a separate menu button | P1 |

### G. Follow-up

| ID | Feature | P |
| --- | --- | --- |
| G1 | End-of-term reminder emails: one personalized email per person listing everything they still hold, books and technology, with the due dates. Preview first, staff can exclude people and send them, every send is logged. People with no email are listed for another route such as phone or coach | P2 |
| G2 | Escalation per person per term, for books and technology: reminded, coach notified, hold pending review, on hold, charged, resolved | P2 |
| G3 | Hold list (user decisions, October 2026: holds cover books and tech; the list is computed, so a person who returns everything drops off it at once and the Excel export always matches; an applied hold is released by an admin by hand, which sets the stage to resolved and is audited; no reminder row): the day after the term's return deadline (plus optional grace days, default 0) the system builds, by itself, the list of everyone who still has a book or a tech item open: person, team, coach, pending items, due date, days late, reminders sent. It exports to Excel in the shape the desk uses today. Staff check each row against the signed paper page, and only an admin marks a person on hold. The system never marks anyone by itself. It is a tab on Checked-out items | P2 |
| G4 | Optional charge amount typed on the escalation record | P3 |
| G5 | One-click reminder: a button on a person or on the hold list that creates the reminder and emails it in one step. Later, low priority. Needs the sending route from open question 10 | P3 |

### H. Records

| ID | Feature | P |
| --- | --- | --- |
| H1 | Audit log viewer: who changed what and when, filter by person, item, user, date | P1 |
| H2 | Reprint any receipt or agreement | P1 |
| H3 | Export anything shown on screen to Excel or CSV | P2 |

### I. Admin

| ID | Feature | P |
| --- | --- | --- |
| I1 | Login panel: username and password, accounts created only by admins, no sign-up. Users and roles (`ADMIN`, `STAFF`), password reset, disable instead of delete, sign out when idle | P1 |
| I2 | Automatic backups: `pg_dump` every night and hourly during desk hours, to a location off the host. Last backup time and status show on the dashboard. Details in `hosting.md` | P1 |
| I3 | Import history: file name, hash, who, when, counts | P1 |
| I4 | Settings: default loan length for books and tech, hold grace days after the return deadline (default 0), reminder template, current term, idle sign-out time, backup schedule and the alert age, receipt agreement text, Sport column mapping | P2 |
| I5 | Restore guide in `docs/runbook.md`: bring the app back on a spare computer from the latest backup in about 30 minutes, written for a non-developer, tested once by someone who did not write it, with the paper fallback for the downtime. High priority, built first. Steps in `hosting.md` | P1 |
| I6 | Live standby: a second computer kept in sync with the host through PostgreSQL replication, able to take over in minutes. It does not replace backups or the restore guide. Build it only if the pilot shows downtime is a real problem | P3 |

### J. Access and roles

One app, two panels. The server enforces the role, not only the screen.

| ID | Feature | P |
| --- | --- | --- |
| J1 | Admin panel for IT and the supervisor: everything staff can do, plus users, imports, adding people and books, term setup, settings, audit log, backup status, and applying holds | P1 |
| J2 | Staff panel for the front desk: check out, check in, checked-out items, checked-out books, student books (needs, assigning, pull lists), item history, search, assign copies, receipts, send reminders after the preview, view and export the hold list | P1 |
| J3 | Borrowers never log in and there is no student-facing page | P1 |

| Action | Admin | Staff |
| --- | --- | --- |
| Check out, check in, checked-out items and books, item history, search, receipts, pull lists | yes | yes |
| Assign copies to needs | yes | yes |
| Send return reminders after the preview | yes | yes |
| View and export the hold list | yes | yes |
| Apply or release a hold | yes | no |
| Import students, scholarship list, book list, book CSV | yes | no |
| Add or edit people and book titles | yes | no |
| Add, edit, or retire tech items and book copies | yes | decided in the barcode step |
| Users, passwords, settings, term setup | yes | no |
| Audit log, backup status, import history | yes | no |

### K. Admin dashboard (build first)

Spec in `dashboard.md`.

| ID | Feature | P |
| --- | --- | --- |
| K1 | Admin home: tiles, attention queue, return progress by team, books this term, inventory health, recent activity, imports, system health | P1 |
| K2 | One search box on Home: a PID or name shows the student and what they hold now; a tech tag shows who has the item and its history; a book's ISBN shows the title, copies on the shelf and who has the others. Scanned barcodes work the same as typing | P1 |
| K3 | Attention queue, admin only: everything that needs a human today, each row a link to the fix | P1 |
| K4 | Staff home: the same without the attention queue, imports, system health, or user management. Recent activity is shown to staff too | P1 |

## 2. The barcode step (decided October 2026)

The user's decisions:

- Tech items: a barcode is Code 128 of the item's existing saved tag (`SAACLAPTOP942`). There is no second identifier just for the barcode, and no new table or field.
- Books: no labels. The ISBN barcode printed on the cover is scanned (EAN-13; an ISBN-10 is converted). An ISBN identifies the title, not the copy, so book loans are found by person and title. Copy records stay, counted per title, with internal numbers (C-00001) that are never printed.
- Barcodes are drawn on demand in the browser with JsBarcode, never stored in PostgreSQL, and never fetched from an outside service. The same identifier always gives the same barcode.
- After a tech item is saved, its barcode shows with **Download Barcode** (SVG, with the identifier printed under the bars) and **Print Barcode**. A numbered run offers one print sheet with every new barcode. Each item's page shows its barcode again at any time. A tag or copy tag that a barcode cannot hold gives a clear message instead of a wrong barcode.
- Changing a tag changes its barcode, so the edit form warns that a new label must be printed.
- A USB or Bluetooth scanner in keyboard mode types the identifier and Enter into the scan field. An exact tech tag finds only its own item; an ISBN finds its title. An unknown code shows "Barcode not recognized. Please try again." and never offers to register an item; scanning never creates or changes inventory.
- Who may add items and download barcodes follows the existing rules: admins add items, and every signed-in user can open an item's page.
- Still open: the label printer and sticker size, and the scanner model. Neither changes the code.

## 3. Phases and acceptance criteria

**Phase 0: scaffold and host**
- One command starts the app from `.env`, on Windows and on macOS.
- Admin and staff roles work, and unauthenticated requests are rejected.
- Any mutation writes an audit row in the same transaction.
- On the Windows host the app runs as one process on one port and starts again by itself after a reboot or a power cut.
- Login is a username and password, there is no sign-up, only an admin can create accounts, and an idle session signs out.
- Backups run by themselves every night and hourly during desk hours to a location off the host, and the dashboard shows the last success.
- The restore guide exists in `docs/runbook.md`, and someone who did not write it used it to bring the app up on a different computer from the latest backup in about 30 minutes.
- The design tokens from `design.md` live in one file and the first screen uses only tokens.

**Phase 1: admin dashboard and people**
- The dashboard loads in under 2 seconds with the full 3,161-person table, and every widget has an empty state.
- Every number on the dashboard opens a list with exactly those rows.
- The dashboard shows the last import and the last backup.
- Running the same student import file twice changes nothing the second time.
- The dry run lists creates, updates, unchanged, and review rows before anything is saved.
- Bad PIDs, bad phones, unknown Sport values, and duplicate PIDs are reported per row without stopping the file.
- Search finds a person by PID or name in under a second.

**Phase 2: inventory**
- A tech item can be created, retired, and never deleted.
- An admin can set a tech item to In repair or Surplus with a note. Checkout rejects such an item, and an item that is out cannot be moved to either status until it is checked in.
- A book title can be created from the book list, by hand, or by ISBN lookup, and works offline.
- Every copy is its own record, and the inventory screen shows copies per title with status.

**Phase 3: term books and needs**
- Importing the same book list twice changes nothing the second time, and the preview shows creates, updates, unchanged, and review rows.
- A person's needs match their classes and those classes' titles.
- Assigning never gives one copy to two people, even when two staff assign at the same moment.
- A need with no available copy shows as short and appears on the shortage report.
- A class or book added by hand after the term starts creates or updates the need.
- The pull list shows exactly the assigned copies.

**Phase 4: lend and return**
- A scanned ISBN or tech tag is added to the cart in under a second.
- A copy or item that is already out cannot be checked out again, and the message says who has it.
- A copy assigned to one person cannot be checked out to another.
- Checking out an assigned copy marks its need issued.
- Checkout commits all cart rows or none.
- The receipt prints on one page for a typical person and matches the paper layout.
- Scanning an out item on the check-in screen finds its loan without searching for the person.

**Phase 5: lookups and reports**
- Checked-out items lists every tech item out now, switches between by student and by item, shows a count per student, filters to people holding more than one, marks past due, and exports to Excel.
- Checked-out books does the same for book copies, on its own screen, with no hold list.
- Searching a PID, a name, or a scanned tag on either screen finds the right row in under a second.
- Item history works from a scan or a typed tag, shows the current holder first, and lists every earlier checkout, check in, and status change.
- The person page shows what one person holds now, with counts by type, and what they held in past terms.

**Phase 6: follow-up**
- Reminder preview shows each email before sending, staff can send them, and every send is logged with its status.
- The day after the return deadline (plus grace days, default 0) the hold list builds itself and lists exactly the people with anything still out, books or tech,, with team, coach, pending items, due date, days late, and reminders sent.
- The hold list exports to Excel in the shape the desk uses today, and the export matches what is on screen.
- Opening or exporting the list changes no one's stage. Only an admin can mark someone `ON_HOLD`, and a staff user calling that action is rejected.

**Phase 7: pilot and go-live**
- People load from the real student file with no term tag, then the current-term list tags the right people for the term.
- Loans open when the pilot starts are loaded by scanning at the desk or by a simple file of PID, tag, and due date.
- For one month the desk enters every transaction in both Access and the new app. Access stays the official system, and the new app never changes how the desk works.
- Each week of the pilot, list the differences between the two systems and their causes, and fix them. Also note every time the host was down and for how long.
- Go-live happens only after the supervisor reviews the pilot.
- Real files stay in `data-private/`.

**Phase 8: later add-ons (low priority)**
- One-click reminder button: on a person or on the hold list, one click creates the reminder and emails it, with the same preview and log rules as G1.
- Live standby host: a second computer replicates the database and can take over in minutes, the switchover is written in the runbook, and backups and the restore guide stay in place.

## 4. Status tracker

- [ ] Phase 0: scaffold and host. Done: monorepo, schema and migrations, login and roles, idle sign-out, audit log, backup script, runbook draft. Open: Windows service and reboot test, HTTPS between computers, backup scheduling on the host, restore guide tested by someone else
- [x] Phase 1: admin dashboard and people. Done October 2026: dashboard reviewed by the user, every phase 1 acceptance check passes. Added on request: term tags and eligibility, staff active switch, per-team scholarship workbook import, person card, item lookup and item history page
- [x] Phase 2: inventory. Done October 2026, barcodes included: Inventory screen with Tech and Books tabs, admin only. Tech items are added one at a time or as a numbered run, edited, set in repair or surplus with a note, retired and restored, never deleted; an item that is out cannot change status or be retired until it is checked in. Book titles are added by hand or by ISBN lookup on Open Library (cached, offline falls back to typing); copies are added in bulk with numbered tags (C-00001...) or one with an existing label, edited, retired and restored. Item history shows status changes from the audit log
- [ ] Phase 3: term books and needs
- [ ] Phase 4: lend and return
- [ ] Phase 5: lookups and reports
- [ ] Phase 6: follow-up
- [ ] Phase 7: pilot and go-live
- [ ] Phase 8: later add-ons (reminder button, live standby)
