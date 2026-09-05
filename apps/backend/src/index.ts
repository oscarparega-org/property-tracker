import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadEnvironment } from './lib/env.js';

const environment = loadEnvironment();
serve({ fetch: createApp().fetch, port: environment.port });
console.log(`API listening on port ${environment.port}`);
