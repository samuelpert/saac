# SAAC Books: data model

Contents: entities, proposed Prisma schema, raw SQL a migration needs, design notes.

The schema is a starting point derived from the features, not a copy of any old table. Adjust it when the open questions in `SKILL.md` are answered, and keep this file in sync with `prisma/schema.prisma`. Prisma 7 and later keep the connection URL out of `schema.prisma`: put `DATABASE_URL` in `prisma.config.ts` and pass the PostgreSQL driver adapter to `PrismaClient`. Git-ignore the generated client folder. Run `npx prisma --version` and follow that version's conventions if they differ. This schema passed Prisma 7 validation and the raw SQL below was tested on PostgreSQL 16, both before two later changes: the `User` login change (username, optional email, `mustChangePassword`) and the `Item` status change (`ItemStatus`). Both are small, but run `npx prisma validate` first when scaffolding.

## 1. Entities

| Entity | Purpose |
| --- | --- |
| `User` | Admins and desk staff who log in with a username and password. Borrowers never log in |
| `Team`, `GroupMapping` | Teams with coach contact, and the mapping from the import's Sport column |
| `Borrower` | Anyone who can borrow: athletes, staff, graduate assistants |
| `BorrowerTerm` | The term tag: one row per person per term they were in a student import or were tagged by hand |
| `Semester` | A term with its dates and return deadline |
| `Course`, `Enrollment` | A class in a term, and who is taking it |
| `Book`, `CourseBook` | A title (one per ISBN) and which classes need it |
| `BookCopy` | One physical book SAAC owns, with its own tag |
| `BookNeed` | A title a person needs this term, and the copy assigned to them |
| `ItemType`, `Item` | Kinds of tech and each physical tech item, with its asset tag |
| `BookLoan`, `ItemLoan` | One row per checkout, open until closed |
| `Escalation` | Follow-up stage per person per term |
| `EmailLog` | Every reminder previewed or sent |
| `ImportRun` | One row per import file applied |
| `BackupRun` | One row per backup attempt, written by the backup script, shown on the dashboard |
| `AuditLog` | Append-only record of every change |

## 2. Proposed Prisma schema

