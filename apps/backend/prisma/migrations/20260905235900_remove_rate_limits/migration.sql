DROP TABLE "MutationAudit";
DROP TABLE "ProviderUsage";
DROP TABLE "ImportBudget";

ALTER TABLE "ProviderSetting" DROP COLUMN "monthlyOperationLimit";
