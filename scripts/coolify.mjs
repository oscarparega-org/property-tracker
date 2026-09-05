import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DNS_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export function buildDeploymentConfig(source = process.env) {
  const required = (name) => {
    const value = source[name]?.trim();
    if (!value) throw new Error(`Missing required configuration: ${name}`);
    return value;
  };
  const repository = required('GITHUB_REPOSITORY');
  const [owner, repo, extra] = repository.split('/');
  if (!owner || !repo || extra) throw new Error('GITHUB_REPOSITORY must use owner/repository format');
  if (!DNS_LABEL.test(repo)) throw new Error(`Repository name "${repo}" must be a lowercase DNS label (letters, digits, hyphens; maximum 63 characters)`);
  if (repo.length > 55) throw new Error(`Repository name "${repo}" is too long; 55 characters is the maximum because deployment domains add the -api-dev suffix`);
  const repositoryId = required('GITHUB_REPOSITORY_ID');
  if (!/^\d+$/.test(repositoryId)) throw new Error('GITHUB_REPOSITORY_ID must be numeric');
  const baseDomain = required('DEPLOY_BASE_DOMAIN').replace(/^https?:\/\//, '').replace(/^\*\./, '').replace(/\/$/, '').toLowerCase();
  if (!baseDomain.includes('.') || baseDomain.split('.').some((label) => !DNS_LABEL.test(label))) throw new Error('DEPLOY_BASE_DOMAIN must be a valid domain without a protocol or wildcard prefix');
  const apiUrl = required('COOLIFY_API_URL').replace(/\/$/, '');
  if (!/^https:\/\//.test(apiUrl)) throw new Error('COOLIFY_API_URL must use HTTPS');

  return {
    apiUrl,
    serverUuid: required('COOLIFY_SERVER_UUID'),
    writeToken: required('COOLIFY_WRITE_TOKEN'),
    deployToken: required('COOLIFY_DEPLOY_TOKEN'),
    repository,
    repositoryId,
    sha: required('GITHUB_SHA'),
    branch: source.GITHUB_REF_NAME?.trim() || 'main',
    projectName: repo,
    projectDescription: `Managed by fullstack template for GitHub repository ${repository} (${repositoryId})`,
    environmentName: 'dev',
    destinationName: `${repo}-dev`,
    networkName: `repo-${repositoryId}-dev`,
    applicationName: `${repo}-dev`,
    resourceTag: `github-repo-${repositoryId}`,
    frontendUrl: `https://${repo}-dev.${baseDomain}`,
    apiPublicUrl: `https://${repo}-api-dev.${baseDomain}`,
    displayName: repo.split('-').map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : part).join(' ')
  };
}

export class CoolifyClient {
  constructor(config, fetchImplementation = fetch) {
    this.config = config;
    this.fetch = fetchImplementation;
  }

  async request(path, { method = 'GET', body, deploy = false } = {}) {
    const response = await this.fetch(`${this.config.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${deploy ? this.config.deployToken : this.config.writeToken}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) throw new Error(`Coolify ${method} ${path} failed with HTTP ${response.status}`);
    if (response.status === 204) return undefined;
    return response.json();
  }
}

function exactlyOne(items, predicate, kind) {
  const matches = items.filter(predicate);
  if (matches.length > 1) throw new Error(`Multiple ${kind} resources match; refusing an ambiguous deployment`);
  return matches[0];
}

export async function reconcile(client, config) {
  const projects = await client.request('/projects');
  let project = exactlyOne(projects, (item) => item.name === config.projectName, 'project');
  if (project && project.description !== config.projectDescription) throw new Error(`Coolify project "${config.projectName}" exists but is not managed by repository ${config.repositoryId}`);
  if (!project) {
    const created = await client.request('/projects', { method: 'POST', body: { name: config.projectName, description: config.projectDescription } });
    project = { uuid: created.uuid, name: config.projectName, description: config.projectDescription };
  }

  const projectDetails = await client.request(`/projects/${project.uuid}`);
  let environment = exactlyOne(projectDetails.environments || [], (item) => item.name === config.environmentName, 'environment');
  if (!environment) {
    const created = await client.request(`/projects/${project.uuid}/environments`, { method: 'POST', body: { name: config.environmentName } });
    environment = { uuid: created.uuid, name: config.environmentName };
  }

  const destinations = await client.request(`/servers/${config.serverUuid}/destinations`);
  let destination = exactlyOne(destinations, (item) => item.network === config.networkName, 'destination');
  if (!destination) {
    destination = await client.request(`/servers/${config.serverUuid}/destinations`, {
      method: 'POST', body: { name: config.destinationName, network: config.networkName }
    });
  }

  const applications = await client.request(`/applications?tag=${encodeURIComponent(config.resourceTag)}`);
  let application = exactlyOne(applications, (item) => item.git_repository?.replace(/\.git$/, '').endsWith(config.repository), 'application');
  const applicationSettings = {
    git_commit_sha: config.sha,
    is_auto_deploy_enabled: false,
    destination_uuid: destination.uuid,
    connect_to_docker_network: true,
    docker_compose_domains: [
      { name: 'frontend', domain: `${config.frontendUrl}:3000` },
      { name: 'backend', domain: `${config.apiPublicUrl}:3000` }
    ]
  };
  if (!application) {
    const created = await client.request('/applications/public', {
      method: 'POST',
      body: {
        project_uuid: project.uuid,
        environment_name: config.environmentName,
        environment_uuid: environment.uuid,
        server_uuid: config.serverUuid,
        destination_uuid: destination.uuid,
        name: config.applicationName,
        description: config.projectDescription,
        git_repository: `https://github.com/${config.repository}`,
        git_branch: config.branch,
        build_pack: 'dockercompose',
        ports_exposes: '3000',
        base_directory: '/',
        docker_compose_location: '/docker-compose.coolify.yml',
        tags: [config.resourceTag, 'fullstack-template', 'dev'],
        instant_deploy: false,
        autogenerate_domain: false,
        ...applicationSettings
      }
    });
    application = { uuid: created.uuid };
  } else {
    await client.request(`/applications/${application.uuid}`, {
      method: 'PATCH',
      body: { git_commit_sha: config.sha, is_auto_deploy_enabled: false }
    });
  }

  await client.request(`/applications/${application.uuid}/envs/bulk`, {
    method: 'PATCH',
    body: { data: [
      // Coolify resolves every Docker Compose interpolation before the image
      // build, including values that are only consumed by runtime services.
      { key: 'FRONTEND_URL', value: config.frontendUrl, is_buildtime: true, is_runtime: true, is_preview: false },
      { key: 'PUBLIC_API_URL', value: config.apiPublicUrl, is_buildtime: true, is_runtime: true, is_preview: false },
      { key: 'APP_NAME', value: config.displayName, is_buildtime: true, is_runtime: true, is_preview: false }
    ] }
  });
  return { project, environment, destination, application };
}

