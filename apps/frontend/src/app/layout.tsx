import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PrivateApp } from '@/components/private-app';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
export const metadata: Metadata = {
  title: 'House Tracker — Mi radar inmobiliario',
  description: 'Organiza, compara y visita las propiedades que te interesan.'
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-MX">
      <body>
        <PrivateApp>{children}</PrivateApp>
      </body>
    </html>
  );
}
