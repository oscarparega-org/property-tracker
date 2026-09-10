import type { PrismaClient } from '@prisma/client';
import { seedConfiguredAdmins } from './admin.js';
import { configuredAdminBootstrap, type AdminBootstrapConfig } from './env.js';

type CreateAdminAccount = (config: AdminBootstrapConfig) => Promise<void>;

export async function bootstrapConfiguredAdmin(
  db: PrismaClient,
  createAccount: CreateAdminAccount,
  source: NodeJS.ProcessEnv = process.env
) {
  const config = configuredAdminBootstrap(source);
  let created = false;

  if (config && !(await db.user.findUnique({ where: { email: config.email }, select: { id: true } }))) {
    await createAccount(config);
    created = true;
  }

  const reconciled = await seedConfiguredAdmins(db, source);
  return { created, ...reconciled };
}
