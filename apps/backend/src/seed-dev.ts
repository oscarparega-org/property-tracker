import 'dotenv/config';
import { createApp } from './app.js';
import { seedDevelopmentData } from './lib/dev-seed.js';
import { prisma } from './lib/prisma.js';

const email = process.env.DEV_SEED_EMAIL || 'demo@property-tracker.local';
const password = process.env.DEV_SEED_PASSWORD || 'demo-password-123';

async function ensureDevelopmentSeed() {
  if (process.env.NODE_ENV !== 'development' || !process.env.WORKTREE_ID) {
    throw new Error('The development seed may run only inside an initialized worktree.');
  }

  await seedDevelopmentData(prisma, {
    email,
    worktreeId: process.env.WORKTREE_ID,
    createUser: async () => {
      const response = await createApp().request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: process.env.FRONTEND_URL! },
        body: JSON.stringify({ name: 'Usuario Demo', email, password })
      });
      if (!response.ok)
        throw new Error(`Could not create development user (${response.status}): ${await response.text()}`);
    }
  });

  console.log(`[seed] Development data ready for ${email}.`);
}

ensureDevelopmentSeed()
  .catch((error) => {
    console.error('[seed]', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
