import { createHmac } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { HTTPException } from 'hono/http-exception';

// Reserve a slot before the operation, including failed attempts. A transaction
// lock prevents simultaneous requests from bypassing the shared daily limit.
export async function reserveWrite(
  db: PrismaClient | Prisma.TransactionClient,
  ownerId: string,
  headers: Headers,
  action: string,
  perHour: number,
  globalPerDay: number
): Promise<void> {
  if ('$transaction' in db)
    return db.$transaction((tx) => reserveWrite(tx, ownerId, headers, action, perHour, globalPerDay));
  const secret = process.env.PUBLIC_WRITE_HASH_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') throw new Error('Missing write hash secret');
  // Forwarded addresses are only trusted when the deployment explicitly opts in.
  const ip =
    process.env.TRUST_PROXY === 'true' ? headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown' : 'unknown';
  const ipHash = createHmac('sha256', secret || 'local-development')
    .update(ip)
    .digest('hex');
  const tx = db;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(731251)::text`;
  const now = Date.now();
  const [account, address, global] = await Promise.all([
    tx.mutationAudit.count({ where: { ownerId, action, createdAt: { gte: new Date(now - 3_600_000) } } }),
    ip === 'unknown'
      ? 0
      : tx.mutationAudit.count({ where: { ipHash, action, createdAt: { gte: new Date(now - 3_600_000) } } }),
    tx.mutationAudit.count({ where: { action, createdAt: { gte: new Date(now - 86_400_000) } } })
  ]);
  if (account >= perHour || address >= perHour || global >= globalPerDay)
    throw new HTTPException(429, { message: 'Se alcanzó el límite temporal. Intenta más tarde.' });
  await tx.mutationAudit.create({ data: { ownerId, action, targetType: 'property', ipHash } });
}
