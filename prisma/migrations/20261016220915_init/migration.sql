-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('IN_SERVICE', 'IN_REPAIR', 'SURPLUS');

-- CreateEnum
CREATE TYPE "BorrowerKind" AS ENUM ('ATHLETE', 'STAFF', 'GRAD_ASSISTANT');

-- CreateEnum
CREATE TYPE "EscalationStage" AS ENUM ('NONE', 'REMINDED', 'COACH_NOTIFIED', 'HOLD_PENDING_REVIEW', 'ON_HOLD', 'CHARGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "LoanOutcome" AS ENUM ('RETURNED', 'NOT_FOR_RETURN');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PREVIEWED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "NeedStatus" AS ENUM ('NEEDED', 'ASSIGNED', 'ISSUED', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NeedSource" AS ENUM ('SCHEDULE', 'BOOKSTORE_LIST', 'MANUAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coachName" TEXT,
    "coachEmail" TEXT,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMapping" (
    "id" TEXT NOT NULL,
    "sourceValue" TEXT NOT NULL,
    "kind" "BorrowerKind" NOT NULL,
    "teamId" TEXT,

    CONSTRAINT "GroupMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Borrower" (
    "id" TEXT NOT NULL,
    "pid" TEXT NOT NULL,
    "kind" "BorrowerKind" NOT NULL DEFAULT 'ATHLETE',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "onScholarship" BOOLEAN NOT NULL DEFAULT false,
    "teamId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Borrower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Semester" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "returnDeadline" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "catalog" TEXT NOT NULL,
    "section" TEXT NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "borrowerId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("borrowerId","courseId")
);

-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL,
    "isbn" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "edition" TEXT,
    "publisher" TEXT,
    "publishedYear" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseBook" (
    "courseId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,

    CONSTRAINT "CourseBook_pkey" PRIMARY KEY ("courseId","bookId")
);

