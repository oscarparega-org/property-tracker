CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'HOUSE', 'LAND', 'OTHER');
CREATE TABLE "ImportBudget" ("month" TEXT PRIMARY KEY, "firecrawl" INTEGER NOT NULL DEFAULT 0, "aiCalls" INTEGER NOT NULL DEFAULT 0);
CREATE TYPE "OperationType" AS ENUM ('SALE');
CREATE TYPE "DecisionStatus" AS ENUM ('NEW', 'INTERESTED', 'CONTACTED', 'VISIT_SCHEDULED', 'VISITED', 'OFFER_MADE', 'REJECTED', 'PURCHASED');
CREATE TYPE "FeatureCategory" AS ENUM ('AREA', 'EQUIPMENT', 'OTHER');

CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "sourceProvider" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceListingId" TEXT,
    "sourceListingKey" TEXT,
    "sourceObservedAt" TIMESTAMP(3) NOT NULL,
    "sourceMetadata" JSONB NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "propertyType" "PropertyType" NOT NULL,
    "operationType" "OperationType" NOT NULL DEFAULT 'SALE',
    "priceAmount" DECIMAL(14,2),
    "priceCurrency" VARCHAR(3),
    "street" TEXT,
    "exteriorNumber" TEXT,
    "interiorNumber" TEXT,
    "neighborhood" TEXT,
    "municipality" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "countryCode" VARCHAR(2) NOT NULL DEFAULT 'MX',
    "formattedAddress" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "landAreaM2" DECIMAL(10,2),
    "constructionAreaM2" DECIMAL(10,2),
    "bedrooms" INTEGER,
    "bathrooms" DECIMAL(4,1),
    "parkingSpaces" INTEGER,
    "parkingType" TEXT,
    "serviceRoom" BOOLEAN,
    "propertyAgeYears" INTEGER,
    "condition" TEXT,
    "orientation" TEXT,
    "landUse" TEXT,
    "buildingLevels" INTEGER,
    "unitFloor" INTEGER,
    "maintenanceAmount" DECIMAL(12,2),
    "maintenanceCurrency" VARCHAR(3),
    "technicalSheetQrUrl" TEXT,
    "agentName" TEXT,
    "agentAvatarUrl" TEXT,
    "agentPhones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "agentEmail" TEXT,
    "officeName" TEXT,
    "sourceOfficeId" TEXT,
    "decisionStatus" "DecisionStatus" NOT NULL DEFAULT 'NEW',
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "rating" INTEGER,
    "notes" TEXT,
    "visitAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Property_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Property_rating_check" CHECK ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5))
);

CREATE TABLE "PropertyImage" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "PropertyImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PropertyFeature" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "category" "FeatureCategory" NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "PropertyFeature_pkey" PRIMARY KEY ("id")
);



CREATE INDEX "Property_decisionStatus_idx" ON "Property"("decisionStatus");
CREATE INDEX "Property_archivedAt_idx" ON "Property"("archivedAt");
CREATE INDEX "Property_isFavorite_idx" ON "Property"("isFavorite");
CREATE UNIQUE INDEX "PropertyImage_propertyId_url_key" ON "PropertyImage"("propertyId", "url");
CREATE INDEX "PropertyImage_propertyId_sortOrder_idx" ON "PropertyImage"("propertyId", "sortOrder");
CREATE UNIQUE INDEX "PropertyFeature_propertyId_category_name_key" ON "PropertyFeature"("propertyId", "category", "name");
CREATE INDEX "PropertyFeature_propertyId_idx" ON "PropertyFeature"("propertyId");

ALTER TABLE "PropertyImage" ADD CONSTRAINT "PropertyImage_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyFeature" ADD CONSTRAINT "PropertyFeature_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "ImportStatus" AS ENUM ('QUEUED', 'FETCHING', 'RENDERING', 'EXTRACTING', 'READY', 'FAILED');

ALTER TABLE "Property" ALTER COLUMN "sourceUrl" DROP NOT NULL;
ALTER TABLE "Property" ADD COLUMN "publicationStatus" "PublicationStatus" NOT NULL DEFAULT 'PUBLISHED';

CREATE TABLE "PropertyImport" (
  "id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "canonicalUrl" TEXT NOT NULL,
  "status" "ImportStatus" NOT NULL DEFAULT 'QUEUED',
  "strategy" TEXT,
  "provider" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "draftData" JSONB,
  "evidence" JSONB,
  "errorMessage" TEXT,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "firecrawlCredits" INTEGER NOT NULL DEFAULT 0,
  "processingStartedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "propertyId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PropertyImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MutationAudit" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "ipHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MutationAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Property_publicationStatus_idx" ON "Property"("publicationStatus");
CREATE INDEX "PropertyImport_status_createdAt_idx" ON "PropertyImport"("status", "createdAt");
CREATE INDEX "PropertyImport_canonicalUrl_idx" ON "PropertyImport"("canonicalUrl");
CREATE INDEX "PropertyImport_createdAt_idx" ON "PropertyImport"("createdAt");
CREATE INDEX "MutationAudit_ipHash_action_createdAt_idx" ON "MutationAudit"("ipHash", "action", "createdAt");
CREATE INDEX "MutationAudit_action_createdAt_idx" ON "MutationAudit"("action", "createdAt");

ALTER TABLE "PropertyImport" ADD CONSTRAINT "PropertyImport_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Property" ADD COLUMN "ownerId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Property_ownerId_idx" ON "Property"("ownerId");

ALTER TABLE "PropertyImport" ADD COLUMN "ownerId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "PropertyImport_ownerId_idx" ON "PropertyImport"("ownerId");

ALTER TABLE "MutationAudit" ADD COLUMN "ownerId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "MutationAudit_ownerId_idx" ON "MutationAudit"("ownerId");

CREATE UNIQUE INDEX "Property_ownerId_sourceUrl_key" ON "Property"("ownerId", "sourceUrl");
CREATE UNIQUE INDEX "Property_ownerId_sourceProvider_sourceListingId_key" ON "Property"("ownerId", "sourceProvider", "sourceListingId");
CREATE INDEX "Property_ownerId_publicationStatus_idx" ON "Property"("ownerId", "publicationStatus");
CREATE INDEX "PropertyImport_ownerId_canonicalUrl_idx" ON "PropertyImport"("ownerId", "canonicalUrl");
