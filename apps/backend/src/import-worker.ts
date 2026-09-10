import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { prisma } from './lib/prisma.js';
import { processImportJob, recoverStaleImports } from './lib/import-jobs.js';

let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});
const heartbeat = setInterval(() => {
  void writeFile('/tmp/house-tracker-worker-heartbeat', String(Date.now())).catch(() => undefined);
}, 10_000);
try {
  while (!stopping) {
    try {
      await recoverStaleImports(prisma);
      const next = await prisma.propertyImport.findFirst({
        where: { status: 'QUEUED', nextAttemptAt: { lte: new Date() } },
        orderBy: { createdAt: 'asc' },
        select: { id: true }
      });
      if (next) await processImportJob(prisma, next.id);
      else await new Promise((resolve) => setTimeout(resolve, 2_000));
    } catch (error) {
      if (stopping) break;
      console.error('Import worker polling failed', error instanceof Error ? error.message : 'unknown error');
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
} finally {
  clearInterval(heartbeat);
  await prisma.$disconnect();
}
