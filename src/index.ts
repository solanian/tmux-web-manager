#!/usr/bin/env node

import { getConfig, getUsageText } from './config.js';
import { createBackendServer } from './backend.js';
import { createLogger } from './logger.js';
import { BackendRegistryStore, ManagedSessionStore } from './store.js';
import { ensureTmuxInstalled } from './tmux.js';
import { createWebServer } from './web.js';

const logger = createLogger('MAIN');

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(getUsageText());
    return;
  }

  const config = getConfig(args);
  ensureTmuxInstalled();

  const backendStore = new ManagedSessionStore(config.backendDataDir);
  const backend = createBackendServer(config, backendStore);

  const shutdownTasks: Array<() => Promise<void>> = [];

  if (config.mode === 'sub') {
    await backend.start();
    shutdownTasks.push(() => backend.stop());
    logger.log('Running in sub mode');
    logger.log(`Backend auth token file: ${config.backendAuthTokenPath}`);
  } else {
    const registryStore = new BackendRegistryStore(config.centralDataDir);
    await backend.start();
    shutdownTasks.push(() => backend.stop());

    registryStore.save({
      id: 'local',
      name: config.backendName,
      baseUrl: config.backendPublicUrl,
      authToken: config.backendAuthToken,
    });

    const web = createWebServer(config, registryStore);
    await web.start();
    shutdownTasks.unshift(() => web.stop());
    logger.log(`Running in main mode, UI available at ${config.baseUrl}`);
    logger.log(`Local backend auth token file: ${config.backendAuthTokenPath}`);
    logger.log(`Hub auth enabled: ${config.hubAuthPassword ? 'yes' : 'no'}`);
    if (config.hubApiTokenPath) {
      logger.log(`Hub API token file: ${config.hubApiTokenPath}`);
    }
  }

  const shutdown = async (reason: string) => {
    logger.warn(`Shutdown requested: ${reason}`);
    for (const stop of shutdownTasks) {
      try {
        await stop();
      } catch (error) {
        logger.warn('Shutdown error:', error);
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('beforeExit', (code) => {
    logger.warn(`beforeExit: ${code}`);
  });
  process.on('exit', (code) => {
    logger.warn(`exit: ${code}`);
  });
  process.on('warning', (warning) => {
    logger.warn('process warning:', warning);
  });
  process.on('uncaughtException', (error) => {
    logger.error('uncaughtException:', error);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection:', reason);
  });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