-- CreateTable
CREATE TABLE "BookNeed" (
    "id" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "courseId" TEXT,
    "status" "NeedStatus" NOT NULL DEFAULT 'NEEDED',
    "copyId" TEXT,
    "source" "NeedSource" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookNeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookCopy" (
    "id" TEXT NOT NULL,
    "copyTag" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "condition" TEXT,
    "notes" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "BookCopy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ItemType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "notes" TEXT,
    "status" "ItemStatus" NOT NULL DEFAULT 'IN_SERVICE',
    "statusNote" TEXT,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookLoan" (
    "id" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "copyId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "needId" TEXT,
    "checkedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "outcome" "LoanOutcome",
    "outcomeNote" TEXT,
    "conditionIn" TEXT,
    "notes" TEXT,

    CONSTRAINT "BookLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemLoan" (
    "id" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "checkedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "outcome" "LoanOutcome",
    "outcomeNote" TEXT,
    "renewCount" INTEGER NOT NULL DEFAULT 0,
    "conditionOut" TEXT,
    "conditionIn" TEXT,
    "notes" TEXT,

    CONSTRAINT "ItemLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "stage" "EscalationStage" NOT NULL DEFAULT 'NONE',
    "chargeAmount" DECIMAL(10,2),
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "counts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "location" TEXT NOT NULL,
    "sizeBytes" BIGINT,
    "message" TEXT,

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMapping_sourceValue_key" ON "GroupMapping"("sourceValue");

-- CreateIndex
CREATE UNIQUE INDEX "Borrower_pid_key" ON "Borrower"("pid");

-- CreateIndex
CREATE INDEX "Borrower_lastName_firstName_idx" ON "Borrower"("lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_code_key" ON "Semester"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Course_semesterId_subject_catalog_section_key" ON "Course"("semesterId", "subject", "catalog", "section");

-- CreateIndex
CREATE UNIQUE INDEX "Book_isbn_key" ON "Book"("isbn");

-- CreateIndex
CREATE INDEX "BookNeed_semesterId_status_idx" ON "BookNeed"("semesterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BookNeed_borrowerId_semesterId_bookId_key" ON "BookNeed"("borrowerId", "semesterId", "bookId");

-- CreateIndex
CREATE UNIQUE INDEX "BookCopy_copyTag_key" ON "BookCopy"("copyTag");

-- CreateIndex
CREATE UNIQUE INDEX "ItemType_name_key" ON "ItemType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Item_assetTag_key" ON "Item"("assetTag");

-- CreateIndex
CREATE INDEX "BookLoan_borrowerId_semesterId_idx" ON "BookLoan"("borrowerId", "semesterId");

-- CreateIndex
CREATE INDEX "BookLoan_copyId_closedAt_idx" ON "BookLoan"("copyId", "closedAt");

-- CreateIndex
CREATE INDEX "ItemLoan_borrowerId_semesterId_idx" ON "ItemLoan"("borrowerId", "semesterId");

-- CreateIndex
CREATE INDEX "ItemLoan_itemId_closedAt_idx" ON "ItemLoan"("itemId", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Escalation_borrowerId_semesterId_key" ON "Escalation"("borrowerId", "semesterId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMapping" ADD CONSTRAINT "GroupMapping_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Borrower" ADD CONSTRAINT "Borrower_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseBook" ADD CONSTRAINT "CourseBook_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseBook" ADD CONSTRAINT "CourseBook_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookNeed" ADD CONSTRAINT "BookNeed_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookNeed" ADD CONSTRAINT "BookNeed_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookNeed" ADD CONSTRAINT "BookNeed_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookNeed" ADD CONSTRAINT "BookNeed_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookNeed" ADD CONSTRAINT "BookNeed_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "BookCopy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookCopy" ADD CONSTRAINT "BookCopy_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookLoan" ADD CONSTRAINT "BookLoan_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookLoan" ADD CONSTRAINT "BookLoan_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "BookCopy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookLoan" ADD CONSTRAINT "BookLoan_needId_fkey" FOREIGN KEY ("needId") REFERENCES "BookNeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookLoan" ADD CONSTRAINT "BookLoan_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemLoan" ADD CONSTRAINT "ItemLoan_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemLoan" ADD CONSTRAINT "ItemLoan_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemLoan" ADD CONSTRAINT "ItemLoan_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRun" ADD CONSTRAINT "ImportRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written SQL Prisma cannot express. Keep it in this migration.
-- See .claude/skills/saac-books/references/data-model.md section 3.
-- ---------------------------------------------------------------------------

-- One open loan per item and per copy, so a double checkout is impossible.
CREATE UNIQUE INDEX "ItemLoan_one_open_per_item"
  ON "ItemLoan" ("itemId")
  WHERE "closedAt" IS NULL;

CREATE UNIQUE INDEX "BookLoan_one_open_per_copy"
  ON "BookLoan" ("copyId")
  WHERE "closedAt" IS NULL;

-- A loan is closed exactly when it has an outcome.
ALTER TABLE "ItemLoan"
  ADD CONSTRAINT "ItemLoan_closed_has_outcome"
  CHECK (("closedAt" IS NULL) = ("outcome" IS NULL));

ALTER TABLE "BookLoan"
  ADD CONSTRAINT "BookLoan_closed_has_outcome"
  CHECK (("closedAt" IS NULL) = ("outcome" IS NULL));

-- PID is 7 digits of text, leading zeros kept.
ALTER TABLE "Borrower"
  ADD CONSTRAINT "Borrower_pid_format"
  CHECK ("pid" ~ '^[0-9]{7}$');

-- One active assignment per copy.
CREATE UNIQUE INDEX "BookNeed_one_active_per_copy"
  ON "BookNeed" ("copyId")
  WHERE "status" = 'ASSIGNED';

ALTER TABLE "BookNeed"
  ADD CONSTRAINT "BookNeed_assigned_has_copy"
  CHECK ("status" <> 'ASSIGNED' OR "copyId" IS NOT NULL);

-- The audit log is append-only at the database level, whatever role the app connects with.
CREATE FUNCTION "AuditLog_reject_change"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$;

CREATE TRIGGER "AuditLog_no_update_delete"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "AuditLog_reject_change"();

CREATE TRIGGER "AuditLog_no_truncate"
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION "AuditLog_reject_change"();
