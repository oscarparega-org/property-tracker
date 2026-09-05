import { PropertyPage } from '@/components/property-page';
export default async function Review({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PropertyPage key={id} id={id} mode="review" />;
}
