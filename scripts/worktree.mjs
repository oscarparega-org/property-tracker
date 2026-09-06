#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFilename = '.env.worktree';
const worktreeConfigVersion = '1';
const slotCount = 200;
const portBases = { api: 3100, web: 5200, postgres: 55432 };

export function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
  return slug || 'worktree';
}

export function shortHash(value, length = 8) {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

export function deriveWorktreeIdentity(root) {
  const absoluteRoot = resolve(root);
  const hash = shortHash(absoluteRoot);
  const name = slugify(basename(absoluteRoot));
  return {
    id: `${name}-${hash}`,
    projectName: `property-tracker-${name}-${hash}`.slice(0, 63).replace(/-$/, ''),
    hostname: `${name}-${hash}.localhost`,
    databaseName: `property_tracker_${hash}`
  };
}

export function parseEnv(contents) {
  return Object.fromEntries(
    contents.split(/\r?\n/).flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return [];
      const separator = trimmed.indexOf('=');
      return separator < 1 ? [] : [[trimmed.slice(0, separator), trimmed.slice(separator + 1)]];
    })
  );
}

export function serializeEnv(values) {
  return `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`;
}

export function composeArguments(projectName, args, envPath) {
  return ['compose', '--project-name', projectName, ...(envPath ? ['--env-file', envPath] : []), ...args];
}

export function validateWorktreeConfig(root, config, envPath = join(root, envFilename)) {
  const requiredNames = [
    'WORKTREE_CONFIG_VERSION',
    'WORKTREE_ID',
    'COMPOSE_PROJECT_NAME',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
    'POSTGRES_PORT',
    'API_PORT',
    'PORT',
    'WEB_PORT',
    'DATABASE_URL',
    'FRONTEND_URL',
    'TRUSTED_ORIGINS',
    'BETTER_AUTH_URL',
    'NEXT_PUBLIC_API_URL',
    'PUBLIC_API_URL',
    'BETTER_AUTH_SECRET',
    'PROVIDER_CREDENTIAL_ENCRYPTION_KEY'
  ];
  for (const name of requiredNames) {
    if (!config[name]) throw new Error(`${envPath} is missing ${name}. Remove it and run npm run wt:init again.`);
  }

  const identity = deriveWorktreeIdentity(root);
  const expected = {
    WORKTREE_CONFIG_VERSION: worktreeConfigVersion,
    WORKTREE_ID: identity.id,
    COMPOSE_PROJECT_NAME: identity.projectName,
    POSTGRES_DB: identity.databaseName
  };
  for (const [name, value] of Object.entries(expected)) {
    if (config[name] !== value) {
      throw new Error(
        `${envPath} does not belong to this worktree (${name} mismatch). Remove it and run npm run wt:init again.`
      );
    }
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(config.DATABASE_URL);
  } catch {
    throw new Error(`${envPath} has an invalid DATABASE_URL. Remove it and run npm run wt:init again.`);
  }
  const databaseMatches =
    databaseUrl.protocol === 'postgresql:' &&
    databaseUrl.hostname === 'localhost' &&
    databaseUrl.port === config.POSTGRES_PORT &&
    decodeURIComponent(databaseUrl.username) === config.POSTGRES_USER &&
    decodeURIComponent(databaseUrl.password) === config.POSTGRES_PASSWORD &&
    decodeURIComponent(databaseUrl.pathname.slice(1)) === config.POSTGRES_DB;
  if (!databaseMatches) {
    throw new Error(
      `${envPath} DATABASE_URL does not match its isolated PostgreSQL configuration. Remove it and run npm run wt:init again.`
    );
  }
  return config;
}

export function cleanupTarget(root, config) {
  const identity = deriveWorktreeIdentity(root);
  return {
    projectName: config?.COMPOSE_PROJECT_NAME || identity.projectName,
    envPath: config ? join(root, envFilename) : undefined
  };
}

export async function selectPortSlot(identity, usedPorts = new Set(), isFree = isPortFree) {
  const initial = Number.parseInt(shortHash(identity, 8), 16) % slotCount;
  for (let attempt = 0; attempt < slotCount; attempt += 1) {
    const slot = (initial + attempt) % slotCount;
    const ports = {
      api: portBases.api + slot,
      web: portBases.web + slot,
      postgres: portBases.postgres + slot
    };
    if (Object.values(ports).some((port) => usedPorts.has(port))) continue;
    if ((await Promise.all(Object.values(ports).map((port) => isFree(port)))).every(Boolean)) return { slot, ...ports };
  }
  throw new Error(`No free worktree port slot is available (${slotCount} checked).`);
}

