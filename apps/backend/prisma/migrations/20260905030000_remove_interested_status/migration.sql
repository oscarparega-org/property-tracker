-- Consolidate the two initial discovery states before removing INTERESTED.
UPDATE "Property" SET "decisionStatus" = 'NEW' WHERE "decisionStatus" = 'INTERESTED';

ALTER TYPE "DecisionStatus" RENAME TO "DecisionStatus_old";
CREATE TYPE "DecisionStatus" AS ENUM ('NEW', 'CONTACTED', 'VISIT_SCHEDULED', 'VISITED', 'OFFER_MADE', 'REJECTED', 'PURCHASED');

ALTER TABLE "Property" ALTER COLUMN "decisionStatus" DROP DEFAULT;
ALTER TABLE "Property"
  ALTER COLUMN "decisionStatus" TYPE "DecisionStatus"
  USING ("decisionStatus"::text::"DecisionStatus");
ALTER TABLE "Property" ALTER COLUMN "decisionStatus" SET DEFAULT 'NEW';

DROP TYPE "DecisionStatus_old";
