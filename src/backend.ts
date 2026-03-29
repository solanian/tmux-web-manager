import http from 'node:http';
import crypto from 'node:crypto';

import { spawn as spawnPty } from 'node-pty';
import { WebSocketServer } from 'ws';

import type { AppConfig } from './config.js';
import { createLogger } from './logger.js';
import { ManagedSessionStore } from './store.js';
import {
  buildManagedTmuxConfig,
  createTmuxSession,
  getPaneWorkingDirectory,
  getSessionActivityAt,
  listTmuxPanes,
  listTmuxSessions,
  paneExists,
  readPaneOutput,
  readPaneOutputById,
  renameTmuxSession,
  resolvePaneIdByLabel,
  sendInput,
  sendInputToPane,
  sendKeys,
  sendKeysToPane,
  sessionExists,
  setPaneLabel,
  stopTmuxSession,
  type ManagedTmuxOptions,
  validateProjectPath,
} from './tmux.js';
import { ensureNodePtySpawnHelperExecutable } from './pty.js';
import type { BackendHealth, ManagedSessionRecord } from './types.js';

const logger = createLogger('BACKEND');

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

function isAuthorized(headers: http.IncomingHttpHeaders, authToken: string): boolean {
  if (!authToken) {
    return true;
  }
  return headers.authorization === `Bearer ${authToken}`;
}

export function appendEnter(text: string): string {
  return `${text}\r`;
}

export function normalizeSessionReadLines(value: unknown, fallback = 50): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number.parseInt(value, 10)
        : fallback;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

export function normalizeSessionKeys(body: Record<string, unknown>): string[] {
  const keys = Array.isArray(body.keys)
    ? body.keys
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    : [];
  if (keys.length === 0) {
    throw new Error('keys is required');
  }
  return keys;
}

export function buildSessionMessageText(
  sourceBackendName: string,
  sourceSessionName: string,
  text: string,
  timestamp = new Date().toISOString(),
): string {
  const normalizedText = text.trim();
  if (!normalizedText) {
    throw new Error('text is required');
  }
  return `[relay from:${sourceBackendName}/${sourceSessionName} at:${timestamp}] ${normalizedText}`;
}

export function mergeDiscoveredSessions(
  managedSessions: ManagedSessionRecord[],
  discoveredSessions: Array<{
    tmuxSessionName: string;
    currentPath: string;
    createdAt: string;
    lastActivityAt?: string;
  }>,
): ManagedSessionRecord[] {
  const knownSessionNames = new Set(managedSessions.map((session) => session.tmuxSessionName));
  const importedSessions = discoveredSessions
    .filter((session) => !knownSessionNames.has(session.tmuxSessionName))
    .map<ManagedSessionRecord>((session) => ({
      id: crypto.randomUUID(),
      tmuxSessionName: session.tmuxSessionName,
      requestedPath: session.currentPath,
      currentPath: session.currentPath,
      status: 'running',
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
    }));
  return [...managedSessions, ...importedSessions];
}

function sortTimestampDesc(left?: string, right?: string): number {
  const leftMs = left ? Date.parse(left) : Number.NEGATIVE_INFINITY;
  const rightMs = right ? Date.parse(right) : Number.NEGATIVE_INFINITY;
  return rightMs - leftMs;
}

export function sortSessionsByRecentActivity(
  sessions: ManagedSessionRecord[],
): ManagedSessionRecord[] {
  return [...sessions].sort((left, right) => {
    const activityDiff = sortTimestampDesc(
      left.lastActivityAt || left.createdAt,
      right.lastActivityAt || right.createdAt,
    );
    if (activityDiff !== 0) {
      return activityDiff;
    }
    return sortTimestampDesc(left.createdAt, right.createdAt);
  });
}

export function pruneHiddenSessions(
  store: ManagedSessionStore,
  sessions: ManagedSessionRecord[],
): ManagedSessionRecord[] {
  const visibleSessions: ManagedSessionRecord[] = [];
  for (const session of sessions) {
    if (session.status === 'stopped') {
      store.remove(session.id);
      continue;
    }
    visibleSessions.push(session);
  }
  return visibleSessions;
}