```prisma
generator client {
  provider = "prisma-client"
  output   = "../apps/api/src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum Role {
  ADMIN
  STAFF
}

enum ItemStatus {
  IN_SERVICE
  IN_REPAIR
  SURPLUS
}

enum BorrowerKind {
  ATHLETE
  STAFF
  GRAD_ASSISTANT
}

enum EscalationStage {
  NONE
  REMINDED
  COACH_NOTIFIED
  HOLD_PENDING_REVIEW
  ON_HOLD
  CHARGED
  RESOLVED
}

enum LoanOutcome {
  RETURNED
  NOT_FOR_RETURN
}

enum EmailStatus {
  PREVIEWED
  SENT
  FAILED
}

enum NeedStatus {
  NEEDED
  ASSIGNED
  ISSUED
  WAIVED
  CANCELLED
}

enum NeedSource {
  SCHEDULE
  BOOKSTORE_LIST
  MANUAL
}

model User {
  id                 String   @id @default(uuid())
  username           String   @unique
  email              String?
  name               String
  passwordHash       String
  mustChangePassword Boolean  @default(true)
  role               Role     @default(STAFF)
  active             Boolean  @default(true)
  createdAt          DateTime @default(now())

  auditLogs  AuditLog[]
  importRuns ImportRun[]
  sessions   Session[]
}

// One row per signed-in browser. The cookie holds a random token; only its SHA-256 is stored.
model Session {
  id         String   @id @default(uuid())
  tokenHash  String   @unique
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  createdAt  DateTime @default(now())
  lastSeenAt DateTime @default(now())
  expiresAt  DateTime

  @@index([userId])
}

model Team {
  id         String  @id @default(uuid())
  name       String  @unique
  coachName  String?
  coachEmail String?

  borrowers Borrower[]
  mappings  GroupMapping[]
}

model GroupMapping {
  id          String       @id @default(uuid())
  sourceValue String       @unique
  kind        BorrowerKind
  teamId      String?
  team        Team?        @relation(fields: [teamId], references: [id])
}

model Borrower {
  id            String       @id @default(uuid())
  pid           String       @unique
  kind          BorrowerKind @default(ATHLETE)
  firstName     String
  lastName      String
  email         String?
  phone         String?
  onScholarship Boolean      @default(false)
  staffActive   Boolean      @default(true)
  teamId        String?
  team          Team?        @relation(fields: [teamId], references: [id])
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  terms       BorrowerTerm[]
  enrollments Enrollment[]
  bookLoans   BookLoan[]
  itemLoans   ItemLoan[]
  escalations Escalation[]
  emails      EmailLog[]
  needs       BookNeed[]

  @@index([lastName, firstName])
}

model Semester {
  id             String   @id @default(uuid())
  code           String   @unique
  startsOn       DateTime
  endsOn         DateTime
  returnDeadline DateTime
  isCurrent      Boolean  @default(false)

  members     BorrowerTerm[]
  courses     Course[]
  bookLoans   BookLoan[]
  itemLoans   ItemLoan[]
  escalations Escalation[]
  needs       BookNeed[]
}

// The term tag. A person is in a term when this row exists; they keep every tag they have earned.
model BorrowerTerm {
  borrowerId String
  semesterId String
  borrower   Borrower @relation(fields: [borrowerId], references: [id])
  semester   Semester @relation(fields: [semesterId], references: [id])
  createdAt  DateTime @default(now())

  @@id([borrowerId, semesterId])
  @@index([semesterId])
}

model Course {
  id         String   @id @default(uuid())
  semesterId String
  semester   Semester @relation(fields: [semesterId], references: [id])
  subject    String
  catalog    String
  section    String

  enrollments Enrollment[]
  books       CourseBook[]
  needs       BookNeed[]

  @@unique([semesterId, subject, catalog, section])
}

model Enrollment {
  borrowerId String
  courseId   String
  borrower   Borrower @relation(fields: [borrowerId], references: [id])
  course     Course   @relation(fields: [courseId], references: [id])

  @@id([borrowerId, courseId])
}

model Book {
  id            String   @id @default(uuid())
  isbn          String   @unique
  title         String
  author        String?
  edition       String?
  publisher     String?
  publishedYear String?
  notes         String?
  updatedAt     DateTime @updatedAt

  courses CourseBook[]
  copies  BookCopy[]
  needs   BookNeed[]
}

model CourseBook {
  courseId String
  bookId   String
  course   Course @relation(fields: [courseId], references: [id])
  book     Book   @relation(fields: [bookId], references: [id])

  @@id([courseId, bookId])
}

model BookNeed {
  id         String     @id @default(uuid())
  borrowerId String
  semesterId String
  bookId     String
  borrower   Borrower   @relation(fields: [borrowerId], references: [id])
  semester   Semester   @relation(fields: [semesterId], references: [id])
  book       Book       @relation(fields: [bookId], references: [id])
  courseId   String?
  course     Course?    @relation(fields: [courseId], references: [id])
  status     NeedStatus @default(NEEDED)
  copyId     String?
  copy       BookCopy?  @relation(fields: [copyId], references: [id])
  source     NeedSource
  note       String?
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt

  loans BookLoan[]

  @@unique([borrowerId, semesterId, bookId])
  @@index([semesterId, status])
}

model BookCopy {
  id         String    @id @default(uuid())
  copyTag    String    @unique
  bookId     String
  book       Book      @relation(fields: [bookId], references: [id])
  condition  String?
  notes      String?
  acquiredAt DateTime  @default(now())
  retiredAt  DateTime?

  loans BookLoan[]
  needs BookNeed[]
}

model ItemType {
  id    String @id @default(uuid())
  name  String @unique
  items Item[]
}

model Item {
  id         String    @id @default(uuid())
  assetTag   String    @unique
  name       String
  typeId     String
  type       ItemType  @relation(fields: [typeId], references: [id])
  notes      String?
  status     ItemStatus @default(IN_SERVICE)
  statusNote String?
  retiredAt  DateTime?

  loans ItemLoan[]
}

model BookLoan {
  id           String       @id @default(uuid())
  borrowerId   String
  copyId       String
  semesterId   String
  borrower     Borrower     @relation(fields: [borrowerId], references: [id])
  copy         BookCopy     @relation(fields: [copyId], references: [id])
  needId       String?
  need         BookNeed?    @relation(fields: [needId], references: [id])
  semester     Semester     @relation(fields: [semesterId], references: [id])
  checkedOutAt DateTime     @default(now())
  dueDate      DateTime
  closedAt     DateTime?
  outcome      LoanOutcome?
  outcomeNote  String?
  conditionIn  String?
  notes        String?

  @@index([borrowerId, semesterId])
  @@index([copyId, closedAt])
}

model ItemLoan {
  id           String       @id @default(uuid())
  borrowerId   String
  itemId       String
  semesterId   String
  borrower     Borrower     @relation(fields: [borrowerId], references: [id])
  item         Item         @relation(fields: [itemId], references: [id])
  semester     Semester     @relation(fields: [semesterId], references: [id])
  checkedOutAt DateTime     @default(now())
  dueDate      DateTime
  closedAt     DateTime?
  outcome      LoanOutcome?
  outcomeNote  String?
  renewCount   Int          @default(0)
  conditionOut String?
  conditionIn  String?
  notes        String?

  @@index([borrowerId, semesterId])
  @@index([itemId, closedAt])
}

model Escalation {
  id           String          @id @default(uuid())
  borrowerId   String
  semesterId   String
  borrower     Borrower        @relation(fields: [borrowerId], references: [id])
  semester     Semester        @relation(fields: [semesterId], references: [id])
  stage        EscalationStage @default(NONE)
  chargeAmount Decimal?        @db.Decimal(10, 2)
  note         String?
  updatedAt    DateTime        @updatedAt

  @@unique([borrowerId, semesterId])
}

model EmailLog {
  id         String      @id @default(uuid())
  borrowerId String
  borrower   Borrower    @relation(fields: [borrowerId], references: [id])
  kind       String
  status     EmailStatus
  subject    String
  body       String
  sentAt     DateTime?
  createdAt  DateTime    @default(now())
}

model ImportRun {
  id         String    @id @default(uuid())
  kind       String
  fileName   String
  fileSha256 String
  userId     String
  user       User      @relation(fields: [userId], references: [id])
  counts     Json
  createdAt  DateTime  @default(now())
  appliedAt  DateTime?
}

model BackupRun {
  id        String   @id @default(uuid())
  at        DateTime @default(now())
  ok        Boolean
  location  String
  sizeBytes BigInt?
  message   String?
}

model AuditLog {
  id         String   @id @default(uuid())
  at         DateTime @default(now())
  userId     String?
  user       User?    @relation(fields: [userId], references: [id])
  action     String
  entityType String
  entityId   String
  before     Json?
  after      Json?

  @@index([entityType, entityId])
  @@index([at])
}
```

