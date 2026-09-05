import { afterEach, describe, expect, it, vi } from 'vitest';
import { decryptProviderCredential, encryptProviderCredential, ProviderCredentialError, validateProviderCredential } from '../../src/lib/provider-credentials.js';

afterEach(() => vi.unstubAllEnvs());

describe('provider credential encryption', () => {
  it('encrypts with unique nonces and authenticates the owner and provider', () => {
    vi.stubEnv('PROVIDER_CREDENTIAL_ENCRYPTION_KEY', Buffer.alloc(32, 9).toString('base64'));
    const first = encryptProviderCredential('owner-a', 'OPENAI', 'sk-user-secret-value');
    const second = encryptProviderCredential('owner-a', 'OPENAI', 'sk-user-secret-value');
    expect(first.ciphertext.equals(Buffer.from('sk-user-secret-value'))).toBe(false);
    expect(first.iv.equals(second.iv)).toBe(false);
    expect(decryptProviderCredential('owner-a', 'OPENAI', { credentialCiphertext: first.ciphertext, credentialIv: first.iv, credentialAuthTag: first.authTag })).toBe('sk-user-secret-value');
    expect(() => decryptProviderCredential('owner-b', 'OPENAI', { credentialCiphertext: first.ciphertext, credentialIv: first.iv, credentialAuthTag: first.authTag })).toThrow();
    expect(() => decryptProviderCredential('owner-a', 'FIRECRAWL', { credentialCiphertext: first.ciphertext, credentialIv: first.iv, credentialAuthTag: first.authTag })).toThrow();
  });

  it('rejects tampered ciphertext', () => {
    vi.stubEnv('PROVIDER_CREDENTIAL_ENCRYPTION_KEY', Buffer.alloc(32, 8).toString('base64'));
    const encrypted = encryptProviderCredential('owner-a', 'FIRECRAWL', 'fc-user-secret');
    encrypted.ciphertext[0] = encrypted.ciphertext[0]! ^ 1;
    expect(() => decryptProviderCredential('owner-a', 'FIRECRAWL', { credentialCiphertext: encrypted.ciphertext, credentialIv: encrypted.iv, credentialAuthTag: encrypted.authTag })).toThrow();
  });

  it('uses non-billable fixed provider endpoints for validation', async () => {
    const fetcher = vi.fn(async () => Response.json({ success: true }));
    await validateProviderCredential('OPENAI', 'sk-test', 'gpt-5.6-luna', fetcher);
    await validateProviderCredential('FIRECRAWL', 'fc-test', null, fetcher);
    expect(fetcher.mock.calls.map(call => String(call[0]))).toEqual([
      'https://api.openai.com/v1/models/gpt-5.6-luna',
      'https://api.firecrawl.dev/v2/team/credit-usage',
    ]);
    await expect(validateProviderCredential('OPENAI', 'bad', 'gpt-5.6-luna', async () => new Response('', { status: 401 }))).rejects.toBeInstanceOf(ProviderCredentialError);
  });
});
