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
  hubAuthUsername?: string;
  hubAuthPassword?: string;
  hubAuthConfigPath?: string;
  hubApiToken?: string;
  hubApiTokenPath?: string;
  hubSessionSecret?: string;
  hubSessionSecretPath?: string;
  hubSessionTtlMs?: number;
  hubSecureCookies?: boolean;
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

function defaultBackendName(): string {
  return os.hostname();
}

function resolvePersistedSecret(
  dir: string,
  fileName: string,
  providedValue: string | undefined,
  bytes = 24,
  generateIfMissing = true,
): { value: string; filePath: string } {
  const filePath = path.join(dir, fileName);
  const provided = providedValue?.trim();
  if (provided) {
    fs.writeFileSync(filePath, `${provided}\n`, { mode: 0o600 });
    return { value: provided, filePath };
  }

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8').trim();
    if (existing) {
      return { value: existing, filePath };
    }
  }

  if (!generateIfMissing) {
    return { value: '', filePath };
  }

  const generated = crypto.randomBytes(bytes).toString('hex');
  fs.writeFileSync(filePath, `${generated}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {}
  return { value: generated, filePath };
}

function resolveBackendAuthToken(
  backendDataDir: string,
  envToken: string | undefined,
): { token: string; tokenPath: string } {
  const { value, filePath } = resolvePersistedSecret(backendDataDir, 'agent-auth-token', envToken, 24, true);
  return { token: value, tokenPath: filePath };
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


export function collectSecretPermissionWarnings(config: Pick<AppConfig, 'backendAuthTokenPath' | 'hubApiTokenPath' | 'hubSessionSecretPath' | 'hubAuthConfigPath'>): string[] {
  const warnings: string[] = [];
  const files = [
    config.backendAuthTokenPath,
    config.hubApiTokenPath || '',
    config.hubSessionSecretPath || '',
    config.hubAuthConfigPath || '',
  ].filter(Boolean);

  for (const filePath of files) {
    try {
      if (!fs.existsSync(filePath)) {
        continue;
      }
      const stat = fs.statSync(filePath);
      if ((stat.mode & 0o077) !== 0) {
        warnings.push(`Secret file is too permissive: ${filePath}`);
      }
    } catch (error) {
      warnings.push(`Failed to inspect secret file permissions: ${filePath} (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  return warnings;
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
  const hubAuthPassword = (process.env['HUB_AUTH_PASSWORD'] || '').trim();
  const { value: hubApiToken, filePath: hubApiTokenPath } = resolvePersistedSecret(
    centralDataDir,
    'hub-api-token',
    process.env['HUB_API_TOKEN'],
    24,
    true,
  );
  const { value: hubSessionSecret, filePath: hubSessionSecretPath } = resolvePersistedSecret(
    centralDataDir,
    'hub-session-secret',
    process.env['HUB_SESSION_SECRET'],
    32,
    true,
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
    backendName: process.env['BACKEND_NAME'] || defaultBackendName(),
    backendAuthToken,
    backendAuthTokenPath,
    hubAuthUsername: (process.env['HUB_AUTH_USERNAME'] || '').trim(),
    hubAuthPassword,
    hubAuthConfigPath: path.join(centralDataDir, 'hub-auth.json'),
    hubApiToken,
    hubApiTokenPath,
    hubSessionSecret,
    hubSessionSecretPath,
    hubSessionTtlMs: parseInteger(process.env['HUB_SESSION_TTL_MS'], 1000 * 60 * 60 * 12),
    hubSecureCookies:
      (process.env['HUB_SECURE_COOKIES'] || '').trim()
        ? ['1', 'true', 'yes', 'on'].includes((process.env['HUB_SECURE_COOKIES'] || '').trim().toLowerCase())
        : (() => {
            try {
              return new URL(process.env['BASE_URL'] || 'http://localhost:8787').protocol === 'https:';
            } catch {
              return false;
            }
          })(),
    tmuxSocketMode: parseTmuxSocketMode(process.env['TMUX_SOCKET_MODE']),
    tmuxSocketName: process.env['TMUX_SOCKET_NAME'] || 'tmux-web-manager',
    sessionPrefix: process.env['SESSION_PREFIX'] || 'tmux-web-manager',
    ohMyTmuxConfigPath:
      process.env['OH_MY_TMUX_CONF'] || path.join(os.homedir(), '.tmux.conf'),
  };
}
