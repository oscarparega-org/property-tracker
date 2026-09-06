import { z } from 'zod';

export const decisionStatuses = [
  'NEW',
  'CONTACTED',
  'VISIT_SCHEDULED',
  'VISITED',
  'OFFER_MADE',
  'REJECTED',
  'PURCHASED'
] as const;

export type DecisionStatus = (typeof decisionStatuses)[number];

export const searchNameSchema = z.string().trim().min(1, 'Escribe un nombre para la búsqueda.').max(80);
export const createSearchRequestSchema = z.object({ name: searchNameSchema });
export const searchIdsSchema = z
  .array(z.string().min(1))
  .min(1)
  .max(3)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'Selecciona cada búsqueda una sola vez.'
  });
export const membershipRequestSchema = z.object({ searchIds: searchIdsSchema });

export type SearchDto = {
  id: string;
  name: string;
  isPrimary: boolean;
  propertyCount: number;
  draftCount: number;
  statusCounts: Partial<Record<DecisionStatus, number>>;
  createdAt: string;
  updatedAt: string;
};

export type SearchReferenceDto = Pick<SearchDto, 'id' | 'name' | 'isPrimary'>;
export type CreateSearchRequest = z.infer<typeof createSearchRequestSchema>;
export type MembershipRequest = z.infer<typeof membershipRequestSchema>;
