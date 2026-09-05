import type { auth } from './lib/auth.js';

export type Session = typeof auth.$Infer.Session;
export type AppVariables = { session: Session | null };
