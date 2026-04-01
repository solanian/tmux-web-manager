import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type http from 'node:http';

import type { AppConfig } from '../config.js';

const COOKIE_NAME = 'twm_session';
const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_BOOTSTRAP_USERNAME = 'admin';

interface HubAuthSessionRecord {
  id: string;
  csrfToken: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
}

interface HubCredentialsRecord {
  username: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface HubAuthState {
  authEnabled: boolean;
  authenticated: boolean;
  authMode: 'session' | 'api-token' | null;
  onboardingRequired: boolean;
  configuredUsername?: string;
  sessionExpiresAt?: string;
  csrfToken?: string;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index < 0) {
          return [part, ''];
        }
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function buildCookie(value: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    secure ? 'Secure' : '',
    `Max-Age=${maxAgeSeconds}`,
  ]
    .filter(Boolean)
    .join('; ');
}

function readBearerToken(req: http.IncomingMessage): string {
  const authorization = req.headers['authorization'];
  if (typeof authorization !== 'string') {
    return '';
  }
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function normalizeUsername(input: string): string {
  return input.trim();
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function loadCredentials(filePath: string): HubCredentialsRecord | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<HubCredentialsRecord>;
    if (!parsed.username || !parsed.salt || !parsed.passwordHash) {
      return undefined;
    }
    return {
      username: parsed.username,
      salt: parsed.salt,
      passwordHash: parsed.passwordHash,
      createdAt: parsed.createdAt || new Date().toISOString(),
      updatedAt: parsed.updatedAt || parsed.createdAt || new Date().toISOString(),
    };
  } catch {
    return undefined;
  }
}

function persistCredentials(filePath: string, username: string, password: string): HubCredentialsRecord {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const salt = crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();
  const record: HubCredentialsRecord = {
    username,
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: now,
    updatedAt: now,
  };
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {}
  return record;
}

export function createHubAuthManager(config: AppConfig) {
  const authEnabled = true;
  const sessionTtlMs = config.hubSessionTtlMs || DEFAULT_SESSION_TTL_MS;
  const secureCookies = Boolean(config.hubSecureCookies);
  const sessionSecret = config.hubSessionSecret || 'tmux-web-manager-dev-secret';
  const credentialsPath = config.hubAuthConfigPath || path.join(config.centralDataDir, 'hub-auth.json');
  const sessions = new Map<string, HubAuthSessionRecord>();
  let credentials = loadCredentials(credentialsPath);

  const bootstrapPassword = config.hubAuthPassword?.trim();
  if (!credentials && bootstrapPassword) {
    credentials = persistCredentials(
      credentialsPath,
      normalizeUsername(config.hubAuthUsername || DEFAULT_BOOTSTRAP_USERNAME),
      bootstrapPassword,
    );
  }

  function signSessionId(sessionId: string): string {
    return crypto.createHmac('sha256', sessionSecret).update(sessionId).digest('hex');
  }

  function encodeSessionCookie(sessionId: string): string {
    return `${sessionId}.${signSessionId(sessionId)}`;
  }

  function decodeSessionCookie(raw: string | undefined): string | undefined {
    if (!raw) {
      return undefined;
    }
    const parts = raw.split('.');
    if (parts.length !== 2) {
      return undefined;
    }
    const [sessionId, signature] = parts;
    if (!sessionId || !signature) {
      return undefined;
    }
    const expected = signSessionId(sessionId);
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (signatureBuffer.length !== expectedBuffer.length) {
      return undefined;
    }
    if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return undefined;
    }
    return sessionId;
  }

  function cleanupExpiredSessions(now = Date.now()): void {
    for (const [id, session] of sessions.entries()) {
      if (session.expiresAt <= now) {
        sessions.delete(id);
      }
    }
  }

  function createSession(): HubAuthSessionRecord {
    cleanupExpiredSessions();
    const now = Date.now();
    const id = crypto.randomBytes(24).toString('hex');
    const session: HubAuthSessionRecord = {
      id,
      csrfToken: crypto.randomBytes(24).toString('hex'),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + sessionTtlMs,
    };
    sessions.set(id, session);
    return session;
  }

  function readSession(req: http.IncomingMessage): HubAuthSessionRecord | undefined {
    cleanupExpiredSessions();
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = decodeSessionCookie(cookies[COOKIE_NAME]);
    if (!sessionId) {
      return undefined;
    }
    const session = sessions.get(sessionId);
    if (!session) {
      return undefined;
    }
    const now = Date.now();
    session.lastSeenAt = now;
    session.expiresAt = now + sessionTtlMs;
    return session;
  }

  function isConfigured(): boolean {
    return Boolean(credentials);
  }

  function isApiTokenAuthorized(req: http.IncomingMessage): boolean {
    if (!credentials || !config.hubApiToken) {
      return false;
    }
    return readBearerToken(req) === config.hubApiToken;
  }

  function getAuthState(req: http.IncomingMessage): HubAuthState {
    if (!credentials) {
      return {
        authEnabled,
        authenticated: false,
        authMode: null,
        onboardingRequired: true,
      };
    }
    if (isApiTokenAuthorized(req)) {
      return {
        authEnabled,
        authenticated: true,
        authMode: 'api-token',
        onboardingRequired: false,
        configuredUsername: credentials.username,
      };
    }
    const session = readSession(req);
    if (!session) {
      return {
        authEnabled,
        authenticated: false,
        authMode: null,
        onboardingRequired: false,
        configuredUsername: credentials.username,
      };
    }
    return {
      authEnabled,
      authenticated: true,
      authMode: 'session',
      onboardingRequired: false,
      configuredUsername: credentials.username,
      sessionExpiresAt: new Date(session.expiresAt).toISOString(),
      csrfToken: session.csrfToken,
    };
  }

  function isAuthorized(req: http.IncomingMessage): boolean {
    return getAuthState(req).authenticated;
  }

  function issueSession(res: http.ServerResponse): HubAuthSessionRecord {
    const session = createSession();
    res.setHeader('Set-Cookie', buildCookie(encodeSessionCookie(session.id), Math.floor(sessionTtlMs / 1000), secureCookies));
    return session;
  }


  function rotateCsrfToken(req: http.IncomingMessage): string | undefined {
    const session = readSession(req);
    if (!session) {
      return undefined;
    }
    session.csrfToken = crypto.randomBytes(24).toString('hex');
    return session.csrfToken;
  }

  function clearSession(req: http.IncomingMessage, res: http.ServerResponse): void {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = decodeSessionCookie(cookies[COOKIE_NAME]);
    if (sessionId) {
      sessions.delete(sessionId);
    }
    res.setHeader('Set-Cookie', buildCookie('', 0, secureCookies));
  }

  function validateCredentials(username: string, password: string): boolean {
    if (!credentials) {
      return false;
    }
    if (normalizeUsername(username) !== credentials.username) {
      return false;
    }
    return hashPassword(password, credentials.salt) === credentials.passwordHash;
  }

  function createInitialCredentials(username: string, password: string): HubCredentialsRecord {
    if (credentials) {
      throw new Error('Hub credentials are already configured');
    }
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) {
      throw new Error('username is required');
    }
    if (password.length < 8) {
      throw new Error('password must be at least 8 characters');
    }
    credentials = persistCredentials(credentialsPath, normalizedUsername, password);
    return credentials;
  }

  return {
    authEnabled,
    getAuthState,
    isAuthorized,
    issueSession,
    clearSession,
    rotateCsrfToken,
    validateCredentials,
    createInitialCredentials,
    isConfigured,
  };
}

export function shouldProtectRoute(pathname: string): boolean {
  return pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/');
}
