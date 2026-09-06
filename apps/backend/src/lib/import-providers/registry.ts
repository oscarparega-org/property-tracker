import { coldwellBankerMexicoProvider } from './coldwell-banker-mx.js';
import { genericProvider } from './generic.js';
import { inmuebles24Provider } from './inmuebles24.js';
import { mercadoLibreProvider } from './mercado-libre.js';
import { pulppoProvider } from './pulppo.js';
import { remaxMexicoProvider } from './remax-mx.js';
import type { ImportProvider } from './types.js';

const providers: readonly ImportProvider[] = [
  coldwellBankerMexicoProvider,
  remaxMexicoProvider,
  pulppoProvider,
  mercadoLibreProvider,
  inmuebles24Provider,
  genericProvider
];

export function resolveImportProvider(url: URL) {
  return providers.find((provider) => provider.matches(url)) ?? genericProvider;
}
