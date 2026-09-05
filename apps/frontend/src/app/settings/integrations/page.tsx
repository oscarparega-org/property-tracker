import Link from 'next/link';
import { MaterialIcon } from '@/components/material-icon';
import { ProviderSettingsPanel } from '@/components/provider-settings-panel';

export default function IntegrationsPage() {
  return (
    <main className="settings-page">
      <header className="detail-topbar">
        <Link href="/" className="detail-brand"><span><MaterialIcon name="home" /></span><strong>Casa Clara</strong></Link>
        <Link href="/" className="back-link"><MaterialIcon name="arrowBack" /> Volver a propiedades</Link>
      </header>
      <ProviderSettingsPanel />
    </main>
  );
}
