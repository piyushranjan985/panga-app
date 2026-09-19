-- Removes the Circles feature entirely (schema, and by extension every
-- API/UI dependency on it): the join table and the reference table.
-- CircleMember is dropped first since it holds the foreign keys into
-- Circle.
DROP TABLE IF EXISTS "CircleMember";
DROP TABLE IF EXISTS "Circle";
