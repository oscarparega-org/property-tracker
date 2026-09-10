import { CatalogDetail } from '@/components/catalog-detail';
import type { CatalogPropertyDto } from '@house-tracker/shared';
import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function CatalogPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const property = await serverApi<CatalogPropertyDto>(`/api/catalog/properties/${encodeURIComponent(id)}`).catch(
    () => null
  );
  if (!property) notFound();
  return <CatalogDetail property={property} />;
}
