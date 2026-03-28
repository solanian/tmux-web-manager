import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import type { RunMode, TmuxSocketMode } from './types.js';

export interface AppConfig {
  mode: RunMode;
  host: string;
  port: number;
  baseUrl: string;
  dataDir: string;
  centralDataDir: string;
  backendDataDir: string;
  allowedRoots: string[];
  backendHost: string;
  backendPort: number;
  backendPublicUrl: string;
  backendName: string;
  backendAuthToken: string;
  backendAuthTokenPath: string;
  tmuxSocketMode: TmuxSocketMode;
  tmuxSocketName: string;
  sessionPrefix: string;
  ohMyTmuxConfigPath: string;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function defaultDataDir(): string {
  return path.join(os.homedir(), '.tmux-web-manager');
}

function resolveBackendAuthToken(
  backendDataDir: string,
  envToken: string | undefined,
): { token: string; tokenPath: string } {
  const tokenPath = path.join(backendDataDir, 'agent-auth-token');
  const providedToken = envToken?.trim();
  if (providedToken) {
    fs.writeFileSync(tokenPath, `${providedToken}\n`, { mode: 0o600 });
    return { token: providedToken, tokenPath };
  }

  if (fs.existsSync(tokenPath)) {
    const existingToken = fs.readFileSync(tokenPath, 'utf8').trim();
    if (existingToken) {
      return { token: existingToken, tokenPath };
    }
  }

  const generatedToken = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(tokenPath, `${generatedToken}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(tokenPath, 0o600);
  } catch {}
  return { token: generatedToken, tokenPath };
}

function parseTmuxSocketMode(value: string | undefined): TmuxSocketMode {
  if (!value || value === 'default') {
    return 'default';
  }
  if (value === 'dedicated') {
    return 'dedicated';
  }
  throw new Error(`Unknown TMUX_SOCKET_MODE: ${value}`);
}

export function loadEnvFile(envPath = path.resolve(process.cwd(), '.env')): void {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

export function parseAllowedRoots(raw: string | undefined): string[] {
  const roots = (raw ?? path.join(os.homedir(), 'workspace'))
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
  return [...new Set(roots)];
}

export function resolveRunMode(args: string[]): RunMode {
  const first = args.find((entry) => !entry.startsWith('-'));
  if (!first || first === 'main') {
    return 'main';
  }
  if (first === 'sub') {
    return 'sub';
  }
  throw new Error(`Unknown mode: ${first}`);
}

export function getUsageText(): string {
  return [
    'Usage:',
    '  node dist/index.js main',
    '  node dist/index.js sub',
    '',
    'Modes:',
    '  main  Start the central web server and a local tmux backend server',
    '  sub   Start only the tmux backend server',
  ].join('\n');
}

export function getConfig(args = process.argv.slice(2)): AppConfig {
  loadEnvFile();
  const mode = resolveRunMode(args);

  const dataDir = path.resolve(process.env['DATA_DIR'] || defaultDataDir());
  const centralDataDir = path.join(dataDir, 'central');
  const backendDataDir = path.join(dataDir, 'backend');
  ensureDir(dataDir);
  ensureDir(centralDataDir);
  ensureDir(backendDataDir);

  const backendPort = parseInteger(process.env['BACKEND_PORT'], 8788);
  const { token: backendAuthToken, tokenPath: backendAuthTokenPath } = resolveBackendAuthToken(
    backendDataDir,
    process.env['BACKEND_AUTH_TOKEN'],
  );

  return {
    mode,
    host: process.env['HOST'] || '0.0.0.0',
    port: parseInteger(process.env['PORT'], 8787),
    baseUrl: process.env['BASE_URL'] || 'http://localhost:8787',
    dataDir,
    centralDataDir,
    backendDataDir,
    allowedRoots: parseAllowedRoots(process.env['ALLOWED_PROJECT_ROOTS']),
    backendHost: process.env['BACKEND_HOST'] || '0.0.0.0',
    backendPort,
    backendPublicUrl: process.env['BACKEND_PUBLIC_URL'] || `http://127.0.0.1:${backendPort}`,
    backendName: process.env['BACKEND_NAME'] || 'local-backend',
    backendAuthToken,
    backendAuthTokenPath,
    tmuxSocketMode: parseTmuxSocketMode(process.env['TMUX_SOCKET_MODE']),
    tmuxSocketName: process.env['TMUX_SOCKET_NAME'] || 'tmux-web-manager',
    sessionPrefix: process.env['SESSION_PREFIX'] || 'tmux-web-manager',
    ohMyTmuxConfigPath:
      process.env['OH_MY_TMUX_CONF'] || path.join(os.homedir(), '.tmux.conf'),
  };
}
