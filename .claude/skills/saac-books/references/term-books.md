# Term books: import, needs, assignment

Contents: the flow each term, importing the book list, ISBN rules, needs, assigning copies, pull list and shortage report, what is still unknown.

## 1. The flow each term

1. Create the term (code, dates, return deadline) and make it current.
2. Import the Barnes & Noble list. Titles, classes, and the links between them are created or updated.
3. Get each person's classes into the system (open question 1), or take them from the list if it names students (open question 6).
4. The app creates needs: every title each person needs this term.
5. Staff run Assign. Each need gets a reserved copy, or stays unassigned and shows as short.
6. Staff print the pull list, pull the books, and check them out by scanning.
7. Short titles go on the shortage report so staff can order them from the bookstore. When new copies arrive, they are added to inventory and Assign runs again.

## 2. Importing the book list

The format is not known yet, so build the importer in two layers. The first layer reads the file and maps its columns to these fields: subject, catalog, section, ISBN, title, author, edition, publisher. Only the first four are essential. Everything after that layer is independent of the file format, so a new format only needs a new mapping.

Rules:

- Upsert titles on the normalized ISBN, classes on (term, subject, catalog, section), and links on (class, title).
- Normalize class keys: trim, uppercase subject and section, keep catalog as text. Section codes look like `U01`.
- A row with a bad ISBN or a missing class key goes to the review list and never blocks the rest of the file.
- Importing the same file twice changes nothing the second time.
- The import asks for the term and warns if that term already has a book list imported.
- Never delete. A link that is no longer in the list is flagged "removed from list" for staff to decide. Needs already assigned or issued are never touched by an import.
- Fill a title's empty fields from the list first and Open Library second. Never overwrite a non-empty field with a different value without showing it in the preview.
- The preview shows creates, updates, unchanged, review rows, links removed since the last import for the term, and titles in the list that SAAC owns no copy of.

## 3. ISBN rules

- Strip spaces and hyphens and uppercase the value.
- 13 digits starting with 978 or 979 and a valid check digit is valid.
- 10 characters (digits, the last may be `X`) with a valid check digit is converted to ISBN-13 by prefixing 978 and recomputing the check digit. Store only ISBN-13.
- Anything else, or a failed check digit, goes to the review list.
- ISBN-13 check digit: multiply the first 12 digits by 1 and 3 alternately, add them up, and the check digit is `(10 - sum mod 10) mod 10`.
- Test vector: `0306406152` and `978-0-306-40615-7` are the same book, stored as `9780306406157`.
- Excel mangles ISBNs (scientific notation, lost leading zeros). Read ISBN cells as text, and send any numeric cell in scientific notation to the review list.

## 4. Needs

- A need is one title for one person in one term. There is at most one per person, term, and title.
- Needs are created from three sources: the person's classes times each class's titles (`SCHEDULE`), a per-student list if the bookstore list names students (`BOOKSTORE_LIST`), or staff by hand (`MANUAL`).
- A title needed through two classes is one need.
- If the person already holds a copy of that title on an open loan, the need starts as `ISSUED`.
- Adding a class to a schedule creates its needs. Dropping a class cancels its `NEEDED` and `ASSIGNED` needs and releases the copies. An `ISSUED` need stays until the book is returned.
- Staff can waive a need, for example when the student bought the book or the class does not use it.
- Recomputing needs after an import or a schedule change never touches `ISSUED`, `WAIVED`, or `MANUAL` needs.

## 5. Assigning copies

- Scope is one person, one team, or the whole term. Staff pick the scope, so staff decide who goes first when copies are short (open question 7).
- For each `NEEDED` need in scope, take any available copy of that title. A copy is available when it is not retired, has no open loan, and is not assigned.
- If no copy is available the need stays `NEEDED` and shows as short.
- Show a preview first: each need with its title, and the short ones. Commit in one transaction.
- The database allows only one active assignment per copy. If two staff assign at the same moment, the loser retries with another copy.
- Staff can release a copy or reassign it to another need. Cancelling a need releases its copy.
- Assign is repeatable. Run it again after new copies arrive or books come back.
- Assigning does not create a loan. The loan is created when the book's ISBN is scanned at checkout, using the copy reserved for that person, and it marks the need `ISSUED`. A copy assigned to one person cannot be checked out to another.
- An assignment not picked up after a number of days shows on the dashboard. The number of days is a setting with no default until the supervisor decides.

## 6. Pull list and shortage report

- Pull list: grouped by team, then person. Each row has the person, title, ISBN, and status. Printable, with a checkbox per row.
- Shortage report: per title, the number of people who need it, copies owned, copies available, and the shortfall. Export to Excel. The order quantity is the shortfall.

## 7. Still unknown

- The bookstore list format, whether it marks required versus optional books, and whether it is per class or per student.
- Where each student's class list comes from.
- Who gets books first when copies are short.
