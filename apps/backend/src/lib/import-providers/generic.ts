import type { ImportProvider } from './types.js';

export const genericProvider: ImportProvider = {
  key: 'generic',
  name: 'Generic web page',
  version: '1',
  matches: () => true
};
