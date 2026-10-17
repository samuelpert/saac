# Student import

Contents: source file, column rules, mapping of the Sport column, processing flow, what the real file contains.

## 1. Source file

An `.xlsx` or `.csv`. The importer reads **every sheet** of a workbook and looks for the header row in the first 10 rows, so a title line above the headers is fine. A sheet with no header row naming a Panther ID, last name and first name (for example a sheet of emails only) is skipped and listed in the preview. Headers are matched ignoring case, spaces and punctuation, so `Panther ID #` and `PID` both work; the aliases live in one place, `HEADER_ALIASES` in `apps/api/src/services/studentImport/parse.ts`.

**Per-team scholarship workbook** (the format the term's scholarship list arrives in, checked October 2026): one sheet per team, the team title in row 1, headers in row 2 (`Last Name`, `First Name`, `Panther ID #`, `Email`, `Comments`, `Book Stack`, `Missing Laptop/Charger`), and a first sheet `Master` with emails only. There is no Sport and no scholarship column: the team comes from the sheet title, then the tab name, through the Sport mapping, and the admin ticks "Everyone in this file is on scholarship". A file that has its own scholarship column always uses the column. `Comments`, `Book Stack` and `Missing Laptop/Charger` are not imported. A fake copy of this layout is `fixtures/scholarship-list.sample.xlsx`.

The all-time student file has these columns, in any order:

`PID`, `Last Name`, `First Name`, `OnScholarship?`, `Sport`, `E-mail Address`, `Mobile Phone`

The real file has 15 columns. The other eight are ignored on purpose: `Home Phone`, `Address`, `City`, `State/Province`, `ZIP/Postal Code`, `Country/Region`, `Notes` (all empty in the real file) and `Photo` (binary junk, never store it). A fake file with the same layout is in `assets/students.sample.xlsx`.

If the supervisor's semester scholarship list uses different headers, add header aliases in one place in the importer. Do not change the rules below.

## 2. Column rules

| Column | Stored as | Rule |
| --- | --- | --- |
| `PID` | `Borrower.pid` | Read the cell as text. Trim. Digits only. 7 digits is valid. A 6-digit value is padded with one leading zero and reported as "fixed". Any other length or non-digit value goes to the review list and is not imported. |
| `Last Name`, `First Name` | `lastName`, `firstName` | Trim and collapse inner spaces. Change case only when the whole value is all upper or all lower, then use title case. Mixed case stays as typed (McDonald). |
| `OnScholarship?` | `onScholarship` | Accept TRUE/FALSE, Yes/No, Y/N, 1/0 in any case. A blank or anything else goes to the review list. |
| `Sport` | `teamId` and `kind` | Resolved through the mapping in section 3. Unknown values go to the review list. With no Sport column, the sheet title or tab name is resolved the same way. |
| `E-mail Address` | `email` | Trim and lowercase. A value with nothing before the `@` (for example `@fiu.edu`) means no email, store null. Other domains are allowed. An address used by more than one person is a warning, not an error. |
| `Mobile Phone` | `phone` | Keep digits only. 10 digits is valid, other lengths go to the review list. A number used by more than 5 people is a placeholder, so store null and list it once in the report. |

Never store a blank over an existing value. A blank in the file means "no information".

## 3. Sport column mapping

The real file mixes teams, roles, and a status in one column. Keep the mapping in an admin-editable table (`GroupMapping`), seeded with these defaults (matching ignores case, spaces and punctuation; migration `sport_aliases` adds the workbook names such as `Men's Track/Field`, `Swimming/Diving`, `Beach Volleyball` → Sand Volleyball, and tab names like `M.Soccer`), so a new value in a future file goes to review instead of breaking the import.

| Source value | Becomes |
| --- | --- |
| Baseball, Cheerleader, Dazzler, Football, Golf, Mens Basketball, Mens Soccer, Mens Track and Field, Sand Volleyball, Softball, Swimming, Tennis, Volleyball, Womens Basketball, Womens Soccer, Womens Track and Field | kind `ATHLETE`, team of the same name |
| Staff, Staff (tutor) | kind `STAFF`, no team |
| Graduate Assistant, GA | kind `GRAD_ASSISTANT`, no team |
| 5th Year | kind `ATHLETE`, team unknown, goes to review so staff pick the team |
| (blank) | goes to review |

## 4. Processing flow

1. Parse the file and record its name and SHA-256 hash in an `ImportRun`.
2. Normalize every row with the rules above.
3. Compare with the database by PID: create, update, unchanged, needs review.
4. Show the preview with counts and a downloadable review list (row number, PID if valid, reason).
5. An admin confirms. Nothing is saved before this step.
6. Apply in one transaction and write the audit entry with the counts.

Rules for the flow:

- Upsert on PID. Running the same file twice changes nothing the second time.
- A review row never blocks the rest of the file.
- A PID that appears twice in the file goes to review.
- The same first and last name on different PIDs is a "possible duplicate" warning. Never merge automatically.
- Term tags: the admin picks the term the file is for (default: the current term), and everyone in the file gets that term's tag. A person keeps every tag they have earned, so a student on the Fall 2026 list and again on the Spring 2027 list carries both. Picking "No term" adds people without a tag, for example the all-time file. Someone tagged for the term but missing from the file is listed as "tagged but not in file", and the admin may tick a box to remove just that term's tag. Never delete anyone.
- Eligibility: a person can borrow in a term when they carry its tag, the term's return deadline has not passed, and, for athletes, they are on scholarship (`computeEligibility`). After the deadline everyone is off until the next term's list is imported. Staff and graduate assistants borrow tech only and follow their own active switch instead; the import never changes it, and new staff come in active. The scholarship value comes from the file and is refreshed by every import.
- Export PIDs as text, so Excel does not drop leading zeros again.

## 5. What the real file contains

Counts from the file the user supplied (Access `Students` export). No personal values are recorded here.

| Finding | Count |
| --- | --- |
| People (all-time) | 3,161 |
| On scholarship, yes / no | 1,934 / 1,227 |
| PIDs with 7 digits / 6 digits / 8 digits | 3,153 / 4 / 4 |
| Duplicate PIDs | 0 |
| Distinct Sport values | 21 (16 teams, 4 role values, `5th Year`) |
| Blank Sport | 13 |
| Email with nothing before `@fiu.edu` (no email) | 1,218 |
| Email addresses shared by several people | 9 addresses, 19 people |
| Email not at fiu.edu | 1 |
| Mobile phones filled in | 2,921 |
| One phone number repeated on | 1,905 people (a placeholder) |
| Same first and last name on different PIDs | 35 names, 71 people |
| Names with stray spaces / all upper / all lower | 4 / 1 / 10 |
| `Staff` rows marked on scholarship | 54 |
| Columns empty or junk | 8 of 15 |

Consequences to remember: about 39% of people have no email, so reminders need a fallback route for them. The scholarship flag on `Staff` rows looks misused, so never apply scholarship rules to staff.

## 6. How the rules were implemented (phase 1, updated for term tags)

- Review has two scopes. **Row**: the row is not imported at all (bad PID, a PID repeated in the file, a blank first or last name). **Field**: the person is imported or updated, only the bad value is left out (scholarship not yes/no, blank or unknown Sport, `5th Year` with no team, a bad phone or email). Field review lets a 5th-year athlete borrow while staff pick the team on the person page.
- A new person whose scholarship value is unreadable is stored as not on scholarship until fixed. A new person with no usable Sport is stored as an athlete with no team.
- `@fiu.edu` with nothing before the `@` is treated as a blank, so it never erases an email already on file.
- The preview is a pure dry run and writes nothing, not even the `ImportRun`. The run is recorded when the admin applies, together with the counts and the review rows (row number, PID, reason; never names or contact details).
- Apply re-reads the file and rebuilds the plan inside one transaction, so it reflects the database at that moment. The browser sends the file again with the SHA-256 from the preview, and a different file is refused.
- The preview shows how many people get the term tag. Tagging an existing person counts as an update, and importing the same file for the same term again changes nothing. The same file for another term is a different import.
- A term must exist (Terms screen) before a file can be imported for it.
- Possible duplicates are checked within the file and against people already on file.
- Every created or updated person gets its own audit entry with before and after values, plus one entry for the import with the counts.
