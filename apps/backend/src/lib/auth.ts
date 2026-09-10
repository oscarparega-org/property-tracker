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
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: 'memory',
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60 * 60, max: 5 }
    }
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true
  }
});
