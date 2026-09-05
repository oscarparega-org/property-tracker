import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { loadEnvironment } from './env.js';
import { prisma } from './prisma.js';

const environment = loadEnvironment();

export const auth = betterAuth({
  baseURL: environment.betterAuthUrl,
  secret: environment.betterAuthSecret,
  trustedOrigins: environment.trustedOrigins,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true
  }
});
