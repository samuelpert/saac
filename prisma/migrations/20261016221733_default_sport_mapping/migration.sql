-- Default Sport column mapping for the student import (references/student-import.md section 3).
-- Reference data, not student data. Admins can change the mapping later; this only fills it the first time.
-- ON CONFLICT keeps any value an admin already changed.

INSERT INTO "Team" ("id", "name") VALUES
  (gen_random_uuid()::text, 'Baseball'),
  (gen_random_uuid()::text, 'Cheerleader'),
  (gen_random_uuid()::text, 'Dazzler'),
  (gen_random_uuid()::text, 'Football'),
  (gen_random_uuid()::text, 'Golf'),
  (gen_random_uuid()::text, 'Mens Basketball'),
  (gen_random_uuid()::text, 'Mens Soccer'),
  (gen_random_uuid()::text, 'Mens Track and Field'),
  (gen_random_uuid()::text, 'Sand Volleyball'),
  (gen_random_uuid()::text, 'Softball'),
  (gen_random_uuid()::text, 'Swimming'),
  (gen_random_uuid()::text, 'Tennis'),
  (gen_random_uuid()::text, 'Volleyball'),
  (gen_random_uuid()::text, 'Womens Basketball'),
  (gen_random_uuid()::text, 'Womens Soccer'),
  (gen_random_uuid()::text, 'Womens Track and Field')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "GroupMapping" ("id", "sourceValue", "kind", "teamId")
SELECT gen_random_uuid()::text, t."name", 'ATHLETE'::"BorrowerKind", t."id" FROM "Team" t
WHERE t."name" IN ('Baseball', 'Cheerleader', 'Dazzler', 'Football', 'Golf', 'Mens Basketball', 'Mens Soccer', 'Mens Track and Field', 'Sand Volleyball', 'Softball', 'Swimming', 'Tennis', 'Volleyball', 'Womens Basketball', 'Womens Soccer', 'Womens Track and Field')
ON CONFLICT ("sourceValue") DO NOTHING;

INSERT INTO "GroupMapping" ("id", "sourceValue", "kind", "teamId") VALUES
  (gen_random_uuid()::text, 'Staff', 'STAFF', NULL),
  (gen_random_uuid()::text, 'Staff (tutor)', 'STAFF', NULL),
  (gen_random_uuid()::text, 'Graduate Assistant', 'GRAD_ASSISTANT', NULL),
  (gen_random_uuid()::text, 'GA', 'GRAD_ASSISTANT', NULL),
  (gen_random_uuid()::text, '5th Year', 'ATHLETE', NULL)
ON CONFLICT ("sourceValue") DO NOTHING;
