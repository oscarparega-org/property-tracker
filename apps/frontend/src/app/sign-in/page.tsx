import { AuthForm } from '@/components/auth-form';
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  return <AuthForm mode="sign-in" returnTo={(await searchParams).returnTo} />;
}
