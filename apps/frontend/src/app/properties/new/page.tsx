import Link from 'next/link';
import { BodyNavigation } from '@/components/body-navigation';
import { NewManualEditor } from '@/components/new-manual-editor';
import { UrlImportForm } from '@/components/url-import-form';

export default async function NewPropertyPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const mode = (await searchParams).mode === 'manual' ? 'manual' : 'url';
  if (mode === 'manual') return <NewManualEditor />;
  return (
    <main className="add-page">
      <BodyNavigation current="Agregar propiedad" backLabel="Cerrar" />
      <section className="add-card">
        <span className="eyebrow">Nueva propiedad</span>
        <h1>¿Cómo quieres agregarla?</h1>
        <nav className="add-tabs">
          <Link className="is-active" href="/properties/new">
            Desde una URL
          </Link>
          <Link href="/properties/new?mode=manual">Captura manual</Link>
        </nav>
        <UrlImportForm />
      </section>
    </main>
  );
}
