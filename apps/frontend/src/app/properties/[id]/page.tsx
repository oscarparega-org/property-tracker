import { LegacyPropertyRoute } from '@/components/legacy-property-route';
export default async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LegacyPropertyRoute id={id} />;
}
