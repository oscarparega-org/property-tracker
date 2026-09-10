import type { PropertyDto } from '@house-tracker/shared';

export type ThresholdToken = '1' | '2' | '3' | '4+';
export type BathroomToken = '1' | '1.5' | '2' | '2.5' | '3' | '3.5' | '4+';
export type PropertySort = 'modified_desc' | 'price_asc' | 'price_desc' | 'area_asc' | 'area_desc';

export type PropertyFilters = {
  query: string;
  status: string;
  types: PropertyDto['propertyType'][];
  minPrice: string;
  maxPrice: string;
  bedrooms: ThresholdToken[];
  bathrooms: BathroomToken[];
  minArea: string;
  maxArea: string;
  favoritesOnly: boolean;
  showArchived: boolean;
  sort: PropertySort;
};

function matchesNumber(value: number | null, tokens: readonly string[]) {
  if (!tokens.length) return true;
  if (value === null) return false;
  return tokens.some((token) => (token === '4+' ? value >= 4 : value === Number(token)));
}

function compareNullable(a: number | null, b: number | null, direction: 1 | -1) {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

export function filterProperties(properties: PropertyDto[], filters: PropertyFilters) {
  const needle = filters.query.trim().toLocaleLowerCase('es-MX');
  return properties
    .filter((property) => {
      if (!filters.showArchived && property.archivedAt) return false;
      if (filters.status !== 'ALL' && property.decisionStatus !== filters.status) return false;
      if (filters.types.length && !filters.types.includes(property.propertyType)) return false;
      if (filters.minPrice && (property.priceAmount === null || property.priceAmount < Number(filters.minPrice)))
        return false;
      if (filters.maxPrice && (property.priceAmount === null || property.priceAmount > Number(filters.maxPrice)))
        return false;
      if (!matchesNumber(property.bedrooms, filters.bedrooms)) return false;
      if (!matchesNumber(property.bathrooms, filters.bathrooms)) return false;
      if (
        filters.minArea &&
        (property.constructionAreaM2 === null || property.constructionAreaM2 < Number(filters.minArea))
      )
        return false;
      if (
        filters.maxArea &&
        (property.constructionAreaM2 === null || property.constructionAreaM2 > Number(filters.maxArea))
      )
        return false;
      if (filters.favoritesOnly && !property.isFavorite) return false;
      if (!needle) return true;
      return [property.title, property.neighborhood, property.formattedAddress, property.sourceListingKey]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('es-MX').includes(needle));
    })
    .sort((a, b) => {
      if (filters.sort === 'price_asc') return compareNullable(a.priceAmount, b.priceAmount, 1);
      if (filters.sort === 'price_desc') return compareNullable(a.priceAmount, b.priceAmount, -1);
      if (filters.sort === 'area_asc') return compareNullable(a.constructionAreaM2, b.constructionAreaM2, 1);
      if (filters.sort === 'area_desc') return compareNullable(a.constructionAreaM2, b.constructionAreaM2, -1);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}
