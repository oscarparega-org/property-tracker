import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { Agent } from 'undici';

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3]
] as const)
  blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
  ['64:ff9b::', 96],
  ['2002::', 16]
] as const)
  blocked.addSubnet(network, prefix, 'ipv6');

export function isPrivateAddress(address: string) {
  const family = isIP(address);
  return !family || blocked.check(address, family === 6 ? 'ipv6' : 'ipv4');
}
async function publicAddresses(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address)))
    throw new Error('La URL apunta a una red privada o reservada.');
  return addresses;
}
export async function assertSafePublicUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se permiten URLs HTTP o HTTPS.');
  if (url.username || url.password) throw new Error('La URL no puede incluir credenciales.');
  await publicAddresses(url.hostname);
  return url;
}

// Validate the addresses actually used by the socket, closing the DNS rebinding
// gap between preflight URL validation and fetch. Literal IPs are checked above.
export const publicDispatcher = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      void publicAddresses(hostname)
        .then((addresses) => {
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0]!.address, addresses[0]!.family);
        })
        .catch((error) => callback(error, '', 4));
    }
  }
});
