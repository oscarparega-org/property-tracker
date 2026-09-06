import { describe, expect, it } from 'vitest';
import { canonicalizeListingUrl, decisionStatusRequestSchema, type HealthResponse } from './index.js';

describe('shared contracts', () => {
  it('represents a healthy response', () => {
    const value: HealthResponse = {
      status: 'ok',
      database: 'connected',
      timestamp: new Date(0).toISOString()
    };
    expect(value.status).toBe('ok');
  });

  it('validates board status moves', () => {
    expect(decisionStatusRequestSchema.parse({ decisionStatus: 'VISITED' })).toEqual({ decisionStatus: 'VISITED' });
    expect(() => decisionStatusRequestSchema.parse({ decisionStatus: 'UNKNOWN' })).toThrow();
  });

  it('removes accidental spaces before an Inmuebles24 listing id', () => {
    expect(
      canonicalizeListingUrl(
        'https://www.inmuebles24.com/propiedades/clasificado/departamento-en-venta-   148290981.html?n_src=Listado'
      )
    ).toBe('https://www.inmuebles24.com/propiedades/clasificado/departamento-en-venta-148290981.html?n_src=Listado');
  });
});
