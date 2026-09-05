CREATE TYPE "ImportKind" AS ENUM ('STANDARD', 'ENHANCEMENT');

ALTER TABLE "PropertyImport"
ADD COLUMN "kind" "ImportKind" NOT NULL DEFAULT 'STANDARD';

CREATE INDEX "PropertyImport_ownerId_kind_status_idx"
ON "PropertyImport"("ownerId", "kind", "status");
