-- SAAC writes a tech item's tag without spaces (SAACLAPTOP942) and shows nothing else,
-- so every item's name becomes its tag. Each change gets an audit row in the same transaction.
INSERT INTO "AuditLog" ("id", "at", "userId", "action", "entityType", "entityId", "before", "after")
SELECT gen_random_uuid()::text, now(), NULL, 'item.update', 'Item', "id",
       jsonb_build_object('name', "name", 'assetTag', "assetTag"),
       jsonb_build_object('name', "assetTag", 'assetTag', "assetTag", 'reason', 'tags without spaces')
FROM "Item"
WHERE "name" <> "assetTag";

UPDATE "Item" SET "name" = "assetTag" WHERE "name" <> "assetTag";
