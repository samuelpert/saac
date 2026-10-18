-- Phase 2: inventory.

-- Open Library answers, so a title looked up once fills in again with no network.
CREATE TABLE "IsbnLookup" (
    "isbn" TEXT NOT NULL,
    "found" BOOLEAN NOT NULL,
    "data" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IsbnLookup_pkey" PRIMARY KEY ("isbn")
);

-- The tech types SAAC lends. Admins can add more on the Inventory screen.
INSERT INTO "ItemType" ("id", "name") VALUES
  (gen_random_uuid()::text, 'Laptops'),
  (gen_random_uuid()::text, 'Chargers'),
  (gen_random_uuid()::text, 'Other tech')
ON CONFLICT ("name") DO NOTHING;
