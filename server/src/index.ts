import { initSchema } from './db/schema.js';
import { reload } from './services/route-registry.js';
import { createAdminServer } from './admin-server.js';
import { createMockServer } from './mock-server.js';
import * as settingsService from './services/settings.service.js';
import { emit } from './services/domain-events.js';
import { getLocalIp, checkPort } from './utils/network.js';
import { closeDb } from './db/connection.js';

const ADMIN_PORT = parseInt(process.env.ADMIN_PORT || '') || 3000;
const MOCK_PORT_OVERRIDE = process.env.MOCK_PORT ? parseInt(process.env.MOCK_PORT) : null;

async function main() {
  // Initialize DB
  initSchema();
  reload();

  const settings = settingsService.getAll();
  const mockPort = MOCK_PORT_OVERRIDE ?? (settings.port || 8080);

  // Check port availability before starting
  try {
    await checkPort(ADMIN_PORT);
  } catch {
    console.error(`\x1b[31mError: Admin port ${ADMIN_PORT} is already in use.\x1b[0m`);
    console.error(`  Use ADMIN_PORT=<port> to specify a different port.`);
    process.exit(1);
  }
  try {
    await checkPort(mockPort);
  } catch {
    console.error(`\x1b[31mError: Mock server port ${mockPort} is already in use.\x1b[0m`);
    console.error(`  Use MOCK_PORT=<port> to specify a different port.`);
    process.exit(1);
  }

  let mockApp = await createMockServer(mockPort);

  // Restart handler (passed to admin server before listen)
  const handleRestart = async () => {
    const newSettings = settingsService.getAll();
    const newPort = newSettings.port || 8080;

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

  // Start Admin API
  await adminApp.listen({ port: ADMIN_PORT, host: '0.0.0.0' });
  const localIp = getLocalIp();
  console.log(`Admin API:   http://localhost:${ADMIN_PORT}`);
  console.log(`             http://${localIp}:${ADMIN_PORT}`);

  // Start Mock Server
  try {
    await mockApp.listen({ port: mockPort, host: '0.0.0.0' });
    setMockStatus(true);
    console.log(`Mock Server: http://localhost:${mockPort}`);
    console.log(`             http://${localIp}:${mockPort}`);
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
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
