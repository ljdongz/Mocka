import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { networkInterfaces } from 'os';
import { endpointRoutes } from './routes/endpoint.routes.js';
import { collectionRoutes } from './routes/collection.routes.js';
import { historyRoutes } from './routes/history.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { addClient } from './plugins/websocket.js';
import * as settingsService from './services/settings.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type RestartHandler = () => Promise<{ success: boolean; port?: number; error?: string }>;

export async function createAdminServer(onRestart: RestartHandler) {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  app.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (socket) => {
      addClient(socket);
    });
  });

  await app.register(endpointRoutes);
  await app.register(collectionRoutes);
  await app.register(historyRoutes);
  await app.register(settingsRoutes);

  // Server status
  let mockServerRunning = false;

  app.get('/api/server/status', async () => {
    const settings = settingsService.getAll();
    const nets = networkInterfaces();
    let localIp = 'localhost';
    for (const addrs of Object.values(nets)) {
      const found = addrs?.find(a => a.family === 'IPv4' && !a.internal);
      if (found) { localIp = found.address; break; }
    }
    return {
      running: mockServerRunning,
      port: settings.port,
      localIp,
    };
  });

  app.post('/api/server/restart', async () => {
    return onRestart();
  });

  // Serve client build in production
  const clientDist = join(__dirname, '..', '..', 'client', 'dist');
  if (existsSync(clientDist)) {
    await app.register(fastifyStatic, { root: clientDist, wildcard: false });
    app.setNotFoundHandler(async (req, reply) => {
      // Don't serve index.html for API/WS routes
      if (req.url.startsWith('/api/') || req.url.startsWith('/ws')) {
        reply.code(404);
        return { error: 'Not found' };
      }
      return reply.sendFile('index.html');
    });
  }

  const setMockStatus = (running: boolean) => {
    mockServerRunning = running;
  };

  return { app, setMockStatus };
}
