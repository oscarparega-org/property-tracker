import { describe, expect, it } from 'vitest';
import {
  canonicalizeListingUrl,
  catalogQuerySchema,
  createSearchRequestSchema,
  deletePropertyRequestSchema,
  decisionStatusRequestSchema,
  membershipRequestSchema,
  type HealthResponse
} from './index.js';

describe('shared contracts', () => {
  it('represents a healthy response', () => {
    const value: HealthResponse = {
      status: 'ok',
      database: 'connected',
      timestamp: new Date(0).toISOString()
    };
    expect(value.status).toBe('ok');
  });
  it('validates search names and memberships', () => {
    expect(createSearchRequestSchema.parse({ name: '  Roma Norte  ' })).toEqual({ name: 'Roma Norte' });
    expect(membershipRequestSchema.parse({ searchIds: ['a', 'b'] })).toEqual({ searchIds: ['a', 'b'] });
    expect(() => membershipRequestSchema.parse({ searchIds: ['a', 'a'] })).toThrow();
    expect(() => membershipRequestSchema.parse({ searchIds: [] })).toThrow();
    expect(deletePropertyRequestSchema.parse({ confirmationTitle: '  Casa Roma  ' })).toEqual({
      confirmationTitle: 'Casa Roma'
    });
  });

  it('validates board status moves', () => {
    expect(decisionStatusRequestSchema.parse({ decisionStatus: 'VISITED' })).toEqual({ decisionStatus: 'VISITED' });
    expect(() => decisionStatusRequestSchema.parse({ decisionStatus: 'UNKNOWN' })).toThrow();
  });

  it('validates catalog inventory filters', () => {
    expect(
      catalogQuerySchema.parse({
        propertyTypes: 'APARTMENT,HOUSE,APARTMENT',
        minPrice: '3000000',
        maxPrice: '5000000',
        bedrooms: '1,2,4+',
        bathrooms: '1.5,2,4+',
        minConstructionAreaM2: '70',
        maxConstructionAreaM2: '120',
        sort: 'area_desc'
      })
    ).toMatchObject({
      propertyTypes: ['APARTMENT', 'HOUSE'],
      minPrice: 3_000_000,
      maxPrice: 5_000_000,
      bedrooms: ['1', '2', '4+'],
      bathrooms: ['1.5', '2', '4+'],
      minConstructionAreaM2: 70,
      maxConstructionAreaM2: 120,
      sort: 'area_desc'
    });
    expect(() => catalogQuerySchema.parse({ bedrooms: '2,5' })).toThrow();
    expect(() => catalogQuerySchema.parse({ bathrooms: '2.25' })).toThrow();
    expect(() => catalogQuerySchema.parse({ minPrice: '6000000', maxPrice: '5000000' })).toThrow();
    expect(() => catalogQuerySchema.parse({ minConstructionAreaM2: '120', maxConstructionAreaM2: '80' })).toThrow();
  });

  it('removes accidental spaces before an Inmuebles24 listing id', () => {
    expect(
      canonicalizeListingUrl(
        'https://www.inmuebles24.com/propiedades/clasificado/departamento-en-venta-   148290981.html?n_src=Listado'
      )
    ).toBe('https://www.inmuebles24.com/propiedades/clasificado/departamento-en-venta-148290981.html?n_src=Listado');
  });
});
