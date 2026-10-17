-- More names for the same teams, as the per-team scholarship workbook writes them (sheet titles and tab names).
-- Matching ignores case, spaces and punctuation, so "Men's Soccer" already equals "Mens Soccer"; only real
-- differences need a row. ON CONFLICT keeps any value an admin already changed.
INSERT INTO "GroupMapping" ("id", "sourceValue", "kind", "teamId")
SELECT gen_random_uuid()::text, a.source, 'ATHLETE'::"BorrowerKind", t."id"
FROM (VALUES
  ('Men''s Track/Field', 'Mens Track and Field'),
  ('Women''s Track/Field', 'Womens Track and Field'),
  ('M.Track', 'Mens Track and Field'),
  ('W.Track', 'Womens Track and Field'),
  ('M.Soccer', 'Mens Soccer'),
  ('W.Soccer', 'Womens Soccer'),
  ('M.Basketball', 'Mens Basketball'),
  ('W.Basketball', 'Womens Basketball'),
  ('Swimming/Diving', 'Swimming'),
  ('Beach Volleyball', 'Sand Volleyball')
) AS a(source, team)
JOIN "Team" t ON t."name" = a.team
ON CONFLICT ("sourceValue") DO NOTHING;
