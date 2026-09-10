import { z } from 'zod';
import type { PropertyDto } from './property.js';

export type CatalogStatus = 'DRAFT' | 'ACTIVE' | 'UNAVAILABLE';

export type CatalogLocationTreeDto = Array<{
  id: string;
  name: string;
  slug: string;
  municipalities: Array<{
    id: string;
    name: string;
    slug: string;
    neighborhoods: Array<{ id: string; name: string; slug: string }>;
  }>;
}>;

export type CatalogSourceStatusDto = {
  sourceId: string;
  name: string;
  healthy: boolean;
  stale: boolean;
  activeListings: number;
  lastSuccessfulSyncAt: string | null;
  lastRun: {
    status: 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
    startedAt: string;
    completedAt: string | null;
    failedCount: number;
  } | null;
};

export type CatalogPropertyDto = Omit<
  PropertyDto,
  | 'searchId'
  | 'memberships'
  | 'decisionStatus'
  | 'isFavorite'
  | 'rating'
  | 'notes'
  | 'visitAt'
  | 'rejectionReason'
  | 'archivedAt'
  | 'sourceMetadata'
> & {
  catalogStatus: CatalogStatus;
  location: {
    state: { id: string; name: string };
    municipality: { id: string; name: string };
    neighborhood: { id: string; name: string };
  };
};

export type CatalogPageDto = {
  items: CatalogPropertyDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const propertyTypeSchema = z.enum(['APARTMENT', 'HOUSE', 'LAND', 'OTHER']);
const bedroomTokenSchema = z.enum(['1', '2', '3', '4+']);
const bathroomTokenSchema = z.enum(['1', '1.5', '2', '2.5', '3', '3.5', '4+']);

function commaSeparated<T extends string>(item: z.ZodType<T>) {
  return z.string().transform((value, context) => {
    const parsed = z
      .array(item)
      .min(1)
      .safeParse([
        ...new Set(
          value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
        )
      ]);
    if (parsed.success) return parsed.data;
    context.addIssue({ code: 'custom', message: 'La selección contiene un valor inválido.' });
    return z.NEVER;
  });
}

export const catalogQuerySchema = z
  .object({
    q: z.string().trim().max(120).optional().default(''),
    stateId: z.string().trim().max(120).optional(),
    municipalityId: z.string().trim().max(160).optional(),
    neighborhoodId: z.string().trim().max(200).optional(),
    propertyTypes: commaSeparated(propertyTypeSchema).optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    bedrooms: commaSeparated(bedroomTokenSchema).optional(),
    bathrooms: commaSeparated(bathroomTokenSchema).optional(),
    minConstructionAreaM2: z.coerce.number().nonnegative().optional(),
    maxConstructionAreaM2: z.coerce.number().nonnegative().optional(),
    sort: z
      .enum(['modified_desc', 'price_asc', 'price_desc', 'area_asc', 'area_desc'])
      .optional()
      .default('modified_desc'),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(60).optional().default(24)
  })
  .superRefine((query, context) => {
    if (query.minPrice !== undefined && query.maxPrice !== undefined && query.minPrice > query.maxPrice)
      context.addIssue({ code: 'custom', path: ['maxPrice'], message: 'El precio máximo debe ser mayor al mínimo.' });
    if (
      query.minConstructionAreaM2 !== undefined &&
      query.maxConstructionAreaM2 !== undefined &&
      query.minConstructionAreaM2 > query.maxConstructionAreaM2
    )
      context.addIssue({
        code: 'custom',
        path: ['maxConstructionAreaM2'],
        message: 'La construcción máxima debe ser mayor a la mínima.'
      });
  });

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export const addCatalogPropertyRequestSchema = z.object({ propertyId: z.string().min(1) });
export const adminCatalogImportRequestSchema = z.object({ url: z.url().max(4096) });

export type AddCatalogPropertyRequest = z.infer<typeof addCatalogPropertyRequestSchema>;
export type AdminCatalogImportRequest = z.infer<typeof adminCatalogImportRequestSchema>;
export type CurrentUserCapabilitiesDto = { authenticated: boolean; role: 'USER' | 'ADMIN' };
