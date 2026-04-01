import http from 'node:http';
import path from 'node:path';

import WebSocket, { WebSocketServer } from 'ws';

import type { AppConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { BackendRegistryStore } from '../store.js';
import type { AggregatedSessionRecord } from '../types.js';
import { createRelayPaneReadGuard, createRelayReadGuard } from './relay-guard.js';
import { createHubAuthManager, shouldProtectRoute } from './auth.js';
import { renderHtmlPage } from './page.js';
import {
  aggregateBackendPanes,
  aggregateBackendStates,
  appendJsonLine,
  buildOrchestrationPaneSummary,
  authHeaders,
  buildRelayAuditRecord,
  fetchBackendPanes,
  fetchBackendState,
  fetchJson,
  getBackendByName,
  normalizeBaseUrl,
  normalizeRelayKeysRequest,
  normalizeRelayMessageRequest,
  normalizeRelayPaneKeysRequest,
  normalizeRelayPaneReadRequest,
  normalizeRelayPaneSendTextRequest,
  normalizeRelayReadRequest,
  normalizeRelaySendTextRequest,
  readJsonBody,
  sendJson,
  sortAggregatedPanesForOrchestration,
  sortAggregatedSessionsByRecentActivity,
} from './helpers.js';

const logger = createLogger('WEB');

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'self' ws: wss:; img-src 'self' data:; font-src 'self' data: https://cdn.jsdelivr.net; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(), camera=(), display-capture=()'
} as const;

function applySecurityHeaders(res: http.ServerResponse): void {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }
}

const DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_AUTH_RATE_LIMIT_MAX_ATTEMPTS = 5;
const DEFAULT_AUDIT_LOG_MAX_BYTES = 1024 * 1024;
const DEFAULT_AUDIT_LOG_MAX_FILES = 5;

interface AuthAuditRecord {
  timestamp: string;
  event: 'auth-session' | 'auth-login' | 'auth-setup' | 'auth-logout' | 'auth-rate-limit' | 'csrf-reject';
  result: 'ok' | 'error';
  remoteAddress: string;
  username?: string;
  authMode?: 'session' | 'api-token' | null;
  error?: string;
}

function getRemoteAddress(req: http.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]!.trim();
  }
  return req.socket.remoteAddress || '';
}

function isUnsafeMethod(method: string | undefined): boolean {
  const normalized = String(method || '').toUpperCase();
  return normalized === 'POST' || normalized === 'PUT' || normalized === 'PATCH' || normalized === 'DELETE';
}

function buildAllowedOrigins(req: http.IncomingMessage, configuredOrigin: string): string[] {
  const origins = new Set<string>();
  if (configuredOrigin) {
    origins.add(configuredOrigin);
  }
  const host = typeof req.headers.host === 'string' ? req.headers.host.trim() : '';
  if (host) {
    const forwardedProto = typeof req.headers['x-forwarded-proto'] === 'string' ? req.headers['x-forwarded-proto'].split(',')[0]!.trim() : '';
    const protocol = forwardedProto || 'http';
    origins.add(`${protocol}://${host}`);
  }
  return [...origins];
}

function isAllowedOrigin(req: http.IncomingMessage, configuredOrigin: string): boolean {
  const requestOrigin = extractRequestOrigin(req);
  if (!requestOrigin) {
    return false;
  }
  return buildAllowedOrigins(req, configuredOrigin).includes(requestOrigin);
}

function extractRequestOrigin(req: http.IncomingMessage): string {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.trim()) {
    return origin.trim();
  }
  const referer = req.headers.referer;
  if (typeof referer === 'string' && referer.trim()) {
    try {
      return new URL(referer).origin;
    } catch {
      return '';
    }
  }
  return '';
}

async function resolveTargetBackendOrThrow(
  store: BackendRegistryStore,
  targetBackendName: string,
) {
  const targetBackend = getBackendByName(store, targetBackendName);
  if (!targetBackend) {
    throw new Error(`Unknown backend name: ${targetBackendName}`);
  }
  return targetBackend;
}

