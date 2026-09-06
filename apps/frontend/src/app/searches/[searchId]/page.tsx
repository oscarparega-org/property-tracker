import { PropertyPage } from '@/components/property-page';
export default async function SearchPage({ params }: { params: Promise<{ searchId: string }> }) {
  const { searchId } = await params;
  return <PropertyPage searchId={searchId} />;
}
