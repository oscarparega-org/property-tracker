import { LegacyPropertyRoute } from '@/components/legacy-property-route';
export default async function Review({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LegacyPropertyRoute id={id} review />;
}
