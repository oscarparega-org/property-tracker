import type { PrismaClient } from '@prisma/client';
import { HTTPException } from 'hono/http-exception';
import { configuredAdminEmail, loadEnvironment } from './env.js';

export async function seedConfiguredAdmins(db: PrismaClient, source: NodeJS.ProcessEnv = process.env) {
  const email = configuredAdminEmail(source);
  const [promoted, demoted] = await db.$transaction([
    db.user.updateMany({
      where: { email: email ?? '' },
      data: { role: 'ADMIN', adminManagedByConfig: true }
    }),
    db.user.updateMany({
      where: { adminManagedByConfig: true, email: { not: email ?? '' } },
      data: { role: 'USER', adminManagedByConfig: false }
    })
  ]);
  return { promoted: promoted.count, demoted: demoted.count };
}

export async function requireAdmin(db: PrismaClient, userId: string) {
  const environment = loadEnvironment();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, adminManagedByConfig: true }
  });
  if (!user) throw new HTTPException(401, { message: 'Inicia sesión para continuar.' });
  if (user.role === 'ADMIN' && user.adminManagedByConfig && environment.adminEmail !== user.email.toLocaleLowerCase()) {
    await db.user.update({
      where: { id: user.id },
      data: { role: 'USER', adminManagedByConfig: false }
    });
    throw new HTTPException(403, { message: 'Esta acción requiere permisos de administrador.' });
  }
  if (user.role !== 'ADMIN' && environment.adminEmail === user.email.toLocaleLowerCase()) {
    return db.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN', adminManagedByConfig: true },
      select: { id: true, email: true, role: true, adminManagedByConfig: true }
    });
  }
  if (user.role !== 'ADMIN')
    throw new HTTPException(403, { message: 'Esta acción requiere permisos de administrador.' });
  return user;
}
