import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthForm } from './auth-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe('AuthForm', () => {
  it('renders registration fields', () => {
    render(<AuthForm mode="sign-up" />);
    expect(screen.getByRole('heading', { name: 'Crear una cuenta' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toBeRequired();
    expect(screen.getByLabelText('Correo')).toBeRequired();
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('minLength', '8');
  });
});
