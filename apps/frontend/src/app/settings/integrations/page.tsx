import { ProviderSettingsPanel } from '@/components/provider-settings-panel';
import { BodyNavigation } from '@/components/body-navigation';

export default function IntegrationsPage() {
  return (
    <main className="settings-page">
      <BodyNavigation current="Configuración e integraciones" />
      <ProviderSettingsPanel />
    </main>
  );
}
