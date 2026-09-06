import { afterEach, expect, it, vi } from 'vitest';
import { importDebug } from '../../src/lib/import-debug.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('emits temporary JSON logs only when enabled and redacts sensitive details', () => {
  const output = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  importDebug('job-disabled', 'test', { status: 'ignored' });
  expect(output).not.toHaveBeenCalled();
  vi.stubEnv('IMPORT_DEBUG_LOGS', 'true');
  importDebug('job-1', 'provider.test', {
    credential: 'secret-value',
    nested: { authorization: 'Bearer secret', count: 2 },
    status: 'ok'
  });
  expect(output).toHaveBeenCalledOnce();
  const line = String(output.mock.calls[0]?.[0]);
  expect(line).toContain('"event":"property_import_debug"');
  expect(line).toContain('"importId":"job-1"');
  expect(line).toContain('"status":"ok"');
  expect(line).not.toContain('secret-value');
  expect(line).not.toContain('Bearer secret');
});
