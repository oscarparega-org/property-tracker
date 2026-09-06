import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthForm } from './auth-form';
import { SkipLink } from './skip-link';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn()
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { email: mocks.signIn },
    signUp: { email: mocks.signUp }
  }
}));

describe('AuthForm', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders registration fields and a working keyboard skip target', () => {
    render(
      <>
        <SkipLink />
        <AuthForm mode="sign-up" />
      </>
    );

    expect(screen.getByRole('heading', { name: 'Crear una cuenta' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toBeRequired();
    expect(screen.getByLabelText('Correo')).toBeRequired();
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('minLength', '8');

    const skipLink = screen.getByRole('link', { name: 'Saltar al contenido' });
    const main = screen.getByRole('main');
    expect(skipLink).toHaveAttribute('href', `#${main.id}`);
    expect(main).toHaveAttribute('tabindex', '-1');
    skipLink.focus();
    expect(skipLink).toHaveFocus();
  });

  it('renders the sign-in variant without the registration-only field', () => {
    render(<AuthForm mode="sign-in" />);

    expect(screen.getByRole('heading', { name: 'Qué gusto verte' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/sign-up');
  });

  it('disables submission while authentication is pending and navigates on success', async () => {
    let resolveSignIn: (value: { error: null }) => void = () => undefined;
    mocks.signIn.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      })
    );
    render(<AuthForm mode="sign-in" />);

    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'buyer@example.com' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secure-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(screen.getByRole('button', { name: 'Espera un momento…' })).toBeDisabled();
    await act(async () => resolveSignIn({ error: null }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/'));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('announces authentication errors without navigating', async () => {
    mocks.signIn.mockResolvedValue({ error: { message: 'Credenciales incorrectas' } });
    render(<AuthForm mode="sign-in" />);

    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'buyer@example.com' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales incorrectas');
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
