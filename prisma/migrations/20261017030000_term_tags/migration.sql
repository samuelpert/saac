-- Replace the Borrower.active flag with per-term tags (BorrowerTerm).
-- A person is in a term when a BorrowerTerm row exists. They keep every tag they have earned.

-- CreateTable
CREATE TABLE "BorrowerTerm" (
    "borrowerId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BorrowerTerm_pkey" PRIMARY KEY ("borrowerId","semesterId")
);

-- CreateIndex
CREATE INDEX "BorrowerTerm_semesterId_idx" ON "BorrowerTerm"("semesterId");

-- AddForeignKey
ALTER TABLE "BorrowerTerm" ADD CONSTRAINT "BorrowerTerm_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerTerm" ADD CONSTRAINT "BorrowerTerm_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep what the old flag said: everyone who was active gets the tag of the current term.
-- Does nothing when no term exists yet.
INSERT INTO "BorrowerTerm" ("borrowerId", "semesterId")
SELECT b."id", s."id"
FROM "Borrower" b
CROSS JOIN (SELECT "id" FROM "Semester" WHERE "isCurrent" ORDER BY "startsOn" DESC LIMIT 1) s
WHERE b."active"
ON CONFLICT DO NOTHING;

-- AlterTable
ALTER TABLE "Borrower" DROP COLUMN "active";
