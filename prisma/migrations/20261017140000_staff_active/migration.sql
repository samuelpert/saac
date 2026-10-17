-- Staff and graduate assistants have an active switch. An active staff member can borrow tech, never books.
-- Athletes ignore it: they follow term tags, the term's return deadline, and scholarship.
ALTER TABLE "Borrower" ADD COLUMN "staffActive" BOOLEAN NOT NULL DEFAULT true;
