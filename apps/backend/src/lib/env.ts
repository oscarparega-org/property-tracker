export type AppEnvironment = {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  frontendUrl: string;
  trustedOrigins: string[];
  betterAuthUrl: string;
  betterAuthSecret: string;
};

function required(source: NodeJS.ProcessEnv, name: string, fallback?: string): string {
  const value = source[name]?.trim() || fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): AppEnvironment {
  const nodeEnv = source.NODE_ENV || 'development';
  const secret = required(
    source,
    'BETTER_AUTH_SECRET',
    nodeEnv === 'production' ? undefined : 'development-only-change-this-32-characters'
  );
  if (secret.length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters');

  const frontendUrl = required(source, 'FRONTEND_URL', 'http://localhost:5173');
  const origins = source.TRUSTED_ORIGINS || frontendUrl;
  const port = Number(source.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');

  return {
    nodeEnv,
    port,
    databaseUrl: required(source, 'DATABASE_URL'),
    frontendUrl,
    trustedOrigins: [...new Set(origins.split(',').map((value) => value.trim()).filter(Boolean))],
    betterAuthUrl: required(source, 'BETTER_AUTH_URL', 'http://localhost:3000'),
    betterAuthSecret: secret
  };
}
