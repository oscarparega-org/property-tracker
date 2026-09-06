BEGIN;

-- This release uses a brief maintenance window. Lock legacy writes, capture any
-- property created between the additive migration and this cutover, then make
-- SearchProperty the only lifecycle source of truth.
LOCK TABLE "Property" IN ACCESS EXCLUSIVE MODE;

INSERT INTO "SearchProperty" (
  "ownerId", "searchId", "propertyId", "decisionStatus", "isFavorite", "rating", "notes",
  "visitAt", "rejectionReason", "archivedAt", "createdAt", "updatedAt"
)
SELECT p."ownerId", s."id", p."id", p."decisionStatus", p."isFavorite", p."rating", p."notes",
       p."visitAt", p."rejectionReason", p."archivedAt", p."createdAt", p."updatedAt"
FROM "Property" p
JOIN "Search" s ON s."ownerId" = p."ownerId" AND s."isPrimary" = true
WHERE NOT EXISTS (
  SELECT 1 FROM "SearchProperty" sp WHERE sp."propertyId" = p."id"
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Property" p WHERE NOT EXISTS (
    SELECT 1 FROM "SearchProperty" sp WHERE sp."propertyId" = p."id"
  )) THEN
    RAISE EXCEPTION 'Multi-search cutover failed: properties without a search membership remain';
  END IF;
END $$;

DROP INDEX IF EXISTS "Property_decisionStatus_idx";
DROP INDEX IF EXISTS "Property_archivedAt_idx";
DROP INDEX IF EXISTS "Property_isFavorite_idx";

ALTER TABLE "Property"
  DROP COLUMN "decisionStatus",
  DROP COLUMN "isFavorite",
  DROP COLUMN "rating",
  DROP COLUMN "notes",
  DROP COLUMN "visitAt",
  DROP COLUMN "rejectionReason",
  DROP COLUMN "archivedAt";

ALTER TABLE "SearchProperty" DROP CONSTRAINT "SearchProperty_ownerId_fkey";
ALTER TABLE "SearchProperty" DROP CONSTRAINT "SearchProperty_searchId_fkey";
ALTER TABLE "SearchProperty" DROP CONSTRAINT "SearchProperty_propertyId_fkey";
ALTER TABLE "PropertyImportTarget" DROP CONSTRAINT "PropertyImportTarget_importId_fkey";
ALTER TABLE "PropertyImportTarget" DROP CONSTRAINT "PropertyImportTarget_searchId_fkey";

ALTER TABLE "Property" ADD CONSTRAINT "Property_id_ownerId_key" UNIQUE ("id", "ownerId");
ALTER TABLE "Search" ADD CONSTRAINT "Search_id_ownerId_key" UNIQUE ("id", "ownerId");
ALTER TABLE "PropertyImport" ADD CONSTRAINT "PropertyImport_id_ownerId_key" UNIQUE ("id", "ownerId");

ALTER TABLE "SearchProperty" ADD CONSTRAINT "SearchProperty_searchId_ownerId_fkey"
  FOREIGN KEY ("searchId", "ownerId") REFERENCES "Search"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SearchProperty" ADD CONSTRAINT "SearchProperty_propertyId_ownerId_fkey"
  FOREIGN KEY ("propertyId", "ownerId") REFERENCES "Property"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyImportTarget" ADD CONSTRAINT "PropertyImportTarget_importId_ownerId_fkey"
  FOREIGN KEY ("importId", "ownerId") REFERENCES "PropertyImport"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyImportTarget" ADD CONSTRAINT "PropertyImportTarget_searchId_ownerId_fkey"
  FOREIGN KEY ("searchId", "ownerId") REFERENCES "Search"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
