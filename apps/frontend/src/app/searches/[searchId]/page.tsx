import { PropertyPage } from '@/components/property-page';
export default async function SearchPage({
  params,
  searchParams
}: {
  params: Promise<{ searchId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { searchId } = await params;
  const initialView = (await searchParams).view === 'process' ? 'board' : 'list';
  return <PropertyPage searchId={searchId} initialView={initialView} />;
}