async function resolvePaneReferenceOrThrow(
  store: BackendRegistryStore,
  backendName: string,
  paneId: string | undefined,
  label: string | undefined,
) {
  const backend = await resolveTargetBackendOrThrow(store, backendName);
  const panes = await fetchBackendPanes(backend);
  if (paneId?.trim()) {
    const pane = panes.find((entry) => entry.paneId === paneId.trim());
    if (!pane) {
      throw new Error(`Unknown tmux pane id: ${paneId.trim()}`);
    }
    return { backend, pane };
  }
  const normalizedLabel = label?.trim();
  if (!normalizedLabel) {
    throw new Error('targetPaneId or targetLabel is required');
  }
  const matches = panes.filter((entry) => entry.label === normalizedLabel);
  if (matches.length === 0) {
    throw new Error(`Unknown tmux pane label: ${normalizedLabel}`);
  }
  if (matches.length > 1) {
    throw new Error(`Ambiguous tmux pane label: ${normalizedLabel}`);
  }
  return { backend, pane: matches[0]! };
}

function readPaneSelector(
  body: Record<string, unknown>,
  side: 'source' | 'target',
): { backendName: string; paneId?: string; label?: string } {
  const backendField = side === 'source' ? 'sourceBackendName' : 'targetBackendName';
  const paneIdField = side === 'source' ? 'sourcePaneId' : 'targetPaneId';
  const labelField = side === 'source' ? 'sourceLabel' : 'targetLabel';
  const backendName = String(body[backendField] || '').trim();
  if (!backendName) {
    throw new Error(`${backendField} is required`);
  }
  const paneId = String(body[paneIdField] || '').trim();
  const label = String(body[labelField] || '').trim();
  if (!paneId && !label) {
    throw new Error(`${paneIdField} or ${labelField} is required`);
  }
  return {
    backendName,
    ...(paneId ? { paneId } : {}),
    ...(label ? { label } : {}),
  };
}

async function resolveSourcePaneIdentity(
  store: BackendRegistryStore,
  selector: { backendName: string; paneId?: string; label?: string },
) {
  if (selector.paneId) {
    return {
      backendName: selector.backendName,
      paneId: selector.paneId,
    };
  }
  const source = await resolvePaneReferenceOrThrow(
    store,
    selector.backendName,
    undefined,
    selector.label,
  );
  return {
    backendName: source.backend.name,
    paneId: source.pane.paneId,
  };
}

