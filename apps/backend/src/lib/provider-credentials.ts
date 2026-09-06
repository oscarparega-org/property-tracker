import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { IntegrationProvider, ProviderSettingsDto, ProviderSettingsUpdate } from '@template/shared';
import type { IntegrationProvider as PrismaProvider, PrismaClient, ProviderSetting } from '@prisma/client';

const DEFAULT_MODELS = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'];
const DEFAULT_LIMITS: Record<IntegrationProvider, number> = { OPENAI: 100, FIRECRAWL: 500 };

export class ProviderCredentialError extends Error {
  constructor(
    message: string,
    public readonly kind: 'AUTH' | 'UNAVAILABLE' | 'INVALID_CONFIGURATION'
  ) {
    super(message);
  }
}

function encryptionKey() {
  const encoded = process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new Error('Missing PROVIDER_CREDENTIAL_ENCRYPTION_KEY');
  const key = Buffer.from(encoded, 'base64');
  if (key.length < 32)
    throw new Error('PROVIDER_CREDENTIAL_ENCRYPTION_KEY must contain at least 32 bytes encoded as base64');
  return key.length === 32 ? key : createHash('sha256').update(key).digest();
}

function aad(ownerId: string, provider: IntegrationProvider) {
  return Buffer.from(`casa-clara:${ownerId}:${provider}:v1`, 'utf8');
}

export function encryptProviderCredential(ownerId: string, provider: IntegrationProvider, credential: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(aad(ownerId, provider));
  const ciphertext = Buffer.concat([cipher.update(credential, 'utf8'), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag(), hint: credential.slice(-4) };
}

export function decryptProviderCredential(
  ownerId: string,
  provider: IntegrationProvider,
  setting: Pick<ProviderSetting, 'credentialCiphertext' | 'credentialIv' | 'credentialAuthTag'>
) {
  if (!setting.credentialCiphertext || !setting.credentialIv || !setting.credentialAuthTag) return null;
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), setting.credentialIv);
  decipher.setAAD(aad(ownerId, provider));
  decipher.setAuthTag(setting.credentialAuthTag);
  return Buffer.concat([decipher.update(setting.credentialCiphertext), decipher.final()]).toString('utf8');
}

export function allowedOpenAiModels() {
  const configured = process.env.OPENAI_ALLOWED_MODELS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(configured?.length ? configured : DEFAULT_MODELS)];
}

export function providerGlobalLimit(provider: IntegrationProvider) {
  const name = provider === 'OPENAI' ? 'OPENAI_IMPORT_LIMIT_MONTHLY' : 'FIRECRAWL_CREDIT_LIMIT_MONTHLY';
  const fallback = DEFAULT_LIMITS[provider];
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid ${name}`);
  return value;
}

export async function validateProviderCredential(
  provider: IntegrationProvider,
  credential: string,
  model: string | null,
  fetcher: typeof fetch = fetch
) {
  const url =
    provider === 'OPENAI'
      ? `https://api.openai.com/v1/models/${encodeURIComponent(model || '')}`
      : 'https://api.firecrawl.dev/v2/team/credit-usage';
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { authorization: `Bearer ${credential}`, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    throw new ProviderCredentialError('No fue posible contactar al proveedor.', 'UNAVAILABLE');
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new ProviderCredentialError(
      provider === 'OPENAI'
        ? 'La clave no tiene acceso al modelo seleccionado.'
        : 'La clave de Firecrawl no es válida.',
      'AUTH'
    );
  }
  if (!response.ok) throw new ProviderCredentialError(`El proveedor respondió ${response.status}.`, 'UNAVAILABLE');
}

function status(setting: ProviderSetting | null): ProviderSettingsDto['status'] {
  if (!setting?.credentialCiphertext) return 'NOT_CONFIGURED';
  if (setting.needsAttention) return 'NEEDS_ATTENTION';
  return setting.enabled ? 'READY' : 'DISABLED';
}

export async function listProviderSettings(db: PrismaClient, ownerId: string): Promise<ProviderSettingsDto[]> {
  const month = new Date().toISOString().slice(0, 7);
  const [settings, usages] = await Promise.all([
    db.providerSetting.findMany({ where: { ownerId } }),
    db.providerUsage.findMany({ where: { ownerId, month } })
  ]);
  return (['OPENAI', 'FIRECRAWL'] as const).map((provider) => {
    const setting = settings.find((item) => item.provider === provider) ?? null;
    const usage = usages.find((item) => item.provider === provider)?.operationCount ?? 0;
    return {
      provider,
      enabled: setting?.enabled ?? false,
      credentialConfigured: Boolean(setting?.credentialCiphertext),
      credentialHint: setting?.credentialHint ? `••••${setting.credentialHint}` : null,
      model: provider === 'OPENAI' ? (setting?.model ?? allowedOpenAiModels()[0]!) : null,
      allowedModels: provider === 'OPENAI' ? allowedOpenAiModels() : [],
      monthlyOperationLimit: setting?.monthlyOperationLimit ?? DEFAULT_LIMITS[provider],
      currentMonthOperations: usage,
      validatedAt: setting?.validatedAt?.toISOString() ?? null,
      status: status(setting)
    };
  });
}

