const SECRET_KEY = /(?:authorization|credential|secret|token|password|api.?key|html|markdown|page.?text)/i;

function safe(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (value instanceof Error) return { name: value.name, message: value.message, ...safe(Object.fromEntries(Object.entries(value)), depth + 1) as Record<string, unknown> };
  if (typeof value === 'string') return value.length > 1_000 ? `${value.slice(0, 1_000)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map(item => safe(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, SECRET_KEY.test(key) ? '[redacted]' : safe(item, depth + 1)]));
  return value;
}

export function importDebug(importId: string, stage: string, details: Record<string, unknown> = {}) {
  if (process.env.IMPORT_DEBUG_LOGS !== 'true') return;
  console.info(JSON.stringify({ event: 'property_import_debug', importId, stage, at: new Date().toISOString(), ...safe(details) as Record<string, unknown> }));
}
