import { AdminCatalogReview } from '@/components/admin-catalog-review';
export default async function AdminCatalogReviewPage({ params }: { params: Promise<{ id: string }> }) {
  return <AdminCatalogReview id={(await params).id} />;
}
