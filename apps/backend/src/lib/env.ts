export type AppEnvironment = {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  frontendUrl: string;
  trustedOrigins: string[];
  betterAuthUrl: string;
  betterAuthSecret: string;
  adminEmail: string | null;
  catalogSyncTimeZone: string;
  catalogSyncHour: number;
  catalogStaleAfterHours: number;
};

function required(source: NodeJS.ProcessEnv, name: string, fallback?: string): string {
  const value = source[name]?.trim() || fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function configuredAdminEmail(source: NodeJS.ProcessEnv = process.env) {
  const email = source.ADMIN_EMAIL?.trim().toLocaleLowerCase() || null;
  if (email?.includes(',')) throw new Error('ADMIN_EMAIL must contain exactly one email address');
  return email;
}

export type AdminBootstrapConfig = {
  email: string;
  name: string;
  password: string;
};

export function configuredAdminBootstrap(source: NodeJS.ProcessEnv = process.env): AdminBootstrapConfig | null {
  const email = configuredAdminEmail(source);
  const name = source.ADMIN_NAME?.trim() || '';
  const password = source.ADMIN_PASSWORD || '';
  const hasBootstrapValues = Boolean(name || password);

  if (!email) {
    if (hasBootstrapValues) throw new Error('ADMIN_EMAIL is required when ADMIN_NAME or ADMIN_PASSWORD is configured');
    return null;
  }
  if (!hasBootstrapValues) return null;
  if (!name || !password) throw new Error('ADMIN_NAME and ADMIN_PASSWORD must be configured together');
  if (password.length < 8 || password.length > 128)
    throw new Error('ADMIN_PASSWORD must contain between 8 and 128 characters');

  return { email, name, password };
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): AppEnvironment {
  const nodeEnv = source.NODE_ENV || 'development';
  const secret = required(
    source,
    'BETTER_AUTH_SECRET',
    nodeEnv === 'production' ? undefined : 'development-only-change-this-32-characters'
  );
  if (secret.length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters');
  if (nodeEnv === 'production') {
    const providerKey = required(source, 'PROVIDER_CREDENTIAL_ENCRYPTION_KEY');
    if (Buffer.from(providerKey, 'base64').length < 32)
      throw new Error('PROVIDER_CREDENTIAL_ENCRYPTION_KEY must contain at least 32 bytes encoded as base64');
  }

  const frontendUrl = required(source, 'FRONTEND_URL', 'http://localhost:5173');
  const origins = source.TRUSTED_ORIGINS || frontendUrl;
  const port = Number(source.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');

  const catalogSyncHour = Number(source.CATALOG_SYNC_HOUR || 3);
  if (!Number.isInteger(catalogSyncHour) || catalogSyncHour < 0 || catalogSyncHour > 23)
    throw new Error('CATALOG_SYNC_HOUR must be an integer from 0 to 23');
  const catalogSyncTimeZone = source.CATALOG_SYNC_TIME_ZONE?.trim() || 'America/Mexico_City';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: catalogSyncTimeZone }).format();
  } catch {
    throw new Error('CATALOG_SYNC_TIME_ZONE must be a valid IANA time zone');
  }
  const catalogStaleAfterHours = Number(source.CATALOG_STALE_AFTER_HOURS || 36);
  if (!Number.isFinite(catalogStaleAfterHours) || catalogStaleAfterHours < 1)
    throw new Error('CATALOG_STALE_AFTER_HOURS must be a positive number');

  return {
    nodeEnv,
    port,
    databaseUrl: required(source, 'DATABASE_URL'),
    frontendUrl,
    trustedOrigins: [
      ...new Set(
        origins
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      )
    ],
    betterAuthUrl: required(source, 'BETTER_AUTH_URL', 'http://localhost:3000'),
    betterAuthSecret: secret,
    adminEmail: configuredAdminEmail(source),
    catalogSyncTimeZone,
    catalogSyncHour,
    catalogStaleAfterHours
  };
}
