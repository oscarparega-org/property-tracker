import 'dotenv/config';
import { auth } from './lib/auth.js';
import { bootstrapConfiguredAdmin } from './lib/admin-bootstrap.js';
import { prisma } from './lib/prisma.js';

try {
  const result = await bootstrapConfiguredAdmin(prisma, async ({ email, name, password }) => {
    await auth.api.signUpEmail({ body: { email, name, password } });
  });
  console.log(
    `Configured admin ready: ${result.created ? 'account created' : 'account unchanged'}, ${result.promoted} promoted, ${result.demoted} removed.`
  );
} finally {
  await prisma.$disconnect();
}
