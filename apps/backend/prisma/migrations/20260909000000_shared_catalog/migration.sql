CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "CatalogStatus" AS ENUM ('DRAFT', 'ACTIVE', 'UNAVAILABLE');
CREATE TYPE "CatalogSyncStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');
ALTER TYPE "ImportKind" ADD VALUE 'CATALOG';

ALTER TABLE "users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';
ALTER TABLE "PropertyImport" ADD COLUMN "publishOnReady" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SearchProperty" DROP CONSTRAINT "SearchProperty_propertyId_ownerId_fkey";
ALTER TABLE "Property" DROP CONSTRAINT "Property_id_ownerId_key";
ALTER TABLE "Property" ALTER COLUMN "ownerId" DROP NOT NULL;
ALTER TABLE "SearchProperty" ADD CONSTRAINT "SearchProperty_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "states" (
  "id" TEXT NOT NULL,
  "countryCode" VARCHAR(2) NOT NULL DEFAULT 'MX',
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "states_countryCode_slug_key" ON "states"("countryCode", "slug");

CREATE TABLE "municipalities" (
  "id" TEXT NOT NULL,
  "stateId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  CONSTRAINT "municipalities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "municipalities_stateId_slug_key" ON "municipalities"("stateId", "slug");
CREATE INDEX "municipalities_stateId_idx" ON "municipalities"("stateId");
ALTER TABLE "municipalities" ADD CONSTRAINT "municipalities_stateId_fkey"
  FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "neighborhoods" (
  "id" TEXT NOT NULL,
  "municipalityId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  CONSTRAINT "neighborhoods_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "neighborhoods_municipalityId_slug_key" ON "neighborhoods"("municipalityId", "slug");
CREATE INDEX "neighborhoods_municipalityId_idx" ON "neighborhoods"("municipalityId");
ALTER TABLE "neighborhoods" ADD CONSTRAINT "neighborhoods_municipalityId_fkey"
  FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Property" ADD COLUMN "neighborhoodId" TEXT;
CREATE INDEX "Property_neighborhoodId_idx" ON "Property"("neighborhoodId");
ALTER TABLE "Property" ADD CONSTRAINT "Property_neighborhoodId_fkey"
  FOREIGN KEY ("neighborhoodId") REFERENCES "neighborhoods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "catalog_sources" (
  "id" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "discoveryUrl" TEXT NOT NULL,
  "discoveryConfig" JSONB NOT NULL,
  "stateId" TEXT NOT NULL,
  "municipalityId" TEXT NOT NULL,
  "neighborhoodId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastSuccessfulSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "catalog_sources_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "catalog_sources_enabled_idx" ON "catalog_sources"("enabled");
ALTER TABLE "catalog_sources" ADD CONSTRAINT "catalog_sources_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_sources" ADD CONSTRAINT "catalog_sources_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_sources" ADD CONSTRAINT "catalog_sources_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "neighborhoods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "catalog_listings" (
  "propertyId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceListingId" TEXT NOT NULL,
  "sourceModifiedAt" TIMESTAMP(3),
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "CatalogStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "catalog_listings_pkey" PRIMARY KEY ("propertyId")
);
CREATE UNIQUE INDEX "catalog_listings_sourceId_sourceListingId_key" ON "catalog_listings"("sourceId", "sourceListingId");
CREATE INDEX "catalog_listings_status_sourceModifiedAt_idx" ON "catalog_listings"("status", "sourceModifiedAt");
ALTER TABLE "catalog_listings" ADD CONSTRAINT "catalog_listings_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_listings" ADD CONSTRAINT "catalog_listings_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "catalog_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "catalog_sync_runs" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "scheduledDate" TEXT NOT NULL,
  "status" "CatalogSyncStatus" NOT NULL DEFAULT 'RUNNING',
  "discoveredCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "unchangedCount" INTEGER NOT NULL DEFAULT 0,
  "unavailableCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "catalog_sync_runs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "catalog_sync_runs_sourceId_scheduledDate_key" ON "catalog_sync_runs"("sourceId", "scheduledDate");
CREATE INDEX "catalog_sync_runs_status_startedAt_idx" ON "catalog_sync_runs"("status", "startedAt");
ALTER TABLE "catalog_sync_runs" ADD CONSTRAINT "catalog_sync_runs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "catalog_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "states" ("id", "countryCode", "name", "slug") VALUES
  ('mx-cmx', 'MX', 'Ciudad de México', 'ciudad-de-mexico');
INSERT INTO "municipalities" ("id", "stateId", "name", "slug") VALUES
  ('mx-cmx-benito-juarez', 'mx-cmx', 'Benito Juárez', 'benito-juarez');
INSERT INTO "neighborhoods" ("id", "municipalityId", "name", "slug") VALUES
  ('mx-cmx-benito-juarez-narvarte-poniente', 'mx-cmx-benito-juarez', 'Narvarte Poniente', 'narvarte-poniente');
INSERT INTO "catalog_sources" (
  "id", "providerKey", "name", "discoveryUrl", "discoveryConfig", "stateId", "municipalityId", "neighborhoodId", "updatedAt"
) VALUES (
  'remax-narvarte-poniente',
  'remax-mx',
  'RE/MAX Narvarte Poniente',
  'https://remax.com.mx/propiedades/narvarte+poniente_ciudad+de+mexico_ciudad+de+mexico/venta',
  '{"endpoint":"https://remax.com.mx/map/FetchMapData","operation":"1","currency":"MXN","neighborhoodSourceId":"37463"}'::jsonb,
  'mx-cmx',
  'mx-cmx-benito-juarez',
  'mx-cmx-benito-juarez-narvarte-poniente',
  CURRENT_TIMESTAMP
);
INSERT INTO "catalog_sources" (
  "id", "providerKey", "name", "discoveryUrl", "discoveryConfig", "stateId", "municipalityId", "neighborhoodId", "enabled", "updatedAt"
) VALUES (
  'admin-imports', 'admin', 'Importaciones revisadas', 'https://example.invalid/admin-imports', '{}'::jsonb,
  'mx-cmx', 'mx-cmx-benito-juarez', 'mx-cmx-benito-juarez-narvarte-poniente', false, CURRENT_TIMESTAMP
);

UPDATE "Property"
SET "neighborhoodId" = 'mx-cmx-benito-juarez-narvarte-poniente'
WHERE lower(trim(COALESCE("neighborhood", ''))) = 'narvarte poniente'
  AND lower(trim(COALESCE("state", ''))) IN ('ciudad de méxico', 'ciudad de mexico', 'cdmx');

CREATE OR REPLACE FUNCTION enforce_search_property_access() RETURNS trigger AS $$
DECLARE property_owner TEXT;
BEGIN
  SELECT "ownerId" INTO property_owner FROM "Property" WHERE "id" = NEW."propertyId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'property does not exist' USING ERRCODE = '23503';
  END IF;
  IF property_owner IS NOT NULL AND property_owner <> NEW."ownerId" THEN
    RAISE EXCEPTION 'private property owner mismatch' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "SearchProperty_property_access"
  BEFORE INSERT OR UPDATE OF "propertyId", "ownerId" ON "SearchProperty"
  FOR EACH ROW EXECUTE FUNCTION enforce_search_property_access();