function isPortFree(port) {
  return new Promise((result) => {
    const server = createServer();
    server.unref();
    server.once('error', () => result(false));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(() => result(true)));
  });
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: options.cwd || scriptRoot,
    env: options.env || process.env,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture ? (result.stderr || result.stdout || '').trim() : '';
    throw new Error(
      `${commandName} ${args.join(' ')} failed with exit code ${result.status}${detail ? `: ${detail}` : ''}`
    );
  }
  return result;
}

function gitOutput(root, args) {
  return command('git', ['-C', root, ...args], { capture: true }).stdout.trim();
}

function listWorktreePaths(root) {
  return gitOutput(root, ['worktree', 'list', '--porcelain'])
    .split(/\r?\n/)
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
}

function usedWorktreePorts(root) {
  const used = new Set();
  for (const worktreePath of listWorktreePaths(root)) {
    const envPath = join(worktreePath, envFilename);
    if (!existsSync(envPath)) continue;
    const values = parseEnv(readFileSync(envPath, 'utf8'));
    for (const name of ['API_PORT', 'WEB_PORT', 'POSTGRES_PORT']) {
      const port = Number(values[name]);
      if (Number.isInteger(port)) used.add(port);
    }
  }
  return used;
}

function gitCommonDirectory(root) {
  const value = gitOutput(root, ['rev-parse', '--git-common-dir']);
  return resolve(root, value);
}

async function withAllocationLock(root, action) {
  const lockPath = join(tmpdir(), `property-tracker-worktree-${shortHash(gitCommonDirectory(root), 12)}.lock`);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      mkdirSync(lockPath);
      try {
        return await action();
      } finally {
        rmSync(lockPath, { recursive: true, force: true });
      }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > 30_000) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if (statError?.code !== 'ENOENT') throw statError;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  throw new Error(`Timed out waiting for worktree port allocation lock: ${lockPath}`);
}

function readConfig(root, required = true) {
  const envPath = join(root, envFilename);
  if (!existsSync(envPath)) {
    if (!required) return null;
    throw new Error(`Missing ${envPath}. Run npm run wt:init first.`);
  }
  const config = parseEnv(readFileSync(envPath, 'utf8'));
  return validateWorktreeConfig(root, config, envPath);
}

async function initialize(root) {
  const existing = readConfig(root, false);
  if (existing) {
    printConfig(existing, `Using existing ${join(root, envFilename)}`);
    return existing;
  }

  return withAllocationLock(root, async () => {
    const afterLock = readConfig(root, false);
    if (afterLock) return afterLock;

    const absoluteRoot = resolve(root);
    const identity = deriveWorktreeIdentity(absoluteRoot);
    const ports = await selectPortSlot(absoluteRoot, usedWorktreePorts(root));
    const databaseUser = 'template';
    const databasePassword = randomBytes(24).toString('base64url');
    const databaseUrl = `postgresql://${databaseUser}:${databasePassword}@localhost:${ports.postgres}/${identity.databaseName}`;
    const config = {
      WORKTREE_CONFIG_VERSION: worktreeConfigVersion,
      WORKTREE_ID: identity.id,
      COMPOSE_PROJECT_NAME: identity.projectName,
      POSTGRES_USER: databaseUser,
      POSTGRES_PASSWORD: databasePassword,
      POSTGRES_DB: identity.databaseName,
      POSTGRES_PORT: String(ports.postgres),
      API_PORT: String(ports.api),
      PORT: String(ports.api),
      WEB_PORT: String(ports.web),
      DATABASE_URL: databaseUrl,
      FRONTEND_URL: `http://${identity.hostname}:${ports.web}`,
      TRUSTED_ORIGINS: `http://${identity.hostname}:${ports.web}`,
      BETTER_AUTH_URL: `http://api.${identity.hostname}:${ports.api}`,
      NEXT_PUBLIC_API_URL: `http://api.${identity.hostname}:${ports.api}`,
      PUBLIC_API_URL: `http://api.${identity.hostname}:${ports.api}`,
      API_URL: `http://127.0.0.1:${ports.api}`,
      BETTER_AUTH_SECRET: randomBytes(32).toString('base64url'),
      PROVIDER_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      DEV_SEED_ENABLED: 'true',
      DEV_SEED_EMAIL: 'demo@property-tracker.local',
      DEV_SEED_PASSWORD: 'demo-password-123',
      NODE_ENV: 'development'
    };
    const envPath = join(root, envFilename);
    const descriptor = openSync(envPath, 'wx', 0o600);
    try {
      writeFileSync(descriptor, serializeEnv(config));
    } finally {
      closeSync(descriptor);
    }
    printConfig(config, `Created ${envPath}`);
    return config;
  });
}

