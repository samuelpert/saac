# Hosting on the Windows host computer

Contents: setup, power and uptime, reaching the app, backups, security, failure and recovery, the restore guide, live standby (later), approval.

The database and the app live on one always-on Windows computer, with no cloud. A desktop is preferred over a laptop because it has no lid or battery and is easy to keep on a wired connection, but a laptop works. That is cheap and simple, and it also means one machine holds everything. This file lists what keeps that safe.

## 1. Setup

- Machine: a Windows version that still gets security updates (Windows 11 preferred). For about 3,000 people, 8 GB of RAM and 50 GB of free disk is plenty. Prefer a wired network connection.
- PostgreSQL: the official Windows installer from postgresql.org, current supported major version. It listens on `localhost` only. The app uses its own database user with a strong password, separate from the admin password.
- App: build once. One Node process serves the API and the built frontend on one port, so there is one thing to start and one address to open.
- Config: a `.env` file readable only by the account that runs the app. Never in git. `OPEN_LIBRARY_LOOKUP=false` turns off the one outside call the app makes (filling in a book title from its ISBN).
- Start at boot, without anyone logging in: a Windows service or a Task Scheduler task set to "Run whether user is logged on or not" with restart on failure. Pick one in phase 0 and write the steps in `docs/runbook.md`.
- Native install, not Docker. There is no virtualization to configure and fewer moving parts for someone who is not a developer to maintain.
- Time zone America/New_York with time sync on.
- Development happens on a Mac with a local PostgreSQL and fake data. Real testing and the live run happen on this Windows host, which has its own local PostgreSQL. Every script must run on both.

## 2. Power and uptime

- Keep it plugged in and on. Set the power plan to never sleep when plugged in, and on a laptop set the lid close action to "do nothing".
- Set Windows Update active hours to the desk's opening hours so the host does not reboot mid-shift.
- A power cut or crash is safe for the data. PostgreSQL writes every change to a log first and recovers by itself when it starts again, and a checkout commits all rows or none, so there is never a half saved cart. At most the checkout in progress at that moment is lost. Prove it in phase 0 by cutting the power during a test checkout.
- After any reboot the app must come back on its own, so test that in phase 0.
- While the host is down the desk works from the paper receipts and enters the transactions afterward.
- A small battery backup (UPS) covers short power cuts. It is the only item here that costs money, so it is optional.

## 3. Reaching the app

- If staff use the host itself, open `http://localhost:PORT`. Nothing else is needed.
- If other computers must reach it, they open the host's address on the FIU network. This needs a fixed address or reserved name (ask FIU IT), and a Windows Firewall rule that allows only the app port inbound. Never open the PostgreSQL port to the network.
- Many campus networks, especially Wi-Fi, block computers from reaching each other. Test this before building anything else: write a tiny test page, run it on the planned host, and open it from a front desk computer. If that fails, use a wired connection, or have staff use the host at the desk.
- Plain HTTP across the network shows passwords and student data to anyone listening. Between computers, use HTTPS with a certificate the desk computers trust, and decide how in phase 0.

## 4. Backups

- The live database never runs from the U: drive or any other network folder. PostgreSQL needs writes to reach the disk in a strict order, network folders do not guarantee that, and a file server cannot run PostgreSQL anyway. The network location only holds backup copies.
- Schedule: a Node script run by Task Scheduler, every night and every hour during desk hours. Both times are settings. Keep hourly copies for 2 days and nightly copies for 30 days (settings). The database is tiny, so space is not a concern.
- Destination, off the host: the U: network drive (the default, since it is always on and SAAC already keeps the Access file there), FIU OneDrive on the work account (never a personal account), or a copy on the supervisor's computer (only works while that computer is on and shared). Using two destinations is better than one. Copies hold student data, so use university storage only.
- Task Scheduler gotchas on a domain: scheduled tasks cannot see mapped drive letters, so use the full network path of the folder instead of `U:`. The task runs as a specific account that needs write access to that folder, and if that account's password changes the task fails until someone updates it. The host must be on and on the network at the run time. Write all three in the runbook.
- The script writes a `BackupRun` row after each attempt, and the dashboard shows the last success and turns red when it is older than a setting (default 30 hours). Failures are never silent.
- A backup that was never restored is not a backup. Restore the latest copy onto another machine with the restore guide once in phase 0 and once each term.
- Keep a plain fallback too: a weekly Excel export of open loans, and the printed receipts, so the desk can work with no app at all.

## 5. Security

- Full-disk encryption (BitLocker on Windows Pro, or device encryption) and a Windows password with auto-lock. The host holds student records, and a laptop is also easy to lose or steal.
- Keep the host in a locked room or on a cable lock when the desk is unattended.
- Keep Windows, PostgreSQL, and Node updated, at least once per term.
- Real data files stay in `data-private/` on the encrypted disk. Delete downloaded copies of real files once imported.
- Only admins run imports and manage users. Shared logins are not allowed, because the audit trail depends on one person per account.

## 6. Failure and recovery

| What happens | Effect | What to do |
| --- | --- | --- |
| Power cut or reboot | The database recovers by itself, and only a checkout in progress is lost | Wait for the app to return, then check the last loan |
| Host off or app down for a while | The desk cannot check items in or out | Use the paper receipts and enter the transactions afterward |
| Host disk dies or the computer is lost | Everything since the last backup is lost, up to an hour | Follow the restore guide on a spare computer |
| A wrong import or a deleted record | The record is gone from the live database | Restore an older backup into a scratch database and copy the record back. Imports preview first and never delete, so this should be rare |

## 7. The restore guide (high priority)

It lives in `docs/runbook.md` and is built in phase 0, before any feature work. The developer is a student, so it must be followable by the supervisor, IT, or a new student worker with no help. Goal: the app running again on another Windows computer in about 30 minutes, from the latest backup. Write it as numbered steps with commands that can be copied.

1. Choose the spare computer (open question 11 names it) and check that Windows is updated.
2. Install PostgreSQL (the same major version as the host) and Node. The runbook lists the exact versions, and copies of the installers are kept in the backup location.
3. Get the app: a built copy of the app folder is stored in the backup location with every release.
4. Create the database and the app's database user, then create `.env` from `.env.example` with a new password.
5. Restore the latest dump with `pg_restore`, and confirm that the row counts match the backup report.
6. Start the app, and set it to start at boot.
7. Point the desk computers to the new address, or give the new computer the old name.
8. Check it: log in as an admin, find a person with an open loan, confirm the last transaction is there, then run a backup and confirm it lands in the backup location.
9. Keep using the paper receipts until step 8 passes, then enter the transactions made during the downtime.
10. Train two people (open question 17), test the guide once with someone who did not write it, and repeat once each term. A handover checklist is part of done.

## 8. Live standby (later, low priority)

- A second computer runs PostgreSQL and stays in sync with the host through PostgreSQL's built-in streaming replication, which costs nothing. If the host dies, the app switches to the standby in minutes and loses seconds of data.
- Compare it with the restore guide: about 30 minutes and up to an hour of entries lost, versus minutes and seconds. The standby needs a second always-on computer, more setup, and someone who can do the switchover.
- It does not replace backups or the restore guide. It copies mistakes instantly, and both machines can fail.
- Do not build it until the pilot shows that downtime is a real problem. Nothing in the design blocks it, because the app reaches the database through one setting, the database URL.

## 9. Approval

Holding student records on a department computer may need review by FIU IT or the people responsible for student-records compliance. Get a written OK from the supervisor or FIU IT before go-live (open question 12).
