import { z } from 'zod';
import { httpUrl } from './property-input.js';
export const importRequestSchema = z.object({ url: httpUrl.max(4096) });
export const favoriteRequestSchema = z.object({ isFavorite: z.boolean() });
export const archiveRequestSchema = z.object({ archived: z.boolean() });
export type ImportRequest = z.infer<typeof importRequestSchema>;
export type FavoriteRequest = z.infer<typeof favoriteRequestSchema>;
export type ArchiveRequest = z.infer<typeof archiveRequestSchema>;
