import { z } from 'zod';

export const integrationProviderSchema = z.enum(['OPENAI', 'FIRECRAWL']);
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;

export const providerConnectionStatusSchema = z.enum(['NOT_CONFIGURED', 'DISABLED', 'READY', 'NEEDS_ATTENTION']);
export type ProviderConnectionStatus = z.infer<typeof providerConnectionStatusSchema>;

export const providerSettingsUpdateSchema = z.object({
  enabled: z.boolean(),
  credential: z.string().trim().min(8).max(4096).optional(),
  model: z.string().trim().min(1).max(100).nullable().optional()
});

export type ProviderSettingsUpdate = z.infer<typeof providerSettingsUpdateSchema>;

export type ProviderSettingsDto = {
  provider: IntegrationProvider;
  enabled: boolean;
  credentialConfigured: boolean;
  credentialHint: string | null;
  model: string | null;
  allowedModels: string[];
  validatedAt: string | null;
  status: ProviderConnectionStatus;
};
