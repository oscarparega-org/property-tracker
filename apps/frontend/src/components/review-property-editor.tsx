'use client';

import { useRouter } from 'next/navigation';
import { PropertyEditor } from '@/components/property-editor';
import type { PropertyDto } from '@house-tracker/shared';

export function ReviewPropertyEditor({ property, searchId }: { property: PropertyDto; searchId: string }) {
  const router = useRouter();
  return <PropertyEditor property={property} onClose={() => router.push(`/searches/${searchId}/drafts`)} />;
}