## 3. Raw SQL a migration needs

Prisma cannot express partial unique indexes or check constraints. Add this to the generated migration file and keep it there:

```sql
CREATE UNIQUE INDEX "ItemLoan_one_open_per_item"
  ON "ItemLoan" ("itemId")
  WHERE "closedAt" IS NULL;

CREATE UNIQUE INDEX "BookLoan_one_open_per_copy"
  ON "BookLoan" ("copyId")
  WHERE "closedAt" IS NULL;

ALTER TABLE "ItemLoan"
  ADD CONSTRAINT "ItemLoan_closed_has_outcome"
  CHECK (("closedAt" IS NULL) = ("outcome" IS NULL));

ALTER TABLE "BookLoan"
  ADD CONSTRAINT "BookLoan_closed_has_outcome"
  CHECK (("closedAt" IS NULL) = ("outcome" IS NULL));

ALTER TABLE "Borrower"
  ADD CONSTRAINT "Borrower_pid_format"
  CHECK ("pid" ~ '^[0-9]{7}$');

CREATE UNIQUE INDEX "BookNeed_one_active_per_copy"
  ON "BookNeed" ("copyId")
  WHERE "status" = 'ASSIGNED';

ALTER TABLE "BookNeed"
  ADD CONSTRAINT "BookNeed_assigned_has_copy"
  CHECK ("status" <> 'ASSIGNED' OR "copyId" IS NOT NULL);
```

The partial indexes make a double checkout or a double assignment impossible even if two staff members act at the same moment. Catch the unique violation and return a friendly message such as "already checked out to X".

For the audit log, the init migration adds triggers that reject `UPDATE`, `DELETE` and `TRUNCATE` on `AuditLog`, so the table is append-only at the database level whatever role the app connects with. (A role-based `REVOKE` would not bind the table owner.)