export async function updateProviderSettings(
  db: PrismaClient,
  ownerId: string,
  provider: IntegrationProvider,
  input: ProviderSettingsUpdate
) {
  const existing = await db.providerSetting.findUnique({
    where: { ownerId_provider: { ownerId, provider: provider as PrismaProvider } }
  });
  const model = provider === 'OPENAI' ? (input.model ?? existing?.model ?? allowedOpenAiModels()[0]!) : null;
  if (provider === 'OPENAI' && !allowedOpenAiModels().includes(model!))
    throw new ProviderCredentialError('El modelo no está permitido.', 'INVALID_CONFIGURATION');
  if (input.monthlyOperationLimit > providerGlobalLimit(provider))
    throw new ProviderCredentialError('El límite supera el máximo permitido por el servidor.', 'INVALID_CONFIGURATION');
  const credential = input.credential ?? (existing ? decryptProviderCredential(ownerId, provider, existing) : null);
  if (input.enabled && !credential)
    throw new ProviderCredentialError('Agrega una credencial antes de activar el proveedor.', 'INVALID_CONFIGURATION');
  const modelChanged = provider === 'OPENAI' && model !== existing?.model;
  const mustValidate = Boolean(
    input.credential ||
    (input.enabled && (!existing?.validatedAt || existing.needsAttention || !existing.enabled || modelChanged))
  );
  if (mustValidate) await validateProviderCredential(provider, credential!, model);
  const encrypted = input.credential ? encryptProviderCredential(ownerId, provider, input.credential) : null;
  const invalidated = modelChanged && !mustValidate;
  await db.providerSetting.upsert({
    where: { ownerId_provider: { ownerId, provider: provider as PrismaProvider } },
    create: {
      ownerId,
      provider: provider as PrismaProvider,
      enabled: input.enabled,
      model,
      monthlyOperationLimit: input.monthlyOperationLimit,
      ...(encrypted
        ? {
            credentialCiphertext: encrypted.ciphertext,
            credentialIv: encrypted.iv,
            credentialAuthTag: encrypted.authTag,
            credentialHint: encrypted.hint
          }
        : {}),
      validatedAt: mustValidate ? new Date() : null
    },
    update: {
      enabled: input.enabled,
      model,
      monthlyOperationLimit: input.monthlyOperationLimit,
      ...(encrypted
        ? {
            credentialCiphertext: encrypted.ciphertext,
            credentialIv: encrypted.iv,
            credentialAuthTag: encrypted.authTag,
            credentialHint: encrypted.hint
          }
        : {}),
      ...(mustValidate ? { validatedAt: new Date(), needsAttention: false } : invalidated ? { validatedAt: null } : {})
    }
  });
  return (await listProviderSettings(db, ownerId)).find((item) => item.provider === provider)!;
}

export async function testStoredProviderCredential(db: PrismaClient, ownerId: string, provider: IntegrationProvider) {
  const setting = await db.providerSetting.findUnique({
    where: { ownerId_provider: { ownerId, provider: provider as PrismaProvider } }
  });
  const credential = setting ? decryptProviderCredential(ownerId, provider, setting) : null;
  if (!setting || !credential)
    throw new ProviderCredentialError('No hay una credencial configurada.', 'INVALID_CONFIGURATION');
  await validateProviderCredential(provider, credential, setting.model);
  await db.providerSetting.update({
    where: { id: setting.id },
    data: { validatedAt: new Date(), needsAttention: false }
  });
  return (await listProviderSettings(db, ownerId)).find((item) => item.provider === provider)!;
}

export async function deleteProviderCredential(db: PrismaClient, ownerId: string, provider: IntegrationProvider) {
  await db.providerSetting.updateMany({
    where: { ownerId, provider: provider as PrismaProvider },
    data: {
      enabled: false,
      credentialCiphertext: null,
      credentialIv: null,
      credentialAuthTag: null,
      credentialHint: null,
      validatedAt: null,
      needsAttention: false
    }
  });
  return (await listProviderSettings(db, ownerId)).find((item) => item.provider === provider)!;
}

export async function enabledProviderCredential(db: PrismaClient, ownerId: string, provider: IntegrationProvider) {
  const setting = await db.providerSetting.findUnique({
    where: { ownerId_provider: { ownerId, provider: provider as PrismaProvider } }
  });
  if (!setting?.enabled || setting.needsAttention || !setting.validatedAt) return null;
  const credential = decryptProviderCredential(ownerId, provider, setting);
  return credential
    ? { credential, model: setting.model, monthlyOperationLimit: setting.monthlyOperationLimit, settingId: setting.id }
    : null;
}

export async function markProviderCredentialInvalid(db: PrismaClient, settingId: string) {
  await db.providerSetting.updateMany({
    where: { id: settingId },
    data: { enabled: false, validatedAt: null, needsAttention: true }
  });
}