async function syncDiscoveredSessions(
  store: ManagedSessionStore,
  tmuxOptions: ManagedTmuxOptions,
): Promise<void> {
  const managedSessions = store.all();
  const discoveredSessions = await listTmuxSessions(tmuxOptions);
  const mergedSessions = mergeDiscoveredSessions(managedSessions, discoveredSessions);
  for (const session of mergedSessions.slice(managedSessions.length)) {
    store.create({
      tmuxSessionName: session.tmuxSessionName,
      requestedPath: session.requestedPath,
      currentPath: session.currentPath,
      status: session.status,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
    });
  }
}

async function hydrateSession(
  session: ManagedSessionRecord,
  tmuxOptions: ManagedTmuxOptions,
  store: ManagedSessionStore,
): Promise<ManagedSessionRecord> {
  let isRunning = await sessionExists(session.tmuxSessionName, tmuxOptions);
  const next: ManagedSessionRecord = {
    ...session,
    status: isRunning ? 'running' : 'stopped',
  };
  if (isRunning) {
    try {
      next.currentPath = await getPaneWorkingDirectory(session.tmuxSessionName, tmuxOptions);
      next.lastActivityAt = await getSessionActivityAt(session.tmuxSessionName, tmuxOptions);
    } catch {
      isRunning = false;
      next.status = 'stopped';
    }
  }
  if (
    next.status === 'stopped'
  ) {
    store.remove(session.id);
  } else if (
    next.status !== session.status ||
    next.currentPath !== session.currentPath
  ) {
    store.update(next);
  }
  return next;
}

