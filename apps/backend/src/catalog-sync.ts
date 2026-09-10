import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { prisma } from './lib/prisma.js';
import { catalogScheduleState, syncCatalogSource } from './lib/catalog-sync.js';
import { loadEnvironment } from './lib/env.js';

const once = process.argv.includes('--once');
const force = process.argv.includes('--force');
let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));

async function run(forceRun = false) {
  const environment = loadEnvironment();
  const summaries = [];
  let failures = 0;
  const sources = await prisma.catalogSource.findMany({ where: { enabled: true }, select: { id: true } });
  for (const source of sources) {
    try {
      const summary = await syncCatalogSource(prisma, source.id, {
        force: forceRun,
        timeZone: environment.catalogSyncTimeZone
      });
      if (summary) summaries.push(summary);
    } catch (error) {
      failures += 1;
      console.error(`Catalog source ${source.id} failed`, error instanceof Error ? error.message : 'unknown error');
    }
  }
  console.log(JSON.stringify({ catalogSync: summaries }, null, 2));
  if (failures) throw new Error(`${failures} catalog source sync${failures === 1 ? '' : 's'} failed.`);
}

const heartbeat = setInterval(() => {
  void writeFile('/tmp/house-tracker-catalog-heartbeat', String(Date.now())).catch(() => undefined);
}, 30_000);
await writeFile('/tmp/house-tracker-catalog-heartbeat', String(Date.now())).catch(() => undefined);
try {
  if (once) await run(force);
  else {
    while (!stopping) {
      const environment = loadEnvironment();
      const schedule = catalogScheduleState(new Date(), environment.catalogSyncTimeZone, environment.catalogSyncHour);
      if (schedule.due) {
        try {
          await run(false);
        } catch (error) {
          console.error('Scheduled catalog sync failed', error instanceof Error ? error.message : 'unknown error');
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 60_000));
    }
  }
} finally {
  clearInterval(heartbeat);
  await prisma.$disconnect();
}
