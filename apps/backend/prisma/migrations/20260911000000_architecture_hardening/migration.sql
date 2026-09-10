ALTER TABLE "users"
  ADD COLUMN "adminManagedByConfig" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PropertyImport"
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP INDEX IF EXISTS "PropertyImport_status_createdAt_idx";
CREATE INDEX "PropertyImport_status_nextAttemptAt_createdAt_idx"
  ON "PropertyImport"("status", "nextAttemptAt", "createdAt");

CREATE INDEX "Property_publicationStatus_neighborhoodId_propertyType_idx"
  ON "Property"("publicationStatus", "neighborhoodId", "propertyType");
CREATE INDEX "Property_publicationStatus_priceAmount_idx"
  ON "Property"("publicationStatus", "priceAmount");
CREATE INDEX "Property_publicationStatus_constructionAreaM2_idx"
  ON "Property"("publicationStatus", "constructionAreaM2");
CREATE INDEX "Property_publicationStatus_bedrooms_idx"
  ON "Property"("publicationStatus", "bedrooms");
CREATE INDEX "Property_publicationStatus_bathrooms_idx"
  ON "Property"("publicationStatus", "bathrooms");

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Property_title_trgm_idx" ON "Property" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "Property_formattedAddress_trgm_idx" ON "Property" USING GIN ("formattedAddress" gin_trgm_ops);
CREATE INDEX "Property_street_trgm_idx" ON "Property" USING GIN ("street" gin_trgm_ops);
CREATE INDEX "Property_sourceListingKey_trgm_idx" ON "Property" USING GIN ("sourceListingKey" gin_trgm_ops);

CREATE OR REPLACE FUNCTION enforce_catalog_source_hierarchy() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "municipalities" m
    JOIN "neighborhoods" n ON n."municipalityId" = m."id"
    WHERE m."id" = NEW."municipalityId"
      AND m."stateId" = NEW."stateId"
      AND n."id" = NEW."neighborhoodId"
  ) THEN
    RAISE EXCEPTION 'catalog source location hierarchy mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CatalogSource_location_hierarchy"
  BEFORE INSERT OR UPDATE OF "stateId", "municipalityId", "neighborhoodId" ON "catalog_sources"
  FOR EACH ROW EXECUTE FUNCTION enforce_catalog_source_hierarchy();

CREATE OR REPLACE FUNCTION normalize_property_location() RETURNS trigger AS $$
DECLARE
  neighborhood_name TEXT;
  municipality_name TEXT;
  state_name TEXT;
BEGIN
  IF NEW."neighborhoodId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT n."name", m."name", s."name"
    INTO neighborhood_name, municipality_name, state_name
  FROM "neighborhoods" n
  JOIN "municipalities" m ON m."id" = n."municipalityId"
  JOIN "states" s ON s."id" = m."stateId"
  WHERE n."id" = NEW."neighborhoodId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'property neighborhood does not exist' USING ERRCODE = '23503';
  END IF;
  NEW."neighborhood" = neighborhood_name;
  NEW."municipality" = municipality_name;
  NEW."state" = state_name;
  NEW."countryCode" = 'MX';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Property_normalize_location"
  BEFORE INSERT OR UPDATE OF "neighborhoodId", "neighborhood", "municipality", "state" ON "Property"
  FOR EACH ROW EXECUTE FUNCTION normalize_property_location();

UPDATE "Property"
SET "neighborhoodId" = "neighborhoodId"
WHERE "neighborhoodId" IS NOT NULL;

UPDATE "users"
SET "adminManagedByConfig" = true
WHERE "role" = 'ADMIN';