export async function deployAndWait(client, config, application, options = {}) {
  const timeoutMs = options.timeoutMs ?? 20 * 60_000;
  const pollMs = options.pollMs ?? 10_000;
  const queued = await client.request('/deploy', {
    method: 'POST',
    deploy: true,
    body: { uuid: application.uuid, force: false }
  });
  // Current Coolify returns { deployments: [...] }; older installations have
  // returned either the deployment object directly or wrapped in an array.
  const deploymentUuid = queued?.deployments?.[0]?.deployment_uuid
    || queued?.deployment?.deployment_uuid
    || queued?.deployment_uuid
    || (Array.isArray(queued) ? queued[0]?.deployment_uuid : undefined);
  if (!deploymentUuid) throw new Error('Coolify did not return a deployment UUID');
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const deployment = await client.request(`/deployments/${deploymentUuid}`);
    const status = String(deployment.status || '').toLowerCase();
    if (['finished', 'success', 'succeeded'].includes(status)) return { deploymentUuid, deployment };
    if (['failed', 'cancelled', 'canceled', 'error'].some((value) => status.includes(value))) throw new Error(`Coolify deployment ${deploymentUuid} ended with status ${status}`);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Coolify deployment ${deploymentUuid} timed out; application ${application.uuid} was retained`);
}

async function smokeTest(url, label) {
  let lastStatus = 'network error';
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      lastStatus = `HTTP ${response.status}`;
      if (response.ok) return;
    } catch { lastStatus = 'network error'; }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`${label} smoke test failed at ${url}: ${lastStatus}`);
}

export async function main() {
  const config = buildDeploymentConfig();
  const client = new CoolifyClient(config);
  console.log(`Reconciling ${config.projectName}/${config.environmentName} on configured Coolify server`);
  const resources = await reconcile(client, config);
  const result = await deployAndWait(client, config, resources.application);
  await smokeTest(`${config.apiPublicUrl}/health`, 'API');
  await smokeTest(config.frontendUrl, 'Frontend');
  const summary = [
    '## Development deployment', '',
    `- Frontend: ${config.frontendUrl}`,
    `- API: ${config.apiPublicUrl}`,
    `- Commit: \`${config.sha}\``,
    `- Coolify deployment: \`${result.deploymentUuid}\``
  ].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  console.log(`Deployment completed: ${config.frontendUrl}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : 'Deployment failed'); process.exitCode = 1; });
}
