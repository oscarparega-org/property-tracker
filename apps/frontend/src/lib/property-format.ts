import type { PropertyDto } from '@house-tracker/shared';

export const propertyTypeLabels: Record<PropertyDto['propertyType'], string> = {
  APARTMENT: 'Departamento',
  HOUSE: 'Casa',
  LAND: 'Terreno',
  OTHER: 'Otro'
};

export function formatMoney(amount: number | null, currency: string | null) {
  if (amount === null) return 'Precio por confirmar';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency ?? 'MXN',
    maximumFractionDigits: 0
  }).format(amount);
}

export function propertyAddress(property: Pick<PropertyDto, 'formattedAddress' | 'neighborhood' | 'street'>) {
  return property.formattedAddress ?? property.street ?? property.neighborhood ?? 'Ubicación pendiente';
}
