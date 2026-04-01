#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createLogger } from './logger.js';
import {
  buildBridgeScript,
  buildEnvFile,
  buildRunScript,
  defaultNativeDataDir,
  defaultNativePrefix,
  type NativeInstallOptions,
} from './native.js';
import type { TmuxSocketMode } from './types.js';

const logger = createLogger('INSTALL');

type CliOptions = NativeInstallOptions;

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseTmuxSocketMode(value: string | undefined, fallback: TmuxSocketMode): TmuxSocketMode {
  if (!value) {
    return fallback;
  }
  if (value === 'default' || value === 'dedicated') {
    return value;
  }
  return fallback;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    prefix: defaultNativePrefix(),
    dataDir: defaultNativeDataDir(),
    host: '0.0.0.0',
    port: 8787,
    baseUrl: 'http://localhost:8787',
    allowedRoots: [path.join(os.homedir(), 'workspace')],
    backendHost: '0.0.0.0',
    backendPort: 8788,
    backendPublicUrl: 'http://127.0.0.1:8788',
    backendName: 'local-backend',
    backendAuthToken: '',
    hubAuthPassword: '',
    hubApiToken: '',
    hubSessionTtlMs: 43200000,
    tmuxSocketMode: 'default',
    tmuxSocketName: 'tmux-web-manager',
    sessionPrefix: 'tmux-web-manager',
    ohMyTmuxConfigPath: path.join(os.homedir(), '.tmux.conf'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = argv[index + 1];
    switch (arg) {
      case '--prefix':
        options.prefix = path.resolve(next || options.prefix);
        index += 1;
        break;
      case '--data-dir':
        options.dataDir = path.resolve(next || options.dataDir);
        index += 1;
        break;
      case '--host':
        options.host = next || options.host;
        index += 1;
        break;
      case '--port':
        options.port = parseInteger(next, options.port);
        index += 1;
        break;
      case '--base-url':
        options.baseUrl = next || options.baseUrl;
        index += 1;
        break;
      case '--allowed-root':
        if (next) {
          options.allowedRoots.push(path.resolve(next));
        }
        index += 1;
        break;
      case '--backend-host':
        options.backendHost = next || options.backendHost;
        index += 1;
        break;
      case '--backend-port':
        options.backendPort = parseInteger(next, options.backendPort);
        index += 1;
        break;
      case '--backend-public-url':
        options.backendPublicUrl = next || options.backendPublicUrl;
        index += 1;
        break;
      case '--backend-name':
        options.backendName = next || options.backendName;
        index += 1;
        break;
      case '--backend-auth-token':
        options.backendAuthToken = next || '';
        index += 1;
        break;
      case '--hub-auth-password':
        options.hubAuthPassword = next || '';
        index += 1;
        break;
      case '--hub-api-token':
        options.hubApiToken = next || '';
        index += 1;
        break;
      case '--hub-session-ttl-ms':
        options.hubSessionTtlMs = parseInteger(next, options.hubSessionTtlMs);
        index += 1;
        break;
      case '--tmux-socket-mode':
        options.tmuxSocketMode = parseTmuxSocketMode(next, options.tmuxSocketMode);
        index += 1;
        break;
      case '--tmux-socket-name':
        options.tmuxSocketName = next || options.tmuxSocketName;
        index += 1;
        break;
      case '--session-prefix':
        options.sessionPrefix = next || options.sessionPrefix;
        index += 1;
        break;
      case '--oh-my-tmux-conf':
        options.ohMyTmuxConfigPath = next || options.ohMyTmuxConfigPath;
        index += 1;
        break;
      default:
        break;
    }
  }

  options.allowedRoots = [...new Set(options.allowedRoots)];
  return options;
}

function copyRecursive(sourcePath: string, targetPath: string): void {
  fs.cpSync(sourcePath, targetPath, { recursive: true, force: true });
}

function ensureExecutable(filePath: string): void {
  fs.chmodSync(filePath, 0o755);
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function installArtifacts(options: CliOptions): void {
  const repoRoot = path.resolve(path.join(path.dirname(new URL(import.meta.url).pathname), '..'));
  const appDir = path.join(options.prefix, 'app');
  const binDir = path.join(options.prefix, 'bin');
  const etcDir = path.join(options.prefix, 'etc');

  fs.mkdirSync(options.prefix, { recursive: true });
  copyRecursive(path.join(repoRoot, 'dist'), path.join(appDir, 'dist'));
  copyRecursive(path.join(repoRoot, 'node_modules'), path.join(appDir, 'node_modules'));
  for (const fileName of ['package.json', 'package-lock.json', 'README.md', '.env.example']) {
    copyRecursive(path.join(repoRoot, fileName), path.join(appDir, fileName));
  }

  writeFile(path.join(etcDir, 'tmux-web-manager.env'), buildEnvFile(options));
  writeFile(path.join(binDir, 'run-main.sh'), buildRunScript('main'));
  writeFile(path.join(binDir, 'run-sub.sh'), buildRunScript('sub'));
  writeFile(path.join(binDir, 'twm-bridge'), buildBridgeScript());
  ensureExecutable(path.join(binDir, 'run-main.sh'));
  ensureExecutable(path.join(binDir, 'run-sub.sh'));
  ensureExecutable(path.join(binDir, 'twm-bridge'));
}

function usage(): string {
  return [
    'Usage: node dist/install-native.js [options]',
    '',
    'Options:',
    '  --prefix <dir>',
    '  --data-dir <dir>',
    '  --host <host>',
    '  --port <port>',
    '  --base-url <url>',
    '  --allowed-root <dir>   (repeatable)',
    '  --backend-host <host>',
    '  --backend-port <port>',
    '  --backend-public-url <url>',
    '  --backend-name <name>',
    '  --backend-auth-token <token>',
    '  --hub-auth-password <password>',
    '  --hub-api-token <token>',
    '  --hub-session-ttl-ms <ms>',
    '  --tmux-socket-mode <default|dedicated>',
    '  --tmux-socket-name <name>',
    '  --session-prefix <prefix>',
    '  --oh-my-tmux-conf <path>',
    '',
    'Installed helper commands:',
    '  PREFIX/bin/twm-bridge',
  ].join('\n');
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return;
  }
  const options = parseArgs(argv);
  installArtifacts(options);
  logger.log(`Native install completed at ${options.prefix}`);
}

main();
