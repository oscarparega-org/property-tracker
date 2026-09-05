CREATE TYPE "IntegrationProvider" AS ENUM ('OPENAI', 'FIRECRAWL');

CREATE TABLE "ProviderSetting" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT,
    "monthlyOperationLimit" INTEGER NOT NULL,
    "credentialCiphertext" BYTEA,
    "credentialIv" BYTEA,
    "credentialAuthTag" BYTEA,
    "credentialHint" TEXT,
    "validatedAt" TIMESTAMP(3),
    "needsAttention" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderSetting_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProviderSetting_monthlyOperationLimit_check" CHECK ("monthlyOperationLimit" BETWEEN 1 AND 1000000),
    CONSTRAINT "ProviderSetting_credential_parts_check" CHECK (
      ("credentialCiphertext" IS NULL AND "credentialIv" IS NULL AND "credentialAuthTag" IS NULL AND "credentialHint" IS NULL)
      OR
      ("credentialCiphertext" IS NOT NULL AND "credentialIv" IS NOT NULL AND "credentialAuthTag" IS NOT NULL AND "credentialHint" IS NOT NULL)
    )
);

CREATE TABLE "ProviderUsage" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "month" TEXT NOT NULL,
    "operationCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderUsage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProviderUsage_operationCount_check" CHECK ("operationCount" >= 0)
);

CREATE UNIQUE INDEX "ProviderSetting_ownerId_provider_key" ON "ProviderSetting"("ownerId", "provider");
CREATE INDEX "ProviderSetting_ownerId_idx" ON "ProviderSetting"("ownerId");
CREATE UNIQUE INDEX "ProviderUsage_ownerId_provider_month_key" ON "ProviderUsage"("ownerId", "provider", "month");
CREATE INDEX "ProviderUsage_ownerId_month_idx" ON "ProviderUsage"("ownerId", "month");

ALTER TABLE "ProviderSetting" ADD CONSTRAINT "ProviderSetting_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderUsage" ADD CONSTRAINT "ProviderUsage_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
