import { PropertyPage } from '@/components/property-page';
export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view === 'process' ? 'board' : 'list';
  return <PropertyPage initialView={view} />;
}
