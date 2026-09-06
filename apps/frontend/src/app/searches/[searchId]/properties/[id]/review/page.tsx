import { PropertyPage } from '@/components/property-page';
export default async function ReviewPage({ params }: { params: Promise<{ searchId: string; id: string }> }) {
  const { searchId, id } = await params;
  return <PropertyPage searchId={searchId} id={id} mode="review" />;
}