export function createWebServer(config: AppConfig, store: BackendRegistryStore) {
  const relayLogPath = path.join(config.centralDataDir, 'relay-log.jsonl');
  const relayReadGuard = createRelayReadGuard();
  const relayPaneReadGuard = createRelayPaneReadGuard();
  const hubAuth = createHubAuthManager(config);
  const authLogPath = path.join(config.centralDataDir, 'auth-log.jsonl');
  const authAttemptWindowMs = DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS;
  const authAttemptLimit = DEFAULT_AUTH_RATE_LIMIT_MAX_ATTEMPTS;
  const auditLogOptions = { maxBytes: DEFAULT_AUDIT_LOG_MAX_BYTES, maxFiles: DEFAULT_AUDIT_LOG_MAX_FILES };
  const authAttempts = new Map<string, number[]>();
  const expectedOrigin = (() => {
    try {
      return new URL(config.baseUrl).origin;
    } catch {
      return '';
    }
  })();

  function appendAuthAudit(event: AuthAuditRecord['event'], req: http.IncomingMessage, result: AuthAuditRecord['result'], details: { username?: string; authMode?: AuthAuditRecord['authMode']; error?: string } = {}): void {
    appendJsonLine(authLogPath, {
      timestamp: new Date().toISOString(),
      event,
      result,
      remoteAddress: getRemoteAddress(req),
      ...details,
    } satisfies AuthAuditRecord, auditLogOptions);
  }

  function checkAuthRateLimit(req: http.IncomingMessage): string | null {
    const key = `${getRemoteAddress(req)}:${req.url || ''}`;
    const now = Date.now();
    const attempts = (authAttempts.get(key) || []).filter((timestamp) => now - timestamp < authAttemptWindowMs);
    if (attempts.length >= authAttemptLimit) {
      authAttempts.set(key, attempts);
      return 'Too many authentication attempts. Please try again later.';
    }
    attempts.push(now);
    authAttempts.set(key, attempts);
    return null;
  }

  function clearAuthRateLimit(req: http.IncomingMessage): void {
    authAttempts.delete(`${getRemoteAddress(req)}:${req.url || ''}`);
  }

  function validateBrowserWrite(req: http.IncomingMessage, authState: ReturnType<typeof hubAuth.getAuthState>): string | null {
    if (!isUnsafeMethod(req.method) || authState.authMode !== 'session') {
      return null;
    }
    if (!isAllowedOrigin(req, expectedOrigin)) {
      return 'Invalid origin';
    }
    const csrfHeader = req.headers['x-csrf-token'];
    const csrfToken = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
    if (!csrfToken || csrfToken !== authState.csrfToken) {
      return 'Invalid CSRF token';
    }
    return null;
  }
  const server = http.createServer(async (req, res) => {
    try {
      applySecurityHeaders(res);
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(renderHtmlPage(hubAuth.authEnabled));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/auth/session') {
        sendJson(res, 200, hubAuth.getAuthState(req));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/login') {
        const rateLimitError = checkAuthRateLimit(req);
        if (rateLimitError) {
          appendAuthAudit('auth-rate-limit', req, 'error', { error: rateLimitError });
          sendJson(res, 429, { error: rateLimitError });
          return;
        }
        const body = await readJsonBody(req);
        const username = String(body.username || '');
        const password = String(body.password || '');
        if (!hubAuth.authEnabled) {
          sendJson(res, 200, hubAuth.getAuthState(req));
          return;
        }
        if (!hubAuth.validateCredentials(username, password)) {
          appendAuthAudit('auth-login', req, 'error', { username, error: 'Invalid credentials' });
          sendJson(res, 401, { error: 'Invalid credentials' });
          return;
        }
        clearAuthRateLimit(req);
        const session = hubAuth.issueSession(res);
        appendAuthAudit('auth-login', req, 'ok', { username, authMode: 'session' });
        sendJson(res, 200, {
          authEnabled: true,
          authenticated: true,
          authMode: 'session',
          onboardingRequired: false,
          configuredUsername: username,
          sessionExpiresAt: new Date(session.expiresAt).toISOString(),
          csrfToken: session.csrfToken,
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/setup') {
        const rateLimitError = checkAuthRateLimit(req);
        if (rateLimitError) {
          appendAuthAudit('auth-rate-limit', req, 'error', { error: rateLimitError });
          sendJson(res, 429, { error: rateLimitError });
          return;
        }
        const body = await readJsonBody(req);
        const username = String(body.username || '');
        const password = String(body.password || '');
        const passwordConfirm = String(body.passwordConfirm || '');
        if (hubAuth.isConfigured()) {
          appendAuthAudit('auth-setup', req, 'error', { username, error: 'Hub credentials are already configured' });
          sendJson(res, 409, { error: 'Hub credentials are already configured' });
          return;
        }
        if (password !== passwordConfirm) {
          appendAuthAudit('auth-setup', req, 'error', { username, error: 'password confirmation does not match' });
          sendJson(res, 400, { error: 'password confirmation does not match' });
          return;
        }
        try {
          const credentials = hubAuth.createInitialCredentials(username, password);
          clearAuthRateLimit(req);
          clearAuthRateLimit(req);
        const session = hubAuth.issueSession(res);
          appendAuthAudit('auth-setup', req, 'ok', { username: credentials.username, authMode: 'session' });
          sendJson(res, 201, {
            authEnabled: true,
            authenticated: true,
            authMode: 'session',
            onboardingRequired: false,
            configuredUsername: credentials.username,
            sessionExpiresAt: new Date(session.expiresAt).toISOString(),
            csrfToken: session.csrfToken,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          appendAuthAudit('auth-setup', req, 'error', { username, error: message });
          sendJson(res, 400, { error: message });
        }
        return;
      }

      const authState = hubAuth.getAuthState(req);

      if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
        if (!authState.authenticated) {
          sendJson(res, 401, { error: 'Authentication required' });
          return;
        }
        const browserWriteError = validateBrowserWrite(req, authState);
        if (browserWriteError) {
          appendAuthAudit('csrf-reject', req, 'error', { authMode: authState.authMode, error: browserWriteError });
          sendJson(res, 403, { error: browserWriteError });
          return;
        }
        hubAuth.clearSession(req, res);
        appendAuthAudit('auth-logout', req, 'ok', { authMode: authState.authMode });
        sendJson(res, 200, { ok: true });
        return;
      }

      if (shouldProtectRoute(url.pathname) && !authState.authenticated) {
        sendJson(res, 401, { error: 'Authentication required' });
        return;
      }
      if (shouldProtectRoute(url.pathname)) {
        const browserWriteError = validateBrowserWrite(req, authState);
        if (browserWriteError) {
          appendAuthAudit('csrf-reject', req, 'error', { authMode: authState.authMode, error: browserWriteError });
          sendJson(res, 403, { error: browserWriteError });
          return;
        }
      }

      if (req.method === 'GET' && url.pathname === '/api/state') {
        const backendStates = await aggregateBackendStates(store);
        const sessions = sortAggregatedSessionsByRecentActivity(
          backendStates.flatMap((backendState) => backendState.sessions),
        );
        sendJson(res, 200, {
          backends: backendStates,
          sessions,
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/panes') {
        const panes = await aggregateBackendPanes(store);
        sendJson(res, 200, { panes });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/orchestration/panes') {
        const panes = sortAggregatedPanesForOrchestration(await aggregateBackendPanes(store)).map(
          buildOrchestrationPaneSummary,
        );
        sendJson(res, 200, {
          targetIdFormat: 'backendName/paneId',
          readBeforeWrite: true,
          endpoints: {
            list: 'GET /api/orchestration/panes',
            resolve: 'GET /api/orchestration/panes/resolve?backendName=<name>&label=<label>',
            read: 'POST /api/relay/panes/read',
            sendText: 'POST /api/relay/panes/send-text',
            sendTextNoEnter: 'POST /api/relay/panes/send-text-no-enter',
            sendKeys: 'POST /api/relay/panes/send-keys',
            message: 'POST /api/relay/panes/message',
            label: 'POST /api/relay/panes/label',
          },
          panes,
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/orchestration/panes/resolve') {
        const backendName = String(url.searchParams.get('backendName') || '').trim();
        const label = String(url.searchParams.get('label') || '').trim();
        if (!backendName) {
          sendJson(res, 400, { error: 'backendName is required' });
          return;
        }
        if (!label) {
          sendJson(res, 400, { error: 'label is required' });
          return;
        }
        try {
          const { pane } = await resolvePaneReferenceOrThrow(store, backendName, undefined, label);
          sendJson(res, 200, { pane: buildOrchestrationPaneSummary(pane) });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/^Unknown backend name: /.test(message) || /^Unknown tmux pane label: /.test(message)) {
            sendJson(res, 404, { error: message });
            return;
          }
          if (/^Ambiguous tmux pane label: /.test(message)) {
            sendJson(res, 409, { error: message });
            return;
          }
          throw error;
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/backends') {
        const body = await readJsonBody(req);
        const draft = store.save({
          name: String(body.name || '').trim(),
          baseUrl: normalizeBaseUrl(String(body.baseUrl || '').trim()),
          authToken: String(body.authToken || '').trim(),
        });
        const state = await fetchBackendState(draft);
        if (!state.online) {
          store.remove(draft.id);
          throw new Error(state.error || 'Backend health check failed');
        }
        sendJson(res, 201, { backend: draft });
        return;
      }

      if (req.method === 'PUT' && url.pathname.startsWith('/api/backends/')) {
        const backendId = url.pathname.slice('/api/backends/'.length);
        const body = await readJsonBody(req);
        const draft = store.save({
          id: backendId,
          name: String(body.name || '').trim(),
          baseUrl: normalizeBaseUrl(String(body.baseUrl || '').trim()),
          authToken: String(body.authToken || '').trim(),
        });
        const state = await fetchBackendState(draft);
        if (!state.online) {
          throw new Error(state.error || 'Backend health check failed');
        }
        sendJson(res, 200, { backend: draft });
        return;
      }

      if (req.method === 'DELETE' && url.pathname.startsWith('/api/backends/')) {
        const backendId = url.pathname.slice('/api/backends/'.length);
        if (!store.remove(backendId)) {
          sendJson(res, 404, { error: `Unknown backend id: ${backendId}` });
          return;
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/sessions') {
        const body = await readJsonBody(req);
        const backendId = String(body.backendId || '').trim();
        const backend = store.getById(backendId);
        if (!backend) {
          sendJson(res, 404, { error: `Unknown backend id: ${backendId}` });
          return;
        }
        const payload = await fetchJson<{ session: AggregatedSessionRecord }>(backend, '/api/sessions', {
          method: 'POST',
          body: JSON.stringify({
            path: String(body.path || '').trim(),
            sessionName: String(body.sessionName || '').trim(),
          }),
        });
        sendJson(res, 201, payload);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/relay/send-text') {
        const body = await readJsonBody(req);
        try {
          const relayRequest = normalizeRelaySendTextRequest(body);
          relayReadGuard.requireRecentRead(relayRequest);
          const targetBackend = await resolveTargetBackendOrThrow(store, relayRequest.targetBackendName);
          const payload = await fetchJson<{ ok: true }>(
            targetBackend,
            `/api/sessions/by-name/${encodeURIComponent(relayRequest.targetSessionName)}/send-text`,
            {
              method: 'POST',
              body: JSON.stringify({ text: relayRequest.text }),
            },
          );
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'send-text',
              result: 'ok',
              targetBackend,
            }),
          );
          sendJson(res, 200, payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'send-text',
              result: 'error',
              error: message,
            }),
          );
          if (/^Unknown backend name: /.test(message)) {
            sendJson(res, 404, { error: message });
            return;
          }
          if (/^Recent read required/.test(message)) {
            sendJson(res, 409, { error: message });
            return;
          }
          throw error;
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/relay/send-text-no-enter') {
        const body = await readJsonBody(req);
        try {
          const relayRequest = normalizeRelaySendTextRequest(body);
          relayReadGuard.requireRecentRead(relayRequest);
          const targetBackend = await resolveTargetBackendOrThrow(store, relayRequest.targetBackendName);
          const payload = await fetchJson<{ ok: true }>(
            targetBackend,
            `/api/sessions/by-name/${encodeURIComponent(relayRequest.targetSessionName)}/send-text-no-enter`,
            {
              method: 'POST',
              body: JSON.stringify({ text: relayRequest.text }),
            },
          );
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'send-text-no-enter',
              result: 'ok',
              targetBackend,
            }),
          );
          sendJson(res, 200, payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'send-text-no-enter',
              result: 'error',
              error: message,
            }),
          );
          if (/^Unknown backend name: /.test(message)) {
            sendJson(res, 404, { error: message });
            return;
          }
          if (/^Recent read required/.test(message)) {
            sendJson(res, 409, { error: message });
            return;
          }
          throw error;
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/relay/send-keys') {
        const body = await readJsonBody(req);
        try {
          const relayRequest = normalizeRelayKeysRequest(body);
          relayReadGuard.requireRecentRead(relayRequest);
          const targetBackend = await resolveTargetBackendOrThrow(store, relayRequest.targetBackendName);
          const payload = await fetchJson<{ ok: true }>(
            targetBackend,
            `/api/sessions/by-name/${encodeURIComponent(relayRequest.targetSessionName)}/send-keys`,
            {
              method: 'POST',
              body: JSON.stringify({ keys: relayRequest.keys }),
            },
          );
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'send-keys',
              result: 'ok',
              targetBackend,
            }),
          );
          sendJson(res, 200, payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'send-keys',
              result: 'error',
              error: message,
            }),
          );
          if (/^Unknown backend name: /.test(message)) {
            sendJson(res, 404, { error: message });
            return;
          }
          if (/^Recent read required/.test(message)) {
            sendJson(res, 409, { error: message });
            return;
          }
          throw error;
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/relay/message') {
        const body = await readJsonBody(req);
        try {
          const relayRequest = normalizeRelayMessageRequest(body);
          relayReadGuard.requireRecentRead(relayRequest);
          const targetBackend = await resolveTargetBackendOrThrow(store, relayRequest.targetBackendName);
          const payload = await fetchJson<{ ok: true }>(
            targetBackend,
            `/api/sessions/by-name/${encodeURIComponent(relayRequest.targetSessionName)}/message`,
            {
              method: 'POST',
              body: JSON.stringify({
                fromBackendName: relayRequest.sourceBackendName,
                fromSessionName: relayRequest.sourceSessionName,
                text: relayRequest.text,
              }),
            },
          );
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'message',
              result: 'ok',
              targetBackend,
            }),
          );
          sendJson(res, 200, payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'message',
              result: 'error',
              error: message,
            }),
          );
          if (/^Unknown backend name: /.test(message)) {
            sendJson(res, 404, { error: message });
            return;
          }
          if (/^Recent read required/.test(message)) {
            sendJson(res, 409, { error: message });
            return;
          }
          throw error;
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/relay/read') {
        const body = await readJsonBody(req);
        try {
          const relayRequest = normalizeRelayReadRequest(body);
          const targetBackend = await resolveTargetBackendOrThrow(store, relayRequest.targetBackendName);
          const search = relayRequest.lines ? `?lines=${encodeURIComponent(String(relayRequest.lines))}` : '';
          const payload = await fetchJson<{ sessionName: string; lines: number; output: string }>(
            targetBackend,
            `/api/sessions/by-name/${encodeURIComponent(relayRequest.targetSessionName)}/read${search}`,
          );
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'read',
              result: 'ok',
              targetBackend,
            }),
          );
          relayReadGuard.markRead(relayRequest);
          sendJson(res, 200, payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'read',
              result: 'error',
              error: message,
            }),
          );
          if (/^Unknown backend name: /.test(message)) {
            sendJson(res, 404, { error: message });
            return;
          }
          throw error;
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/relay/panes/send-text') {
        const body = await readJsonBody(req);
        try {
          const sourceSelector = readPaneSelector(body, 'source');
          const source = await resolveSourcePaneIdentity(store, sourceSelector);
          const target = await resolvePaneReferenceOrThrow(
            store,
            readPaneSelector(body, 'target').backendName,
            readPaneSelector(body, 'target').paneId,
            readPaneSelector(body, 'target').label,
          );
          const text = String(body.text || '');
          if (!text) {
            throw new Error('text is required');
          }
          relayPaneReadGuard.requireRecentRead({
            sourceBackendName: source.backendName,
            sourcePaneId: source.paneId,
            targetBackendName: target.backend.name,
            targetPaneId: target.pane.paneId,
          });
          const payload = await fetchJson<{ ok: true }>(
            target.backend,
            `/api/panes/by-id/${encodeURIComponent(target.pane.paneId)}/send-text`,
            {
              method: 'POST',
              body: JSON.stringify({ text }),
            },
          );
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'pane-send-text',
              result: 'ok',
              targetBackend: target.backend,
            }),
          );
          sendJson(res, 200, payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'pane-send-text',
              result: 'error',
              error: message,
            }),
          );
          if (/^Unknown backend name: /.test(message) || /^Unknown tmux pane (id|label): /.test(message)) {
            sendJson(res, 404, { error: message });
            return;
          }
          if (/^Ambiguous tmux pane label: /.test(message)) {
            sendJson(res, 409, { error: message });
            return;
          }
          if (/^Recent read required/.test(message)) {
            sendJson(res, 409, { error: message });
            return;
          }
          throw error;
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/relay/panes/send-text-no-enter') {
        const body = await readJsonBody(req);
        try {
          const sourceSelector = readPaneSelector(body, 'source');
          const targetSelector = readPaneSelector(body, 'target');
          const source = await resolveSourcePaneIdentity(store, sourceSelector);
          const target = await resolvePaneReferenceOrThrow(
            store,
            targetSelector.backendName,
            targetSelector.paneId,
            targetSelector.label,
          );
          const text = String(body.text || '');
          if (!text) {
            throw new Error('text is required');
          }
          relayPaneReadGuard.requireRecentRead({
            sourceBackendName: source.backendName,
            sourcePaneId: source.paneId,
            targetBackendName: target.backend.name,
            targetPaneId: target.pane.paneId,
          });
          const payload = await fetchJson<{ ok: true }>(
            target.backend,
            `/api/panes/by-id/${encodeURIComponent(target.pane.paneId)}/send-text-no-enter`,
            {
              method: 'POST',
              body: JSON.stringify({ text }),
            },
          );
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'pane-send-text-no-enter',
              result: 'ok',
              targetBackend: target.backend,
            }),
          );
          sendJson(res, 200, payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'pane-send-text-no-enter',
              result: 'error',
              error: message,
            }),
          );
          if (/^Unknown backend name: /.test(message) || /^Unknown tmux pane (id|label): /.test(message)) {
            sendJson(res, 404, { error: message });
            return;
          }
          if (/^Ambiguous tmux pane label: /.test(message)) {
            sendJson(res, 409, { error: message });
            return;
          }
          if (/^Recent read required/.test(message)) {
            sendJson(res, 409, { error: message });
            return;
          }
          throw error;
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/relay/panes/send-keys') {
        const body = await readJsonBody(req);
        try {
          const sourceSelector = readPaneSelector(body, 'source');
          const targetSelector = readPaneSelector(body, 'target');
          const source = await resolveSourcePaneIdentity(store, sourceSelector);
          const target = await resolvePaneReferenceOrThrow(
            store,
            targetSelector.backendName,
            targetSelector.paneId,
            targetSelector.label,
          );
          const keys = Array.isArray(body.keys)
            ? body.keys.map((value) => String(value || '').trim()).filter(Boolean)
            : [];
          if (keys.length === 0) {
            throw new Error('keys is required');
          }
          relayPaneReadGuard.requireRecentRead({
            sourceBackendName: source.backendName,
            sourcePaneId: source.paneId,
            targetBackendName: target.backend.name,
            targetPaneId: target.pane.paneId,
          });
          const payload = await fetchJson<{ ok: true }>(
            target.backend,
            `/api/panes/by-id/${encodeURIComponent(target.pane.paneId)}/send-keys`,
            {
              method: 'POST',
              body: JSON.stringify({ keys }),
            },
          );
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'pane-send-keys',
              result: 'ok',
              targetBackend: target.backend,
            }),
          );
          sendJson(res, 200, payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'pane-send-keys',
              result: 'error',
              error: message,
            }),
          );
          if (/^Unknown backend name: /.test(message) || /^Unknown tmux pane (id|label): /.test(message)) {
            sendJson(res, 404, { error: message });
            return;
          }
          if (/^Ambiguous tmux pane label: /.test(message)) {
            sendJson(res, 409, { error: message });
            return;
          }
          if (/^Recent read required/.test(message)) {
            sendJson(res, 409, { error: message });
            return;
          }
          throw error;
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/relay/panes/message') {
        const body = await readJsonBody(req);
        try {
          const sourceSelector = readPaneSelector(body, 'source');
          const targetSelector = readPaneSelector(body, 'target');
          const source = await resolveSourcePaneIdentity(store, sourceSelector);
          const target = await resolvePaneReferenceOrThrow(
            store,
            targetSelector.backendName,
            targetSelector.paneId,
            targetSelector.label,
          );
          const text = String(body.text || '');
          if (!text) {
            throw new Error('text is required');
          }
          relayPaneReadGuard.requireRecentRead({
            sourceBackendName: source.backendName,
            sourcePaneId: source.paneId,
            targetBackendName: target.backend.name,
            targetPaneId: target.pane.paneId,
          });
          const payload = await fetchJson<{ ok: true }>(
            target.backend,
            `/api/panes/by-id/${encodeURIComponent(target.pane.paneId)}/message`,
            {
              method: 'POST',
              body: JSON.stringify({
                fromBackendName: source.backendName,
                fromPaneId: source.paneId,
                text,
              }),
            },
          );
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'pane-message',
              result: 'ok',
              targetBackend: target.backend,
            }),
          );
          sendJson(res, 200, payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'pane-message',
              result: 'error',
              error: message,
            }),
          );
          if (/^Unknown backend name: /.test(message) || /^Unknown tmux pane (id|label): /.test(message)) {
            sendJson(res, 404, { error: message });
            return;
          }
          if (/^Ambiguous tmux pane label: /.test(message)) {
            sendJson(res, 409, { error: message });
            return;
          }
          if (/^Recent read required/.test(message)) {
            sendJson(res, 409, { error: message });
            return;
          }
          throw error;
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/relay/panes/read') {
        const body = await readJsonBody(req);
        try {
          const sourceSelector = readPaneSelector(body, 'source');
          const targetSelector = readPaneSelector(body, 'target');
          const source = await resolveSourcePaneIdentity(store, sourceSelector);
          const target = await resolvePaneReferenceOrThrow(
            store,
            targetSelector.backendName,
            targetSelector.paneId,
            targetSelector.label,
          );
          const rawLines = body.lines;
          const lines =
            typeof rawLines === 'number'
              ? Math.max(1, Math.min(500, Math.floor(rawLines)))
              : typeof rawLines === 'string' && rawLines.trim()
                ? Math.max(1, Math.min(500, Number.parseInt(rawLines, 10)))
                : undefined;
          const search = lines ? `?lines=${encodeURIComponent(String(lines))}` : '';
          const payload = await fetchJson<{ paneId: string; lines: number; output: string }>(
            target.backend,
            `/api/panes/by-id/${encodeURIComponent(target.pane.paneId)}/read${search}`,
          );
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'pane-read',
              result: 'ok',
              targetBackend: target.backend,
            }),
          );
          relayPaneReadGuard.markRead({
            sourceBackendName: source.backendName,
            sourcePaneId: source.paneId,
            targetBackendName: target.backend.name,
            targetPaneId: target.pane.paneId,
          });
          sendJson(res, 200, payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'pane-read',
              result: 'error',
              error: message,
            }),
          );
          if (
            /^Unknown backend name: /.test(message) ||
            /^Unknown tmux pane (id|label): /.test(message)
          ) {
            sendJson(res, 404, { error: message });
            return;
          }
          if (/^Ambiguous tmux pane label: /.test(message)) {
            sendJson(res, 409, { error: message });
            return;
          }
          throw error;
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/relay/panes/label') {
        const body = await readJsonBody(req);
        try {
          const sourceSelector = readPaneSelector(body, 'source');
          const targetSelector = readPaneSelector(body, 'target');
          const source = await resolveSourcePaneIdentity(store, sourceSelector);
          const target = await resolvePaneReferenceOrThrow(
            store,
            targetSelector.backendName,
            targetSelector.paneId,
            targetSelector.label,
          );
          const label = String(body.label || '').trim();
          const payload = await fetchJson<{ ok: true; paneId: string; label: string }>(
            target.backend,
            `/api/panes/by-id/${encodeURIComponent(target.pane.paneId)}/label`,
            {
              method: 'POST',
              body: JSON.stringify({ label }),
            },
          );
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'pane-label',
              result: 'ok',
              targetBackend: target.backend,
            }),
          );
          sendJson(res, 200, payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'pane-label',
              result: 'error',
              error: message,
            }),
          );
          if (
            /^Unknown backend name: /.test(message) ||
            /^Unknown tmux pane (id|label): /.test(message)
          ) {
            sendJson(res, 404, { error: message });
            return;
          }
          if (/^Ambiguous tmux pane label: /.test(message)) {
            sendJson(res, 409, { error: message });
            return;
          }
          throw error;
        }
        return;
      }

      if (req.method === 'PUT' && url.pathname.startsWith('/api/sessions/')) {
        const [, , , backendId, sessionId] = url.pathname.split('/');
        const backend = backendId ? store.getById(backendId) : undefined;
        if (!backend || !sessionId) {
          sendJson(res, 404, { error: 'Unknown backend or session' });
          return;
        }
        const body = await readJsonBody(req);
        const payload = await fetchJson<{ session: AggregatedSessionRecord }>(
          backend,
          `/api/sessions/${encodeURIComponent(sessionId)}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              sessionName: String(body.sessionName || '').trim(),
            }),
          },
        );
        sendJson(res, 200, payload);
        return;
      }

      if (req.method === 'DELETE' && url.pathname.startsWith('/api/sessions/')) {
        const [, , , backendId, sessionId] = url.pathname.split('/');
        const backend = backendId ? store.getById(backendId) : undefined;
        if (!backend || !sessionId) {
          sendJson(res, 404, { error: 'Unknown backend or session' });
          return;
        }
        await fetchJson<{ ok: true }>(backend, `/api/sessions/${encodeURIComponent(sessionId)}`, {
          method: 'DELETE',
        });
        sendJson(res, 200, { ok: true });
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname !== '/ws/terminal') {
      socket.destroy();
      return;
    }
    const authState = hubAuth.getAuthState(request);
    if (!authState.authenticated) {
      socket.destroy();
      return;
    }
    if (authState.authMode === 'session') {
      if (!isAllowedOrigin(request, expectedOrigin)) {
        socket.destroy();
        return;
      }
    }

    const backendId = url.searchParams.get('backendId') || '';
    const sessionId = url.searchParams.get('sessionId') || '';
    const backend = store.getById(backendId);
    if (!backend || !sessionId) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const backendWsUrl = new URL(normalizeBaseUrl(backend.baseUrl));
      backendWsUrl.protocol = backendWsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      backendWsUrl.pathname = `/ws/sessions/${encodeURIComponent(sessionId)}`;

      const upstream = new WebSocket(backendWsUrl, {
        headers: authHeaders(backend),
      });

      ws.on('message', (data) => {
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.send(data.toString());
        }
      });

      upstream.on('message', (data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data.toString());
        }
      });

      const closeBoth = () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
          upstream.close();
        }
      };

      ws.on('close', closeBoth);
      ws.on('error', closeBoth);
      upstream.on('close', closeBoth);
      upstream.on('error', (error) => {
        logger.warn('Terminal proxy error:', error);
        closeBoth();
      });
    });
  });

  return {
    async start(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => resolve());
      });
      logger.log(`central web server listening on ${config.host}:${config.port}`);
    },
    async stop(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        wss.close();
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
