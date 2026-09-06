BEGIN;

CREATE TABLE "Search" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameKey" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Search_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SearchProperty" (
  "ownerId" TEXT NOT NULL,
  "searchId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "decisionStatus" "DecisionStatus" NOT NULL DEFAULT 'NEW',
  "isFavorite" BOOLEAN NOT NULL DEFAULT false,
  "rating" INTEGER,
  "notes" TEXT,
  "visitAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchProperty_pkey" PRIMARY KEY ("searchId", "propertyId"),
  CONSTRAINT "SearchProperty_rating_check" CHECK ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5))
);

CREATE TABLE "PropertyImportTarget" (
  "ownerId" TEXT NOT NULL,
  "importId" TEXT NOT NULL,
  "searchId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PropertyImportTarget_pkey" PRIMARY KEY ("importId", "searchId")
);

CREATE UNIQUE INDEX "Search_ownerId_nameKey_key" ON "Search"("ownerId", "nameKey");
CREATE UNIQUE INDEX "Search_one_primary_per_owner" ON "Search"("ownerId") WHERE "isPrimary" = true;
CREATE INDEX "Search_ownerId_updatedAt_idx" ON "Search"("ownerId", "updatedAt");
CREATE INDEX "SearchProperty_ownerId_idx" ON "SearchProperty"("ownerId");
CREATE INDEX "SearchProperty_propertyId_idx" ON "SearchProperty"("propertyId");
CREATE INDEX "SearchProperty_searchId_decisionStatus_idx" ON "SearchProperty"("searchId", "decisionStatus");
CREATE INDEX "SearchProperty_searchId_archivedAt_idx" ON "SearchProperty"("searchId", "archivedAt");
CREATE INDEX "SearchProperty_searchId_isFavorite_idx" ON "SearchProperty"("searchId", "isFavorite");
CREATE INDEX "PropertyImportTarget_ownerId_idx" ON "PropertyImportTarget"("ownerId");
CREATE INDEX "PropertyImportTarget_searchId_idx" ON "PropertyImportTarget"("searchId");

ALTER TABLE "Search" ADD CONSTRAINT "Search_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SearchProperty" ADD CONSTRAINT "SearchProperty_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SearchProperty" ADD CONSTRAINT "SearchProperty_searchId_fkey"
  FOREIGN KEY ("searchId") REFERENCES "Search"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SearchProperty" ADD CONSTRAINT "SearchProperty_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyImportTarget" ADD CONSTRAINT "PropertyImportTarget_importId_fkey"
  FOREIGN KEY ("importId") REFERENCES "PropertyImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyImportTarget" ADD CONSTRAINT "PropertyImportTarget_searchId_fkey"
  FOREIGN KEY ("searchId") REFERENCES "Search"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Search" ("id", "ownerId", "name", "nameKey", "isPrimary")
SELECT 'search_' || md5("id" || ':primary'), "id", 'Mi búsqueda', 'mi búsqueda', true
FROM "users";

INSERT INTO "SearchProperty" (
  "ownerId", "searchId", "propertyId", "decisionStatus", "isFavorite", "rating", "notes",
  "visitAt", "rejectionReason", "archivedAt", "createdAt", "updatedAt"
)
SELECT p."ownerId", s."id", p."id", p."decisionStatus", p."isFavorite", p."rating", p."notes",
       p."visitAt", p."rejectionReason", p."archivedAt", p."createdAt", p."updatedAt"
FROM "Property" p
JOIN "Search" s ON s."ownerId" = p."ownerId" AND s."isPrimary" = true;

INSERT INTO "PropertyImportTarget" ("ownerId", "importId", "searchId")
SELECT i."ownerId", i."id", s."id"
FROM "PropertyImport" i
JOIN "Search" s ON s."ownerId" = i."ownerId" AND s."isPrimary" = true
WHERE i."kind" = 'STANDARD';

DO $$
DECLARE
  property_count BIGINT;
  membership_count BIGINT;
  mismatch_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO property_count FROM "Property";
  SELECT COUNT(*) INTO membership_count FROM "SearchProperty";
  IF property_count <> membership_count THEN
    RAISE EXCEPTION 'Multi-search backfill failed: % properties, % memberships', property_count, membership_count;
  END IF;

  SELECT COUNT(*) INTO mismatch_count
  FROM "Property" p
  JOIN "SearchProperty" sp ON sp."propertyId" = p."id"
  WHERE sp."ownerId" <> p."ownerId"
     OR sp."decisionStatus" <> p."decisionStatus"
     OR sp."isFavorite" <> p."isFavorite"
     OR sp."rating" IS DISTINCT FROM p."rating"
     OR sp."notes" IS DISTINCT FROM p."notes"
     OR sp."visitAt" IS DISTINCT FROM p."visitAt"
     OR sp."rejectionReason" IS DISTINCT FROM p."rejectionReason"
     OR sp."archivedAt" IS DISTINCT FROM p."archivedAt";
  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'Multi-search backfill failed: % lifecycle mismatches', mismatch_count;
  END IF;
END $$;

COMMIT;