function runtimeEnvironment(config) {
  return {
    ...process.env,
    DEV_SEED_ENABLED: 'true',
    DEV_SEED_EMAIL: 'demo@property-tracker.local',
    DEV_SEED_PASSWORD: 'demo-password-123',
    ...config,
    API_URL: `http://127.0.0.1:${config.API_PORT}`
  };
}

function compose(root, config, args, options = {}) {
  return command('docker', composeArguments(config.COMPOSE_PROJECT_NAME, args, join(root, envFilename)), {
    cwd: root,
    env: runtimeEnvironment(config),
    ...options
  });
}

function printConfig(config, heading = 'Worktree development stack') {
  console.log(`\n${heading}`);
  console.log(`  Frontend: ${config.FRONTEND_URL}`);
  console.log(`  API:      ${config.BETTER_AUTH_URL}`);
  console.log(`  Postgres: localhost:${config.POSTGRES_PORT}/${config.POSTGRES_DB}`);
  console.log(`  Project:  ${config.COMPOSE_PROJECT_NAME}\n`);
}

function startChild(label, executable, args, root, env) {
  console.log(`[worktree] starting ${label}`);
  return spawn(executable, args, {
    cwd: root,
    env,
    stdio: 'inherit'
  });
}

function stopChild(child, signal = 'SIGTERM') {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    child.kill(signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

async function develop(root) {
  const config = await initialize(root);
  const env = runtimeEnvironment(config);
  const applicationPorts = [Number(config.API_PORT), Number(config.WEB_PORT)];
  const available = await Promise.all(applicationPorts.map((port) => isPortFree(port)));
  if (!available.every(Boolean)) {
    const busy = applicationPorts.filter((_, index) => !available[index]);
    throw new Error(
      `Application port(s) already in use: ${busy.join(', ')}. Stop the existing worktree process before starting another.`
    );
  }
  console.log('[worktree] starting PostgreSQL');
  compose(root, config, ['up', '-d', '--wait', '--wait-timeout', '60', 'postgres']);
  console.log('[worktree] building shared package');
  command('npm', ['run', 'build', '--workspace=@template/shared'], { cwd: root, env });
  console.log('[worktree] generating Prisma client');
  command('npx', ['prisma', 'generate', '--schema', 'apps/backend/prisma/schema.prisma'], { cwd: root, env });
  console.log('[worktree] deploying Prisma migrations');
  command('npx', ['prisma', 'migrate', 'deploy', '--schema', 'apps/backend/prisma/schema.prisma'], { cwd: root, env });
  if (env.DEV_SEED_ENABLED !== 'false') seed(root, config);
  command('npm', ['run', 'predev', '--workspace=template-frontend'], { cwd: root, env });
  printConfig(config, 'Development stack ready');

  const children = [
    startChild(
      'API',
      join(root, 'node_modules', '.bin', 'tsx'),
      ['watch', 'src/index.ts'],
      join(root, 'apps/backend'),
      env
    ),
    startChild(
      'frontend',
      join(root, 'node_modules', '.bin', 'next'),
      ['dev', '--webpack', '--port', config.WEB_PORT],
      join(root, 'apps/frontend'),
      env
    ),
    startChild(
      'import worker',
      join(root, 'node_modules', '.bin', 'tsx'),
      ['src/import-worker.ts'],
      join(root, 'apps/backend'),
      env
    )
  ];

  let stopping = false;
  const stopAll = (signal) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) stopChild(child, signal);
    setTimeout(() => {
      for (const child of children) stopChild(child, 'SIGKILL');
    }, 5_000).unref();
  };
  process.once('SIGINT', () => stopAll('SIGINT'));
  process.once('SIGTERM', () => stopAll('SIGTERM'));

  const exitCode = await new Promise((resolveExit) => {
    let remaining = children.length;
    let firstFailure = 0;
    for (const child of children) {
      child.once('error', (error) => {
        console.error(error);
        firstFailure ||= 1;
        stopAll('SIGTERM');
      });
      child.once('exit', (code, signal) => {
        remaining -= 1;
        if (!stopping && (code !== 0 || signal)) {
          firstFailure ||= code || 1;
          stopAll('SIGTERM');
        }
        if (remaining === 0) resolveExit(firstFailure);
      });
    }
  });
  process.exitCode = exitCode;
}