A second migration, `default_sport_mapping`, inserts the 16 teams and the default `GroupMapping` rows from `student-import.md` section 3. It uses `ON CONFLICT DO NOTHING`, so it never overwrites an admin's change.

## 4. Design notes

- Open loan means `closedAt IS NULL`. Overdue means open and `dueDate` before now. Nothing stores "is checked out".
- `Book` is a title, one row per ISBN. `BookCopy` is a physical book with its own `copyTag`. Loans point to a copy, so the system knows exactly which copy is out. The number of copies is a count, never typed by hand.
- `Item.retiredAt` and `BookCopy.retiredAt` retire something without deleting its history.
- `Item.status` holds only the hand-set states `IN_REPAIR` and `SURPLUS`. Checked out and available are never stored: an item is available when it is `IN_SERVICE`, not retired, and has no open loan. Moving an item to `IN_REPAIR` or `SURPLUS` needs no open loan, which the service checks inside a transaction that locks the item row, and checkout rejects any item that is not `IN_SERVICE`. Item history merges an item's loans with its audit entries, so repair and surplus changes appear in it.
- There is no `Borrower.active`. A person is in a term when a `BorrowerTerm` row exists, and can borrow in it when they also pass `computeEligibility`: the term's return deadline has not passed, and athletes need `onScholarship`. Nothing is switched off by a scheduled job; the deadline rule is computed. Staff and graduate assistants instead have `Borrower.staffActive` (migration `staff_active`, default true): while it is on they borrow tech only, never books, whatever their tags. Migration `term_tags` replaced the old flag and gave everyone who was active the current term's tag.
- `Borrower.kind` and `Borrower.teamId` replace the old single Sport column. Athletes have a team. Staff and graduate assistants do not. Graduate assistants follow the student rules (term tag, open term, scholarship); only staff are tech only with an active switch.
- `Escalation` is per person per term, because someone on hold in one term can be fine in the next.
- The hold list is a query, not a table: people with an open loan, book or tech, on the day after the term's `returnDeadline` plus the grace days setting (default 0). Building or exporting it stores nothing. Only an admin applying a hold sets `Escalation.stage` to `ON_HOLD`, and `HOLD_PENDING_REVIEW` is an optional marker an admin sets while checking the list.
- `Session` (added in phase 0) holds one row per signed-in browser: the SHA-256 of the cookie token, the user, and `expiresAt`, which slides forward with use. Background refreshes do not slide it, so an unattended screen still signs out.
- `User.username` is the login, and an admin creates every account with a temporary password and `mustChangePassword` set. There is no sign-up, and `email` is optional.
- No price fields exist. A charge, if one is ever needed, is `Escalation.chargeAmount`.
- Student classes (`Enrollment`) depend on open question 1, so the entity may change shape once the source of class lists is known.
- Tag formats for `copyTag` and `assetTag` wait for the barcode step.
- `BookNeed` is one title for one person in one term. `ASSIGNED` reserves one copy, `ISSUED` means a loan exists, `WAIVED` and `CANCELLED` close it. "Short" is derived: a `NEEDED` row whose title has no available copy.
- A copy is available when it is not retired, has no open loan, and has no `ASSIGNED` need. A copy assigned to person A must not be checked out to person B, so the checkout service checks this inside its transaction.
- `IsbnLookup` (migration `inventory`) caches Open Library answers by ISBN, so a title looked up once fills in again with no network. Only found answers are cached. The same migration adds the item types Laptops, Chargers and Other tech.
- SAAC's tag convention (user, October 2026): a tech item has one identifier, its tag, typed as it reads on the label ("SAAC LAPTOP 942"). There is no separate name on screen. It is stored as typed in `name` and without spaces in `assetTag` (`SAACLAPTOP942`), which is what a barcode holds and what uniqueness and matching use, ignoring case. A numbered run ("SAAC LAPTOP", starting number 903, how many 56) makes SAAC LAPTOP 903 to SAAC LAPTOP 958. Book `copyTag`s are numbered `C-00001`, `C-00002`, ... unless the copy already carries a label.
- `BackupRun` is written by the backup script so the dashboard can show backup age. No recent row counts as a failed backup.
