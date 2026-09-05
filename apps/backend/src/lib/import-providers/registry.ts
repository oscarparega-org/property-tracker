import { genericProvider } from "./generic.js";
import { mercadoLibreProvider } from "./mercado-libre.js";
import { pulppoProvider } from "./pulppo.js";
import { remaxMexicoProvider } from "./remax-mx.js";
import type { ImportProvider } from "./types.js";

const providers: readonly ImportProvider[] = [remaxMexicoProvider, pulppoProvider, mercadoLibreProvider, genericProvider];

export function resolveImportProvider(url: URL) {
  return providers.find((provider) => provider.matches(url)) ?? genericProvider;
}
