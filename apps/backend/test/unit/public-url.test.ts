import { expect, it } from 'vitest';
import { assertSafePublicUrl, isPrivateAddress } from '../../src/lib/public-url.js';

it.each(['127.0.0.1', '10.1.2.3', '169.254.169.254', '::1', '::ffff:7f00:1', '::ffff:192.168.1.1', 'fe80::1', 'fc00::1', '64:ff9b::7f00:1'])('blocks private, mapped and reserved addresses: %s', address => {
  expect(isPrivateAddress(address)).toBe(true);
});
it('accepts public IPs and rejects dangerous URL schemes and credentials', async () => {
  expect(isPrivateAddress('8.8.8.8')).toBe(false);
  await expect(assertSafePublicUrl('file:///etc/passwd')).rejects.toThrow();
  await expect(assertSafePublicUrl('http://user:pass@example.com')).rejects.toThrow();
  await expect(assertSafePublicUrl('http://[::ffff:7f00:1]/')).rejects.toThrow();
});
