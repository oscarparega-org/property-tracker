'use client';

import { useRouter } from 'next/navigation';
import { PropertyEditor } from '@/components/property-editor';
import type { PropertyDto } from '@template/shared';

const emptyProperty: PropertyDto = {
  id: '',
  sourceProvider: 'MANUAL',
  sourceUrl: null,
  sourceListingId: null,
  sourceListingKey: null,
  sourceObservedAt: new Date().toISOString(),
  sourceMetadata: { manual: true },
  title: 'Nueva propiedad',
  description: null,
  propertyType: 'APARTMENT',
  operationType: 'SALE',
  priceAmount: null,
  priceCurrency: 'MXN',
  street: null,
  exteriorNumber: null,
  interiorNumber: null,
  neighborhood: null,
  municipality: null,
  state: null,
  postalCode: null,
  countryCode: 'MX',
  formattedAddress: null,
  latitude: null,
  longitude: null,
  landAreaM2: null,
  constructionAreaM2: null,
  bedrooms: null,
  bathrooms: null,
  parkingSpaces: null,
  parkingType: null,
  serviceRoom: null,
  propertyAgeYears: null,
  condition: null,
  orientation: null,
  landUse: null,
  buildingLevels: null,
  unitFloor: null,
  maintenanceAmount: null,
  maintenanceCurrency: 'MXN',
  technicalSheetQrUrl: null,
  agentName: null,
  agentAvatarUrl: null,
  agentPhones: [],
  agentEmail: null,
  officeName: null,
  sourceOfficeId: null,
  decisionStatus: 'NEW',
  isFavorite: false,
  rating: null,
  notes: null,
  visitAt: null,
  rejectionReason: null,
  archivedAt: null,
  publicationStatus: 'DRAFT',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  images: [],
  features: []
};

export function NewManualEditor() {
  const router = useRouter();
  return <PropertyEditor property={emptyProperty} creating onClose={() => router.push('/')} />;
}
