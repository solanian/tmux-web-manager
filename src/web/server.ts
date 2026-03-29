import http from 'node:http';
import path from 'node:path';

import WebSocket, { WebSocketServer } from 'ws';

import type { AppConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { BackendRegistryStore } from '../store.js';
import type { AggregatedSessionRecord } from '../types.js';
import { createRelayPaneReadGuard, createRelayReadGuard } from './relay-guard.js';
import { renderHtmlPage } from './page.js';
import {
  aggregateBackendPanes,
  aggregateBackendStates,
  appendJsonLine,
  authHeaders,
  buildRelayAuditRecord,
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
  sortAggregatedSessionsByRecentActivity,
} from './helpers.js';

const logger = createLogger('WEB');

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

export function createWebServer(config: AppConfig, store: BackendRegistryStore) {
  const relayLogPath = path.join(config.centralDataDir, 'relay-log.jsonl');
  const relayReadGuard = createRelayReadGuard();
  const relayPaneReadGuard = createRelayPaneReadGuard();
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(renderHtmlPage());
        return;
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
          const relayRequest = normalizeRelayPaneSendTextRequest(body);
          relayPaneReadGuard.requireRecentRead(relayRequest);
          const targetBackend = await resolveTargetBackendOrThrow(store, relayRequest.targetBackendName);
          const payload = await fetchJson<{ ok: true }>(
            targetBackend,
            `/api/panes/by-id/${encodeURIComponent(relayRequest.targetPaneId)}/send-text`,
            {
              method: 'POST',
              body: JSON.stringify({ text: relayRequest.text }),
            },
          );
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'pane-send-text',
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
              operation: 'pane-send-text',
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

      if (req.method === 'POST' && url.pathname === '/api/relay/panes/send-text-no-enter') {
        const body = await readJsonBody(req);
        try {
          const relayRequest = normalizeRelayPaneSendTextRequest(body);
          relayPaneReadGuard.requireRecentRead(relayRequest);
          const targetBackend = await resolveTargetBackendOrThrow(store, relayRequest.targetBackendName);
          const payload = await fetchJson<{ ok: true }>(
            targetBackend,
            `/api/panes/by-id/${encodeURIComponent(relayRequest.targetPaneId)}/send-text-no-enter`,
            {
              method: 'POST',
              body: JSON.stringify({ text: relayRequest.text }),
            },
          );
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'pane-send-text-no-enter',
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
              operation: 'pane-send-text-no-enter',
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

      if (req.method === 'POST' && url.pathname === '/api/relay/panes/send-keys') {
        const body = await readJsonBody(req);
        try {
          const relayRequest = normalizeRelayPaneKeysRequest(body);
          relayPaneReadGuard.requireRecentRead(relayRequest);
          const targetBackend = await resolveTargetBackendOrThrow(store, relayRequest.targetBackendName);
          const payload = await fetchJson<{ ok: true }>(
            targetBackend,
            `/api/panes/by-id/${encodeURIComponent(relayRequest.targetPaneId)}/send-keys`,
            {
              method: 'POST',
              body: JSON.stringify({ keys: relayRequest.keys }),
            },
          );
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'pane-send-keys',
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
              operation: 'pane-send-keys',
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

      if (req.method === 'POST' && url.pathname === '/api/relay/panes/message') {
        const body = await readJsonBody(req);
        try {
          const relayRequest = normalizeRelayPaneSendTextRequest(body);
          relayPaneReadGuard.requireRecentRead(relayRequest);
          const targetBackend = await resolveTargetBackendOrThrow(store, relayRequest.targetBackendName);
          const payload = await fetchJson<{ ok: true }>(
            targetBackend,
            `/api/panes/by-id/${encodeURIComponent(relayRequest.targetPaneId)}/message`,
            {
              method: 'POST',
              body: JSON.stringify({
                fromBackendName: relayRequest.sourceBackendName,
                fromPaneId: relayRequest.sourcePaneId,
                text: relayRequest.text,
              }),
            },
          );
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'pane-message',
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
              operation: 'pane-message',
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

      if (req.method === 'POST' && url.pathname === '/api/relay/panes/read') {
        const body = await readJsonBody(req);
        try {
          const relayRequest = normalizeRelayPaneReadRequest(body);
          const targetBackend = await resolveTargetBackendOrThrow(store, relayRequest.targetBackendName);
          const search = relayRequest.lines ? `?lines=${encodeURIComponent(String(relayRequest.lines))}` : '';
          const payload = await fetchJson<{ paneId: string; lines: number; output: string }>(
            targetBackend,
            `/api/panes/by-id/${encodeURIComponent(relayRequest.targetPaneId)}/read${search}`,
          );
          appendJsonLine(
            relayLogPath,
            buildRelayAuditRecord(body, {
              operation: 'pane-read',
              result: 'ok',
              targetBackend,
            }),
          );
          relayPaneReadGuard.markRead(relayRequest);
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
          if (/^Unknown backend name: /.test(message)) {
            sendJson(res, 404, { error: message });
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