function seed(root, config = readConfig(root)) {
  const env = runtimeEnvironment(config);
  if (env.DEV_SEED_ENABLED === 'false') {
    console.log('[worktree] development seed disabled');
    return;
  }
  console.log('[worktree] seeding development account and property');
  command(join(root, 'node_modules', '.bin', 'tsx'), ['src/seed-dev.ts'], { cwd: join(root, 'apps/backend'), env });
}

function down(root, removeConfig = false) {
  const config = readConfig(root, false);
  const target = cleanupTarget(root, config);
  if (config) {
    compose(root, config, ['down', '--volumes', '--remove-orphans']);
  } else {
    console.log(`[worktree] ${root} has no ${envFilename}; cleaning derived Compose project ${target.projectName}.`);
    command('docker', composeArguments(target.projectName, ['down', '--volumes', '--remove-orphans']), { cwd: root });
  }
  if (removeConfig && config) unlinkSync(join(root, envFilename));
}

function status(root) {
  const config = readConfig(root);
  printConfig(config);
  compose(root, config, ['ps']);
}

function resolveOrcaCommand() {
  if (process.env.ORCA_CLI_COMMAND) return process.env.ORCA_CLI_COMMAND;
  if (process.env.ORCA_DEV_REPO_ROOT) return 'orca-dev';
  return process.platform === 'linux' ? 'orca-ide' : 'orca';
}

function assertRegisteredWorktree(sourceRoot, targetRoot) {
  const paths = listWorktreePaths(sourceRoot).map((value) => resolve(value));
  if (!paths.includes(targetRoot))
    throw new Error(`${targetRoot} is not a registered Git worktree for this repository.`);
}

function assertClean(targetRoot) {
  const dirty = gitOutput(targetRoot, ['status', '--porcelain']);
  if (dirty)
    throw new Error(
      `Refusing to remove a dirty worktree:\n${dirty}\nCommit/stash the changes, or pass --force to discard them intentionally.`
    );
}

function removeWorktree(sourceRoot, rawArgs) {
  const force = rawArgs.includes('--force');
  const pathArgs = rawArgs.filter((value) => value !== '--force');
  if (pathArgs.length !== 1) throw new Error('Usage: npm run wt:remove -- /absolute/path/to/worktree [--force]');
  if (!isAbsolute(pathArgs[0])) throw new Error('wt:remove requires an absolute worktree path.');
  const targetRoot = resolve(pathArgs[0]);
  if (targetRoot === resolve(sourceRoot))
    throw new Error('Run wt:remove from a different worktree than the one being removed.');
  assertRegisteredWorktree(sourceRoot, targetRoot);
  if (!force) assertClean(targetRoot);

  const orca = resolveOrcaCommand();
  command(orca, ['status', '--json'], { capture: true });
  command(orca, ['terminal', 'close', '--worktree', `path:${targetRoot}`, '--all', '--json']);
  if (!force) assertClean(targetRoot);

  const config = readConfig(targetRoot, false);
  if (config) down(targetRoot, true);
  else down(targetRoot);

  const args = ['worktree', 'rm', '--worktree', `path:${targetRoot}`];
  if (force) args.push('--force');
  args.push('--json');
  command(orca, args);
}

function usage() {
  console.log(
    `Usage: node scripts/worktree.mjs <command>\n\nCommands:\n  init                 Allocate stable worktree ports and secrets\n  dev                  Start PostgreSQL, migrate, seed, and run with hot reload\n  seed                 Restore missing development seed records\n  status               Show this worktree's URLs and Compose services\n  down                 Remove this worktree's containers, network, and volume\n  remove <path>        Clean and remove another Orca worktree\n  remove <path> --force  Also discard uncommitted changes`
  );
}

async function main() {
  const [action, ...args] = process.argv.slice(2);
  if (action === 'init') await initialize(scriptRoot);
  else if (action === 'dev') await develop(scriptRoot);
  else if (action === 'seed') seed(scriptRoot);
  else if (action === 'status') status(scriptRoot);
  else if (action === 'down') down(scriptRoot);
  else if (action === 'remove') removeWorktree(scriptRoot, args);
  else {
    usage();
    if (action) process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[worktree] ${error.message}`);
    process.exitCode = 1;
  });
}
