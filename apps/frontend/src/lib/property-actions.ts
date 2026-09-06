'use client';
import type { PropertyDto, FavoriteRequest, ArchiveRequest, DecisionStatusRequest } from '@house-tracker/shared';
import { requestApi } from './request-api';

function normalizeVisit(form: FormData) {
  const value = form.get('visitAt');
  if (typeof value === 'string' && value) form.set('visitAt', new Date(value).toISOString());
}

export async function savePropertyAction(form: FormData) {
  normalizeVisit(form);
  const id = String(form.get('id') || '');
  return requestApi<PropertyDto>(`/api/properties${id ? `/${encodeURIComponent(id)}` : ''}`, {
    method: id ? 'PUT' : 'POST',
    body: form
  });
}
export async function saveDecisionAction(form: FormData) {
  normalizeVisit(form);
  return requestApi<PropertyDto>(`/api/properties/${encodeURIComponent(String(form.get('id')))}/decision`, {
    method: 'PATCH',
    body: form
  });
}
export async function toggleFavoriteAction(id: string, isFavorite: boolean) {
  return requestApi<PropertyDto>(`/api/properties/${encodeURIComponent(id)}/favorite`, {
    method: 'PATCH',
    body: JSON.stringify({ isFavorite } satisfies FavoriteRequest)
  });
}
export async function setArchivedAction(id: string, archived: boolean) {
  return requestApi<PropertyDto>(`/api/properties/${encodeURIComponent(id)}/archive`, {
    method: 'PATCH',
    body: JSON.stringify({ archived } satisfies ArchiveRequest)
  });
}
export async function setDecisionStatusAction(id: string, decisionStatus: PropertyDto['decisionStatus']) {
  return requestApi<PropertyDto>(`/api/properties/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ decisionStatus } satisfies DecisionStatusRequest)
  });
}
