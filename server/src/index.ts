import { initSchema } from './db/schema.js';
import { reload } from './services/route-registry.js';
import { createAdminServer } from './admin-server.js';
import { createMockServer } from './mock-server.js';
import * as settingsService from './services/settings.service.js';
import * as endpointService from './services/endpoint.service.js';
import { emit } from './services/domain-events.js';
import { getLocalIp, checkPort, findAvailablePort } from './utils/network.js';
import { closeDb } from './db/connection.js';
import { resolveDataDir } from './utils/paths.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

/** Parse and validate a port from an env var; returns null when absent or out of range. */
function parsePort(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}

async function main() {
  // Initialize DB
  initSchema();
  reload(endpointService.getAll());

  const settings = settingsService.getAll();
  const adminPort = parsePort(process.env.ADMIN_PORT) ?? settings.adminPort ?? 4649;
  const desiredMockPort = parsePort(process.env.MOCK_PORT) ?? settings.port ?? 4650;

  // Check admin port availability (no auto-fallback — MCP depends on a fixed port)
  try {
    await checkPort(adminPort);
  } catch {
    console.error(`\x1b[31mError: Admin port ${adminPort} is already in use.\x1b[0m`);
    console.error(`  Use \`mocka config admin_port=<port>\` to change the default port.`);
    process.exit(1);
  }

  // Find available mock port (auto-fallback to next available)
  let mockPort: number;
  try {
    mockPort = await findAvailablePort(desiredMockPort);
    if (mockPort !== desiredMockPort) {
      console.log(`\x1b[33mMock server port ${desiredMockPort} is in use, using ${mockPort} instead.\x1b[0m`);
    }
  } catch {
    console.error(`\x1b[31mError: No available port found for mock server (tried ${desiredMockPort}-${desiredMockPort + 9}).\x1b[0m`);
    console.error(`  Use \`mocka config mock_port=<port>\` to change the default port.`);
    process.exit(1);
  }

  let mockApp = await createMockServer(mockPort);

  // Restart handler (passed to admin server before listen)
  const handleRestart = async () => {
    const newSettings = settingsService.getAll();
    const newPort = newSettings.port || 4650;

    try {
      await mockApp.close();
    } catch { /* ignore */ }

    mockApp = await createMockServer(newPort);
    try {
      await mockApp.listen({ port: newPort, host: '0.0.0.0' });
      setMockStatus(true);
      emit('server:status', { running: true, port: newPort });
      return { success: true, port: newPort };
    } catch (err: any) {
      setMockStatus(false);
      emit('server:status', { running: false, port: newPort });
      return { success: false, error: err.message };
    }
  };

  // Create admin server with restart handler
  const { app: adminApp, setMockStatus } = await createAdminServer(handleRestart);

  // Start Admin UI
  await adminApp.listen({ port: adminPort, host: '0.0.0.0' });
  const localIp = getLocalIp();
  console.log(`Admin UI: http://${localIp}:${adminPort}`);

  // Start Mock API
  try {
    await mockApp.listen({ port: mockPort, host: '0.0.0.0' });
    setMockStatus(true);
    console.log(`Mock API: http://${localIp}:${mockPort}`);
    emit('server:status', { running: true, port: mockPort });
  } catch (err) {
    console.error(`Failed to start mock server on port ${mockPort}:`, err);
    setMockStatus(false);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    try { await mockApp.close(); } catch { /* ignore */ }
    try { await adminApp.close(); } catch { /* ignore */ }
    closeDb();
    try {
      const pidFile = join(resolveDataDir(), 'mocka.pid');
      if (existsSync(pidFile)) unlinkSync(pidFile);
    } catch { /* ignore */ }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
