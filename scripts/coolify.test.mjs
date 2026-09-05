import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeploymentConfig, CoolifyClient, deployAndWait, reconcile } from './coolify.mjs';

const environment = {
  GITHUB_REPOSITORY: 'example/house-tracking',
  GITHUB_REPOSITORY_ID: '12345',
  GITHUB_SHA: 'abc123',
  GITHUB_REF_NAME: 'main',
  COOLIFY_API_URL: 'https://coolify.example.test/api/v1/',
  COOLIFY_SERVER_UUID: 'server-1',
  DEPLOY_BASE_DOMAIN: 'example.test',
  COOLIFY_WRITE_TOKEN: 'write-token',
  COOLIFY_DEPLOY_TOKEN: 'deploy-token'
};

test('derives deterministic development resource names', () => {
  const config = buildDeploymentConfig(environment);
  assert.equal(config.projectName, 'house-tracking');
  assert.equal(config.environmentName, 'dev');
  assert.equal(config.networkName, 'repo-12345-dev');
  assert.equal(config.frontendUrl, 'https://house-tracking-dev.example.test');
  assert.equal(config.apiPublicUrl, 'https://house-tracking-api-dev.example.test');
});

test('rejects repository names that cannot be DNS labels', () => {
  assert.throws(() => buildDeploymentConfig({ ...environment, GITHUB_REPOSITORY: 'example/house_tracking' }), /DNS label/);
});

test('rejects repository names that make the API DNS label too long', () => {
  const repo = 'a'.repeat(56);
  assert.throws(() => buildDeploymentConfig({ ...environment, GITHUB_REPOSITORY: `example/${repo}` }), /too long/);
});

test('does not leak token values in HTTP errors', async () => {
  const config = buildDeploymentConfig(environment);
  const client = new CoolifyClient(config, async () => new Response('secret response', { status: 401 }));
  await assert.rejects(() => client.request('/projects'), (error) => !error.message.includes('write-token') && !error.message.includes('secret response'));
});

test('reuses existing resources during reconciliation', async () => {
  const config = buildDeploymentConfig(environment);
  const calls = [];
  const responses = new Map([
    ['/projects', [{ uuid: 'project-1', name: config.projectName, description: config.projectDescription }]],
    ['/projects/project-1', { environments: [{ uuid: 'env-1', name: 'dev' }] }],
    ['/servers/server-1/destinations', [{ uuid: 'destination-1', network: config.networkName }]],
    [`/applications?tag=${config.resourceTag}`, [{ uuid: 'app-1', git_repository: `https://github.com/${config.repository}` }]]
  ]);
  const client = { request: async (path, options = {}) => {
    calls.push([path, options.method || 'GET', options.body]);
    if (path === '/applications/app-1' || path === '/applications/app-1/envs/bulk') return { uuid: 'app-1' };
    return responses.get(path);
  } };
  const result = await reconcile(client, config);
  assert.equal(result.application.uuid, 'app-1');
  assert.equal(calls.filter(([, method]) => method === 'POST').length, 0);
  assert.equal(calls.filter(([, method]) => method === 'PATCH').length, 2);
  const applicationUpdate = calls.find(([path]) => path === '/applications/app-1');
  assert.deepEqual(applicationUpdate[2], { git_commit_sha: config.sha, is_auto_deploy_enabled: false });
  const environmentUpdate = calls.find(([path]) => path === '/applications/app-1/envs/bulk');
  const frontendUrl = environmentUpdate[2].data.find(({ key }) => key === 'FRONTEND_URL');
  assert.deepEqual(frontendUrl, {
    key: 'FRONTEND_URL',
    value: config.frontendUrl,
    is_buildtime: true,
    is_runtime: true,
    is_preview: false
  });
});

test('accepts the direct deployment response used by older Coolify versions', async () => {
  const config = buildDeploymentConfig(environment);
  let deployOptions;
  const client = { request: async (path, options) => {
    if (path === '/deploy') {
      deployOptions = options;
      return { deployment_uuid: 'deployment-1' };
    }
    return { status: 'finished' };
  } };
  const result = await deployAndWait(client, config, { uuid: 'app-1' }, { pollMs: 0, timeoutMs: 100 });
  assert.equal(result.deploymentUuid, 'deployment-1');
  assert.deepEqual(deployOptions.body, { uuid: 'app-1', force: false });
});
