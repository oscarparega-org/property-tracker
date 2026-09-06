import { z } from 'zod';
import { httpUrl } from './property-input.js';
import { searchIdsSchema } from './search.js';
export const importRequestSchema = z.object({ url: httpUrl.max(4096), searchIds: searchIdsSchema.optional() });
export const favoriteRequestSchema = z.object({ isFavorite: z.boolean() });
export const archiveRequestSchema = z.object({ archived: z.boolean() });
export const deletePropertyRequestSchema = z.object({ confirmationTitle: z.string().trim().min(1) });
export const decisionStatusRequestSchema = z.object({
  decisionStatus: z.enum(['NEW', 'CONTACTED', 'VISIT_SCHEDULED', 'VISITED', 'OFFER_MADE', 'REJECTED', 'PURCHASED'])
});
export type ImportRequest = z.infer<typeof importRequestSchema>;
export type FavoriteRequest = z.infer<typeof favoriteRequestSchema>;
export type ArchiveRequest = z.infer<typeof archiveRequestSchema>;
export type DeletePropertyRequest = z.infer<typeof deletePropertyRequestSchema>;
export type DecisionStatusRequest = z.infer<typeof decisionStatusRequestSchema>;
