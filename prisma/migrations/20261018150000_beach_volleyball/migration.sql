-- The team is called Beach Volleyball (user decision, October 2026). The mapping rows for both
-- "Sand Volleyball" and "Beach Volleyball" keep pointing at this one team, so either name in a file works.
UPDATE "Team" SET "name" = 'Beach Volleyball'
WHERE "name" = 'Sand Volleyball'
  AND NOT EXISTS (SELECT 1 FROM "Team" WHERE "name" = 'Beach Volleyball');
