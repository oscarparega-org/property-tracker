import { describe, expect, it } from 'vitest';
import type { PropertyDto } from '@house-tracker/shared';
import { filterProperties, type PropertyFilters } from './property-filtering';

const baseFilters: PropertyFilters = {
  query: '',
  status: 'ALL',
  types: [],
  minPrice: '',
  maxPrice: '',
  bedrooms: [],
  bathrooms: [],
  minArea: '',
  maxArea: '',
  favoritesOnly: false,
  showArchived: false,
  sort: 'modified_desc'
};

function property(overrides: Partial<PropertyDto>): PropertyDto {
  return {
    id: crypto.randomUUID(),
    title: 'Propiedad',
    propertyType: 'APARTMENT',
    priceAmount: null,
    priceCurrency: 'MXN',
    bedrooms: null,
    bathrooms: null,
    constructionAreaM2: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    isFavorite: false,
    decisionStatus: 'NEW',
    neighborhood: null,
    formattedAddress: null,
    sourceListingKey: null,
    ...overrides
  } as PropertyDto;
}

describe('filterProperties', () => {
  it('combines multi-select and range filters and keeps nulls out of numeric sorting', () => {
    const apartment = property({ priceAmount: 4_000_000, bedrooms: 2, bathrooms: 2, constructionAreaM2: 90 });
    const house = property({ propertyType: 'HOUSE', priceAmount: 7_000_000, bedrooms: 4, bathrooms: 4.5 });
    const missing = property({ propertyType: 'LAND' });
    const result = filterProperties([missing, house, apartment], {
      ...baseFilters,
      types: ['APARTMENT', 'HOUSE'],
      bedrooms: ['2', '4+'],
      minPrice: '3000000',
      maxPrice: '8000000',
      sort: 'price_asc'
    });
    expect(result.map((item) => item.id)).toEqual([apartment.id, house.id]);
  });
});
