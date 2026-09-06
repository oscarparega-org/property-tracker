import { SearchAddPage } from '@/components/search-add-page';
export default async function NewPropertyPage({
  params,
  searchParams
}: {
  params: Promise<{ searchId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const [{ searchId }, query] = await Promise.all([params, searchParams]);
  return <SearchAddPage searchId={searchId} mode={query.mode === 'manual' ? 'manual' : 'url'} />;
}
