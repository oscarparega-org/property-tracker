import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Header } from '@/components/header';
import './globals.css';

const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Project Template';
export const metadata: Metadata = { title: appName, description: 'A deployable full-stack project template' };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body><Header /><main className="mx-auto min-h-[calc(100vh-4rem)] max-w-5xl px-6 py-10">{children}</main></body></html>;
}
