export type HealthResponse = {
  status: 'ok';
  database: 'connected';
  timestamp: string;
};

export * from './property.js';
export * from './property-input.js';
export * from './property-editor.js';
export * from './property-requests.js';
export * from './provider-settings.js';