export function createBackendServer(config: AppConfig, store: ManagedSessionStore) {
  // Some macOS installs drop the executable bit on node-pty's spawn helper,
  // which breaks PTY attach with "posix_spawnp failed."
  ensureNodePtySpawnHelperExecutable();

  const tmuxOptions: ManagedTmuxOptions = {
    socketMode: config.tmuxSocketMode,
    socketName: config.tmuxSocketName,
    configPath:
      config.tmuxSocketMode === 'dedicated'
        ? buildManagedTmuxConfig(config.backendDataDir, config.ohMyTmuxConfigPath)
        : '',
    sessionPrefix: config.sessionPrefix,
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (!isAuthorized(req.headers, config.backendAuthToken)) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }

      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/api/health') {
        const payload: BackendHealth = {
          ok: true,
          serverName: config.backendName,
          tmuxSocketName:
            config.tmuxSocketMode === 'dedicated' ? config.tmuxSocketName : 'default',
          ohMyTmuxConfigPath:
            config.tmuxSocketMode === 'dedicated' ? config.ohMyTmuxConfigPath || null : null,
        };
        sendJson(res, 200, payload);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/sessions') {
        await syncDiscoveredSessions(store, tmuxOptions);
        const sessions = await Promise.all(
          store.all().map((session) => hydrateSession(session, tmuxOptions, store)),
        );
        sendJson(res, 200, {
          sessions: sortSessionsByRecentActivity(pruneHiddenSessions(store, sessions)),
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/panes') {
        const panes = await listTmuxPanes(tmuxOptions);
        sendJson(res, 200, { panes });
        return;
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/panes/resolve/')) {
        const encodedLabel = url.pathname.slice('/api/panes/resolve/'.length).replace(/\/+$/, '');
        const label = decodeURIComponent(encodedLabel);
        if (!label) {
          sendJson(res, 400, { error: 'label is required' });
          return;
        }
        const paneId = await resolvePaneIdByLabel(label, tmuxOptions);
        const panes = await listTmuxPanes(tmuxOptions);
        const pane = panes.find((entry) => entry.paneId === paneId);
        if (!pane) {
          sendJson(res, 404, { error: `Unknown tmux pane label: ${label}` });
          return;
        }
        sendJson(res, 200, { pane });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/sessions') {
        const body = await readJsonBody(req);
        const requestedPath = String(body.path || '').trim();
        const requestedName =
          typeof body.sessionName === 'string' && body.sessionName.trim()
            ? body.sessionName.trim()
            : undefined;
        if (!requestedPath) {
          sendJson(res, 400, { error: 'path is required' });
          return;
        }

        const validatedPath = validateProjectPath(requestedPath, config.allowedRoots);
        const placeholder = store.create({
          tmuxSessionName: 'pending',
          requestedPath: validatedPath,
          currentPath: validatedPath,
          status: 'running',
          lastActivityAt: new Date().toISOString(),
        });
        try {
          const created = await createTmuxSession(
            placeholder.id,
            validatedPath,
            tmuxOptions,
            requestedName,
          );
          const next = {
            ...placeholder,
            tmuxSessionName: created.tmuxSessionName,
            currentPath: created.currentPath,
            status: 'running' as const,
            lastActivityAt: new Date().toISOString(),
          };
          store.update(next);
          sendJson(res, 201, { session: next });
        } catch (error) {
          store.remove(placeholder.id);
          throw error;
        }
        return;
      }

      if (
        req.method === 'GET' &&
        url.pathname.startsWith('/api/panes/by-id/') &&
        url.pathname.endsWith('/read')
      ) {
        const encodedPaneId = url.pathname
          .slice('/api/panes/by-id/'.length, -'/read'.length)
          .replace(/\/+$/, '');
        const paneId = decodeURIComponent(encodedPaneId);
        if (!paneId) {
          sendJson(res, 400, { error: 'paneId is required' });
          return;
        }

        if (!(await paneExists(paneId, tmuxOptions))) {
          sendJson(res, 404, { error: `Unknown tmux pane id: ${paneId}` });
          return;
        }

        const lines = normalizeSessionReadLines(url.searchParams.get('lines'));
        const output = await readPaneOutputById(paneId, lines, tmuxOptions);
        sendJson(res, 200, { paneId, lines, output });
        return;
      }

      if (
        req.method === 'POST' &&
        url.pathname.startsWith('/api/panes/by-id/') &&
        url.pathname.endsWith('/label')
      ) {
        const encodedPaneId = url.pathname
          .slice('/api/panes/by-id/'.length, -'/label'.length)
          .replace(/\/+$/, '');
        const paneId = decodeURIComponent(encodedPaneId);
        if (!paneId) {
          sendJson(res, 400, { error: 'paneId is required' });
          return;
        }

        const body = await readJsonBody(req);
        const label = String(body.label || '').trim();
        if (!(await paneExists(paneId, tmuxOptions))) {
          sendJson(res, 404, { error: `Unknown tmux pane id: ${paneId}` });
          return;
        }

        const nextLabel = await setPaneLabel(paneId, label, tmuxOptions);
        sendJson(res, 200, { ok: true, paneId, label: nextLabel });
        return;
      }

      if (
        req.method === 'POST' &&
        url.pathname.startsWith('/api/panes/by-id/') &&
        url.pathname.endsWith('/send-text')
      ) {
        const encodedPaneId = url.pathname
          .slice('/api/panes/by-id/'.length, -'/send-text'.length)
          .replace(/\/+$/, '');
        const paneId = decodeURIComponent(encodedPaneId);
        if (!paneId) {
          sendJson(res, 400, { error: 'paneId is required' });
          return;
        }

        const body = await readJsonBody(req);
        const text = typeof body.text === 'string' ? body.text : '';
        if (!text) {
          sendJson(res, 400, { error: 'text is required' });
          return;
        }

        if (!(await paneExists(paneId, tmuxOptions))) {
          sendJson(res, 404, { error: `Unknown tmux pane id: ${paneId}` });
          return;
        }

        await sendInputToPane(paneId, appendEnter(text), tmuxOptions);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (
        req.method === 'POST' &&
        url.pathname.startsWith('/api/panes/by-id/') &&
        url.pathname.endsWith('/send-text-no-enter')
      ) {
        const encodedPaneId = url.pathname
          .slice('/api/panes/by-id/'.length, -'/send-text-no-enter'.length)
          .replace(/\/+$/, '');
        const paneId = decodeURIComponent(encodedPaneId);
        if (!paneId) {
          sendJson(res, 400, { error: 'paneId is required' });
          return;
        }

        const body = await readJsonBody(req);
        const text = typeof body.text === 'string' ? body.text : '';
        if (!text) {
          sendJson(res, 400, { error: 'text is required' });
          return;
        }

        if (!(await paneExists(paneId, tmuxOptions))) {
          sendJson(res, 404, { error: `Unknown tmux pane id: ${paneId}` });
          return;
        }

        await sendInputToPane(paneId, text, tmuxOptions);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (
        req.method === 'POST' &&
        url.pathname.startsWith('/api/panes/by-id/') &&
        url.pathname.endsWith('/send-keys')
      ) {
        const encodedPaneId = url.pathname
          .slice('/api/panes/by-id/'.length, -'/send-keys'.length)
          .replace(/\/+$/, '');
        const paneId = decodeURIComponent(encodedPaneId);
        if (!paneId) {
          sendJson(res, 400, { error: 'paneId is required' });
          return;
        }

        const body = await readJsonBody(req);
        const keys = normalizeSessionKeys(body);

        if (!(await paneExists(paneId, tmuxOptions))) {
          sendJson(res, 404, { error: `Unknown tmux pane id: ${paneId}` });
          return;
        }

        await sendKeysToPane(paneId, keys, tmuxOptions);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (
        req.method === 'POST' &&
        url.pathname.startsWith('/api/panes/by-id/') &&
        url.pathname.endsWith('/message')
      ) {
        const encodedPaneId = url.pathname
          .slice('/api/panes/by-id/'.length, -'/message'.length)
          .replace(/\/+$/, '');
        const paneId = decodeURIComponent(encodedPaneId);
        if (!paneId) {
          sendJson(res, 400, { error: 'paneId is required' });
          return;
        }

        const body = await readJsonBody(req);
        const sourceBackendName = String(body.fromBackendName || '').trim();
        const sourcePaneId = String(body.fromPaneId || '').trim();
        const text = typeof body.text === 'string' ? body.text : '';
        if (!sourceBackendName) {
          sendJson(res, 400, { error: 'fromBackendName is required' });
          return;
        }
        if (!sourcePaneId) {
          sendJson(res, 400, { error: 'fromPaneId is required' });
          return;
        }
        if (!text) {
          sendJson(res, 400, { error: 'text is required' });
          return;
        }

        if (!(await paneExists(paneId, tmuxOptions))) {
          sendJson(res, 404, { error: `Unknown tmux pane id: ${paneId}` });
          return;
        }

        await sendInputToPane(
          paneId,
          appendEnter(buildSessionMessageText(sourceBackendName, sourcePaneId, text)),
          tmuxOptions,
        );
        sendJson(res, 200, { ok: true });
        return;
      }

      if (
        req.method === 'GET' &&
        url.pathname.startsWith('/api/sessions/by-name/') &&
        url.pathname.endsWith('/read')
      ) {
        const encodedSessionName = url.pathname
          .slice('/api/sessions/by-name/'.length, -'/read'.length)
          .replace(/\/+$/, '');
        const sessionName = decodeURIComponent(encodedSessionName);
        if (!sessionName) {
          sendJson(res, 400, { error: 'sessionName is required' });
          return;
        }

        if (!(await sessionExists(sessionName, tmuxOptions))) {
          sendJson(res, 404, { error: `Unknown tmux session name: ${sessionName}` });
          return;
        }

        const lines = normalizeSessionReadLines(url.searchParams.get('lines'));
        const output = await readPaneOutput(sessionName, lines, tmuxOptions);
        sendJson(res, 200, { sessionName, lines, output });
        return;
      }

      if (
        req.method === 'POST' &&
        url.pathname.startsWith('/api/sessions/by-name/') &&
        url.pathname.endsWith('/send-text')
      ) {
        const encodedSessionName = url.pathname
          .slice('/api/sessions/by-name/'.length, -'/send-text'.length)
          .replace(/\/+$/, '');
        const sessionName = decodeURIComponent(encodedSessionName);
        if (!sessionName) {
          sendJson(res, 400, { error: 'sessionName is required' });
          return;
        }

        const body = await readJsonBody(req);
        const text = typeof body.text === 'string' ? body.text : '';
        if (!text) {
          sendJson(res, 400, { error: 'text is required' });
          return;
        }

        if (!(await sessionExists(sessionName, tmuxOptions))) {
          sendJson(res, 404, { error: `Unknown tmux session name: ${sessionName}` });
          return;
        }

        await sendInput(sessionName, appendEnter(text), tmuxOptions);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (
        req.method === 'POST' &&
        url.pathname.startsWith('/api/sessions/by-name/') &&
        url.pathname.endsWith('/send-text-no-enter')
      ) {
        const encodedSessionName = url.pathname
          .slice('/api/sessions/by-name/'.length, -'/send-text-no-enter'.length)
          .replace(/\/+$/, '');
        const sessionName = decodeURIComponent(encodedSessionName);
        if (!sessionName) {
          sendJson(res, 400, { error: 'sessionName is required' });
          return;
        }

        const body = await readJsonBody(req);
        const text = typeof body.text === 'string' ? body.text : '';
        if (!text) {
          sendJson(res, 400, { error: 'text is required' });
          return;
        }

        if (!(await sessionExists(sessionName, tmuxOptions))) {
          sendJson(res, 404, { error: `Unknown tmux session name: ${sessionName}` });
          return;
        }

        await sendInput(sessionName, text, tmuxOptions);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (
        req.method === 'POST' &&
        url.pathname.startsWith('/api/sessions/by-name/') &&
        url.pathname.endsWith('/send-keys')
      ) {
        const encodedSessionName = url.pathname
          .slice('/api/sessions/by-name/'.length, -'/send-keys'.length)
          .replace(/\/+$/, '');
        const sessionName = decodeURIComponent(encodedSessionName);
        if (!sessionName) {
          sendJson(res, 400, { error: 'sessionName is required' });
          return;
        }

        const body = await readJsonBody(req);
        const keys = normalizeSessionKeys(body);

        if (!(await sessionExists(sessionName, tmuxOptions))) {
          sendJson(res, 404, { error: `Unknown tmux session name: ${sessionName}` });
          return;
        }

        await sendKeys(sessionName, keys, tmuxOptions);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (
        req.method === 'POST' &&
        url.pathname.startsWith('/api/sessions/by-name/') &&
        url.pathname.endsWith('/message')
      ) {
        const encodedSessionName = url.pathname
          .slice('/api/sessions/by-name/'.length, -'/message'.length)
          .replace(/\/+$/, '');
        const sessionName = decodeURIComponent(encodedSessionName);
        if (!sessionName) {
          sendJson(res, 400, { error: 'sessionName is required' });
          return;
        }

        const body = await readJsonBody(req);
        const sourceBackendName = String(body.fromBackendName || '').trim();
        const sourceSessionName = String(body.fromSessionName || '').trim();
        const text = typeof body.text === 'string' ? body.text : '';
        if (!sourceBackendName) {
          sendJson(res, 400, { error: 'fromBackendName is required' });
          return;
        }
        if (!sourceSessionName) {
          sendJson(res, 400, { error: 'fromSessionName is required' });
          return;
        }
        if (!text) {
          sendJson(res, 400, { error: 'text is required' });
          return;
        }

        if (!(await sessionExists(sessionName, tmuxOptions))) {
          sendJson(res, 404, { error: `Unknown tmux session name: ${sessionName}` });
          return;
        }

        await sendInput(
          sessionName,
          appendEnter(buildSessionMessageText(sourceBackendName, sourceSessionName, text)),
          tmuxOptions,
        );
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === 'PUT' && url.pathname.startsWith('/api/sessions/')) {
        const sessionId = url.pathname.slice('/api/sessions/'.length);
        const session = store.getById(sessionId);
        if (!session) {
          sendJson(res, 404, { error: `Unknown session id: ${sessionId}` });
          return;
        }

        const body = await readJsonBody(req);
        const requestedName = String(body.sessionName || '').trim();
        if (!requestedName) {
          sendJson(res, 400, { error: 'sessionName is required' });
          return;
        }

        const renamedSessionName = await renameTmuxSession(
          session.tmuxSessionName,
          requestedName,
          tmuxOptions,
        );
        const next = {
          ...session,
          tmuxSessionName: renamedSessionName,
        };
        store.update(next);
        sendJson(res, 200, { session: next });
        return;
      }

      if (req.method === 'DELETE' && url.pathname.startsWith('/api/sessions/')) {
        const sessionId = url.pathname.slice('/api/sessions/'.length);
        const session = store.getById(sessionId);
        if (!session) {
          sendJson(res, 404, { error: `Unknown session id: ${sessionId}` });
          return;
        }

        if (session.tmuxSessionName !== 'pending') {
          try {
            await stopTmuxSession(session.tmuxSessionName, tmuxOptions);
          } catch (error) {
            logger.warn('Failed to stop tmux session during delete:', error);
          }
        }
        store.remove(session.id);
        sendJson(res, 200, { ok: true });
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (!url.pathname.startsWith('/ws/sessions/')) {
      socket.destroy();
      return;
    }
    if (!isAuthorized(request.headers, config.backendAuthToken)) {
      socket.destroy();
      return;
    }

    const sessionId = url.pathname.slice('/ws/sessions/'.length);
    const session = store.getById(sessionId);
    if (!session) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      let closed = false;
      void (async () => {
        const liveSession = await hydrateSession(session, tmuxOptions, store);
        if (liveSession.status !== 'running') {
          ws.send(JSON.stringify({ type: 'error', message: 'tmux session is not running' }));
          ws.close();
          return;
        }

        const pty = spawnPty(
          'tmux',
          tmuxOptions.socketMode === 'dedicated'
            ? ['-L', tmuxOptions.socketName, '-f', tmuxOptions.configPath, 'attach-session', '-t', liveSession.tmuxSessionName]
            : ['attach-session', '-t', liveSession.tmuxSessionName],
          {
            name: 'xterm-256color',
            cols: 120,
            rows: 36,
            cwd: liveSession.currentPath || liveSession.requestedPath,
            env: {
              ...process.env,
              TERM: 'xterm-256color',
            },
          },
        );

        ws.send(JSON.stringify({ type: 'session', session: liveSession }));

        pty.onData((data) => {
          if (!closed) {
            ws.send(JSON.stringify({ type: 'data', data }));
          }
        });

        pty.onExit(({ exitCode, signal }) => {
          if (!closed) {
            ws.send(JSON.stringify({ type: 'exit', exitCode, signal }));
            ws.close();
          }
        });

        ws.on('message', (raw) => {
          try {
            const message = JSON.parse(String(raw)) as {
              type: string;
              data?: string;
              cols?: number;
              rows?: number;
            };
            if (message.type === 'input' && typeof message.data === 'string') {
              pty.write(message.data);
            } else if (message.type === 'sendText' && typeof message.data === 'string') {
              void sendInput(liveSession.tmuxSessionName, `${message.data}\r`, tmuxOptions);
            } else if (message.type === 'sendKey' && typeof message.data === 'string') {
              const specialKeyMap: Record<string, string> = {
                esc: '\u001b',
                enter: '\r',
                backspace: '\u007f',
                tab: '\t',
                'ctrl-c': '\u0003',
              };
              const payload = specialKeyMap[message.data];
              if (payload) {
                void sendInput(liveSession.tmuxSessionName, payload, tmuxOptions);
              }
            } else if (
              message.type === 'resize' &&
              typeof message.cols === 'number' &&
              typeof message.rows === 'number'
            ) {
              pty.resize(Math.max(20, Math.floor(message.cols)), Math.max(8, Math.floor(message.rows)));
            }
          } catch (error) {
            logger.warn('Ignoring malformed backend websocket message:', error);
          }
        });

        ws.on('close', () => {
          closed = true;
          try {
            pty.kill();
          } catch {}
        });
      })().catch((error) => {
        logger.error('Backend PTY attach error:', error);
        if (!closed) {
          ws.send(
            JSON.stringify({
              type: 'error',
              message: error instanceof Error ? error.message : String(error),
            }),
          );
          ws.close();
        }
      });
    });
  });

  return {
    async start(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.backendPort, config.backendHost, () => resolve());
      });
      await syncDiscoveredSessions(store, tmuxOptions);
      logger.log(`tmux backend listening on ${config.backendHost}:${config.backendPort}`);
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
