import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildOrchestrationPaneSummary,
  buildRelayAuditRecord,
  buildSessionPathSummary,
  createWebServer,
  findSessionNameById,
  formatRelativeTime,
  normalizeRelayKeysRequest,
  normalizeRelayMessageRequest,
  normalizeRelayPaneKeysRequest,
  normalizeRelayPaneReadRequest,
  normalizeRelayPaneSendTextRequest,
  normalizeRelayReadRequest,
  normalizeRelaySendTextRequest,
  renderHtmlPage,
  sortAggregatedPanesForOrchestration,
  sortAggregatedSessionsByRecentActivity,
} from '../src/web.js';
import {
  buildRelayGuardKey,
  buildRelayPaneGuardKey,
  createRelayPaneReadGuard,
  createRelayReadGuard,
} from '../src/web/relay-guard.js';
import { BackendRegistryStore } from '../src/store.js';

describe('buildSessionPathSummary', () => {
  it('omits duplicated cwd text when requestedPath and currentPath are the same', () => {
    expect(
      buildSessionPathSummary({
        requestedPath: '/workspace/app',
        currentPath: '/workspace/app',
      }),
    ).toBe('/workspace/app');
  });

  it('includes cwd only when it differs from the requested path', () => {
    expect(
      buildSessionPathSummary({
        requestedPath: '/workspace/app',
        currentPath: '/workspace/app/packages/web',
      }),
    ).toBe('/workspace/app · cwd /workspace/app/packages/web');
  });
});

describe('formatRelativeTime', () => {
  it('formats relative times in compact ago form', () => {
    expect(formatRelativeTime('2026-03-28T00:59:30.000Z', Date.parse('2026-03-28T01:00:00.000Z'))).toBe('30s ago');
    expect(formatRelativeTime('2026-03-28T00:00:00.000Z', Date.parse('2026-03-28T01:00:00.000Z'))).toBe('1h ago');
  });
});

describe('sortAggregatedSessionsByRecentActivity', () => {
  it('sorts sessions by recent activity descending', () => {
    const sessions = sortAggregatedSessionsByRecentActivity([
      {
        id: '1',
        tmuxSessionName: 'older',
        requestedPath: '/workspace/older',
        currentPath: '/workspace/older',
        status: 'running',
        createdAt: '2026-03-28T00:00:00.000Z',
        lastActivityAt: '2026-03-28T00:05:00.000Z',
        backendId: 'a',
        backendName: 'backend-a',
        backendBaseUrl: 'http://a',
      },
      {
        id: '2',
        tmuxSessionName: 'newer',
        requestedPath: '/workspace/newer',
        currentPath: '/workspace/newer',
        status: 'running',
        createdAt: '2026-03-28T00:00:00.000Z',
        lastActivityAt: '2026-03-28T00:10:00.000Z',
        backendId: 'a',
        backendName: 'backend-a',
        backendBaseUrl: 'http://a',
      },
    ]);

    expect(sessions.map((session) => session.tmuxSessionName)).toEqual(['newer', 'older']);
  });
});

describe('orchestration pane helpers', () => {
  it('sorts panes in a stable backend/session/window/pane order', () => {
    const panes = sortAggregatedPanesForOrchestration([
      {
        backendId: 'b',
        backendName: 'server-b',
        backendBaseUrl: 'http://b',
        paneId: '%3',
        sessionName: 'ops',
        windowIndex: 1,
        paneIndex: 0,
        currentPath: '/workspace/ops',
        currentCommand: 'bash',
        title: '',
        label: '',
      },
      {
        backendId: 'a',
        backendName: 'server-a',
        backendBaseUrl: 'http://a',
        paneId: '%1',
        sessionName: 'build',
        windowIndex: 0,
        paneIndex: 1,
        currentPath: '/workspace/build',
        currentCommand: 'bash',
        title: '',
        label: '',
      },
      {
        backendId: 'a',
        backendName: 'server-a',
        backendBaseUrl: 'http://a',
        paneId: '%2',
        sessionName: 'build',
        windowIndex: 0,
        paneIndex: 0,
        currentPath: '/workspace/build',
        currentCommand: 'bash',
        title: '',
        label: '',
      },
    ]);

    expect(panes.map((pane) => pane.paneId)).toEqual(['%2', '%1', '%3']);
  });

  it('builds an agent-friendly pane summary', () => {
    expect(
      buildOrchestrationPaneSummary({
        backendId: 'b',
        backendName: 'server-b',
        backendBaseUrl: 'http://b',
        paneId: '%3',
        sessionName: 'ops',
        windowIndex: 1,
        paneIndex: 0,
        currentPath: '/workspace/ops',
        currentCommand: 'bash',
        title: '',
        label: 'reviewer',
        lastActivityAt: '2026-03-29T00:00:00.000Z',
      }),
    ).toEqual({
      targetId: 'server-b/%3',
      backendName: 'server-b',
      paneId: '%3',
      sessionName: 'ops',
      location: 'ops:1.0',
      label: 'reviewer',
      currentCommand: 'bash',
      currentPath: '/workspace/ops',
      lastActivityAt: '2026-03-29T00:00:00.000Z',
    });
  });
});

describe('findSessionNameById', () => {
  it('returns the tmux session name for a matching source session id', () => {
    expect(
      findSessionNameById(
        [
          { id: 'source-1', tmuxSessionName: 'alpha' },
          { id: 'source-2', tmuxSessionName: 'beta' },
        ],
        'source-2',
      ),
    ).toBe('beta');
  });
});

describe('normalizeRelaySendTextRequest', () => {
  it('normalizes a relay send-text request body', () => {
    expect(
      normalizeRelaySendTextRequest({
        sourceBackendName: 'server-a',
        sourceSessionName: 'source-session-name',
        targetBackendName: 'server-b',
        targetSessionName: 'session-b',
        text: 'echo test',
      }),
    ).toEqual({
      sourceBackendName: 'server-a',
      sourceSessionName: 'source-session-name',
      targetBackendName: 'server-b',
      targetSessionName: 'session-b',
      text: 'echo test',
    });
  });

  it('rejects missing target backend id', () => {
    expect(() =>
      normalizeRelaySendTextRequest({
        sourceBackendName: 'server-a',
        sourceSessionName: 'source-session-name',
        targetSessionName: 'session-b',
        text: 'echo test',
      }),
    ).toThrow(/targetBackendName is required/);
  });

  it('rejects missing source backend name', () => {
    expect(() =>
      normalizeRelaySendTextRequest({
        sourceSessionName: 'source-session-name',
        targetBackendName: 'server-b',
        targetSessionName: 'session-b',
        text: 'echo test',
      }),
    ).toThrow(/sourceBackendName is required/);
  });
});

describe('relay request normalizers', () => {
  it('normalizes relay keys requests', () => {
    expect(
      normalizeRelayKeysRequest({
        sourceBackendName: 'server-a',
        sourceSessionName: 'build',
        targetBackendName: 'server-b',
        targetSessionName: 'ops',
        keys: [' Enter ', 'C-c'],
      }),
    ).toEqual({
      sourceBackendName: 'server-a',
      sourceSessionName: 'build',
      targetBackendName: 'server-b',
      targetSessionName: 'ops',
      keys: ['Enter', 'C-c'],
    });
  });

  it('normalizes relay read requests', () => {
    expect(
      normalizeRelayReadRequest({
        sourceBackendName: 'server-a',
        sourceSessionName: 'build',
        targetBackendName: 'server-b',
        targetSessionName: 'ops',
        lines: '25',
      }),
    ).toEqual({
      sourceBackendName: 'server-a',
      sourceSessionName: 'build',
      targetBackendName: 'server-b',
      targetSessionName: 'ops',
      lines: 25,
    });
  });

  it('normalizes relay message requests', () => {
    expect(
      normalizeRelayMessageRequest({
        sourceBackendName: 'server-a',
        sourceSessionName: 'build',
        targetBackendName: 'server-b',
        targetSessionName: 'ops',
        text: 'hello',
      }),
    ).toEqual({
      sourceBackendName: 'server-a',
      sourceSessionName: 'build',
      targetBackendName: 'server-b',
      targetSessionName: 'ops',
      text: 'hello',
    });
  });

  it('normalizes pane relay send-text requests', () => {
    expect(
      normalizeRelayPaneSendTextRequest({
        sourceBackendName: 'server-a',
        sourcePaneId: '%1',
        targetBackendName: 'server-b',
        targetPaneId: '%2',
        text: 'hello',
      }),
    ).toEqual({
      sourceBackendName: 'server-a',
      sourcePaneId: '%1',
      targetBackendName: 'server-b',
      targetPaneId: '%2',
      text: 'hello',
    });
  });

  it('normalizes pane relay keys requests', () => {
    expect(
      normalizeRelayPaneKeysRequest({
        sourceBackendName: 'server-a',
        sourcePaneId: '%1',
        targetBackendName: 'server-b',
        targetPaneId: '%2',
        keys: [' Enter ', 'C-c'],
      }),
    ).toEqual({
      sourceBackendName: 'server-a',
      sourcePaneId: '%1',
      targetBackendName: 'server-b',
      targetPaneId: '%2',
      keys: ['Enter', 'C-c'],
    });
  });

  it('normalizes pane relay read requests', () => {
    expect(
      normalizeRelayPaneReadRequest({
        sourceBackendName: 'server-a',
        sourcePaneId: '%1',
        targetBackendName: 'server-b',
        targetPaneId: '%2',
        lines: '25',
      }),
    ).toEqual({
      sourceBackendName: 'server-a',
      sourcePaneId: '%1',
      targetBackendName: 'server-b',
      targetPaneId: '%2',
      lines: 25,
    });
  });
});

describe('buildRelayAuditRecord', () => {
  it('records successful relay attempts with result metadata', () => {
    expect(
      buildRelayAuditRecord(
        {
          sourceBackendName: 'server-a',
          sourceSessionName: 'build',
          targetBackendName: 'server-b',
          targetSessionName: 'ops',
          text: 'echo ok',
        },
        {
          operation: 'send-text',
          result: 'ok',
          timestamp: '2026-03-29T00:00:00.000Z',
          targetBackend: {
            id: 'backend-1',
            name: 'server-b',
            baseUrl: 'http://server-b',
            authToken: 'secret',
            createdAt: '2026-03-29T00:00:00.000Z',
            updatedAt: '2026-03-29T00:00:00.000Z',
          },
        },
      ),
    ).toEqual({
      timestamp: '2026-03-29T00:00:00.000Z',
      operation: 'send-text',
      sourceBackendName: 'server-a',
      sourceSessionName: 'build',
      targetBackendName: 'server-b',
      targetSessionName: 'ops',
      text: 'echo ok',
      result: 'ok',
      targetBackendId: 'backend-1',
    });
  });

  it('records failed relay attempts with error metadata', () => {
    expect(
      buildRelayAuditRecord(
        {
          sourceBackendName: 'server-a',
          sourceSessionName: 'build',
          targetBackendName: 'server-b',
          targetSessionName: 'ops',
          text: 'echo fail',
        },
        {
          operation: 'send-text',
          result: 'error',
          error: 'HTTP 500 from http://server-b/api/sessions',
          timestamp: '2026-03-29T00:00:00.000Z',
        },
      ),
    ).toEqual({
      timestamp: '2026-03-29T00:00:00.000Z',
      operation: 'send-text',
      sourceBackendName: 'server-a',
      sourceSessionName: 'build',
      targetBackendName: 'server-b',
      targetSessionName: 'ops',
      text: 'echo fail',
      result: 'error',
      error: 'HTTP 500 from http://server-b/api/sessions',
    });
  });
});

describe('relay read guard', () => {
  it('builds a stable key for a source/target pair', () => {
    expect(
      buildRelayGuardKey({
        sourceBackendName: 'server-a',
        sourceSessionName: 'build',
        targetBackendName: 'server-b',
        targetSessionName: 'ops',
      }),
    ).toBe('server-a\u0000build\u0000server-b\u0000ops');
  });

  it('requires a recent read before writes', () => {
    const guard = createRelayReadGuard(1000);
    const request = {
      sourceBackendName: 'server-a',
      sourceSessionName: 'build',
      targetBackendName: 'server-b',
      targetSessionName: 'ops',
    };

    expect(() => guard.requireRecentRead(request, 1000)).toThrow(/Recent read required/);

    guard.markRead(request, 1000);
    expect(() => guard.requireRecentRead(request, 1500)).not.toThrow();
    expect(() => guard.requireRecentRead(request, 2501)).toThrow(/Recent read required/);
  });

  it('requires a recent pane read before pane writes', () => {
    const guard = createRelayPaneReadGuard(1000);
    const request = {
      sourceBackendName: 'server-a',
      sourcePaneId: '%1',
      targetBackendName: 'server-b',
      targetPaneId: '%2',
    };

    expect(buildRelayPaneGuardKey(request)).toBe('server-a\u0000%1\u0000server-b\u0000%2');
    expect(() => guard.requireRecentRead(request, 1000)).toThrow(/Recent read required/);

    guard.markRead(request, 1000);
    expect(() => guard.requireRecentRead(request, 1500)).not.toThrow();
    expect(() => guard.requireRecentRead(request, 2501)).toThrow(/Recent read required/);
  });
});

describe('renderHtmlPage', () => {
  it('renders mobile sidebar controls, tabs, modals, and compact list markup', () => {
    const html = renderHtmlPage();

    expect(html).toContain('id="sidebarToggle"');
    expect(html).toContain('id="tabServers"');
    expect(html).toContain('id="tabSessions"');
    expect(html).toContain('id="backendModal"');
    expect(html).toContain('id="sessionModal"');
    expect(html).toContain('id="confirmModal"');
    expect(html).toContain('id="sessionEditingId"');
    expect(html).toContain('id="sessionEditingBackendId"');
    expect(html).toContain('id="backendFormError"');
    expect(html).toContain('id="sessionFormError"');
    expect(html).toContain('Agent Token');
    expect(html).toContain('paste the token from the agent host');
    expect(html).toContain('$DATA_DIR/backend/agent-auth-token');
    expect(html).toContain('type="password"');
    expect(html).toContain('id="openBackendCreate"');
    expect(html).toContain('id="openSessionCreate"');
    expect(html).toContain('class="list cmuxList listScroll"');
    expect(html).toContain('.cmuxBadgeRow');
    expect(html).toContain('.cmuxItem:hover');
    expect(html).toContain('.item.active .cmuxPrimary');
    expect(html).toContain('body[data-sidebar-open="false"] #app');
    expect(html).toContain('body[data-sidebar-open="false"] #sidebar');
    expect(html).toContain('body[data-sidebar-open="true"] #sidebarToggle');
    expect(html).toContain('body[data-sidebar-open="false"] #sidebarClose');
    expect(html).toContain('#sidebar { display: flex; flex-direction: column; overflow: hidden;');
    expect(html).toContain('class="list cmuxList listScroll"');
    expect(html).toContain('.tabPanel { display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; overflow: hidden; }');
    expect(html).toContain('.sidebarScrollSection { display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; margin-bottom: 0; }');
    expect(html).toContain('.listScroll { display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; overflow-x: hidden; overflow-y: auto;');
    expect(html).toContain("item.addEventListener('click', () => openTerminal(session))");
    expect(html).toContain('renderSessions();');
    expect(html).toContain('state.sidebarOpen = !isMobileLayout();');
    expect(html).toContain('setSidebarOpen(!state.sidebarOpen);');
    expect(html).toContain('function formatRelativeTime(input)');
    expect(html).toContain('function buildSessionPathSummary(session)');
    expect(html).toContain('function protectSensitiveInput(input)');
    expect(html).toContain("protectSensitiveInput(backendAuthTokenInput);");
    expect(html).toContain("backendFormError.hidden = false;");
    expect(html).toContain("sessionFormError.hidden = false;");
    expect(html).toContain('id="hoverTooltip"');
    expect(html).toContain('function attachHoverTooltip(element, text)');
    expect(html).toContain('attachHoverTooltip(tertiary, fullPathSummary);');
    expect(html).toContain('min-height: 100dvh;');
    expect(html).toContain('height: 100dvh;');
    expect(html).toContain('#main { display: grid; grid-template-rows: auto minmax(0, 1fr) auto;');
    expect(html).toContain('#terminalShell { display: flex; min-height: 0; padding: 8px 8px 0; overflow: hidden; }');
    expect(html).toContain('#composer { display: none; position: relative; flex-direction: column;');
    expect(html).toContain('#composer { display: flex; }');
    expect(html).toContain('scrollbar-width: thin;');
    expect(html).toContain('::-webkit-scrollbar');
    expect(html).toContain('id="fontSizeDecrease"');
    expect(html).toContain('id="fontSizeIncrease"');
    expect(html).toContain('id="logoutButton"');
    expect(html).toContain('id="authScreen"');
    expect(html).toContain('window.__TWM_AUTH_ENABLED__');
    expect(html).toContain("body[data-sidebar-open=\"true\"] #sidebar");
  });
});

describe('createWebServer', () => {
  it('is constructible with the backend registry store', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twm-web-construct-'));
    const store = new BackendRegistryStore(root);
    const server = createWebServer(
      {
        mode: 'main',
        host: '127.0.0.1',
        port: 8787,
        baseUrl: 'http://localhost:8787',
        dataDir: root,
        centralDataDir: path.join(root, 'central'),
        backendDataDir: path.join(root, 'backend'),
        allowedRoots: ['/tmp'],
        backendHost: '127.0.0.1',
        backendPort: 8788,
        backendPublicUrl: 'http://127.0.0.1:8788',
        backendName: 'local',
        backendAuthToken: '',
        hubAuthUsername: 'admin',
        hubAuthPassword: 'secret-password',
        hubApiToken: 'hub-api-token',
        hubSessionSecret: 'hub-session-secret',
        hubSessionTtlMs: 60_000,
        hubSecureCookies: false,
        tmuxSocketMode: 'default',
        tmuxSocketName: 'tfw',
        sessionPrefix: 'tfw',
        ohMyTmuxConfigPath: '/opt/oh-my-tmux/.tmux.conf',
      },
      store,
    );

    expect(server).toHaveProperty('start');
    expect(server).toHaveProperty('stop');
  });


  it('protects hub APIs behind auth sessions when configured', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twm-web-auth-'));
    const hubPort = await getFreePort();
    const server = createWebServer({
      ...buildTestConfig(root, hubPort),
      hubAuthUsername: '',
      hubAuthPassword: '',
      hubApiToken: 'hub-api-token',
      hubSessionSecret: 'hub-session-secret',
      hubSessionTtlMs: 60_000,
      hubSecureCookies: false,
    }, new BackendRegistryStore(root));
    await server.start();

    try {
      let response = await fetch(`http://127.0.0.1:${hubPort}/api/state`);
      expect(response.status).toBe(401);

      response = await fetch(`http://127.0.0.1:${hubPort}/api/auth/session`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        authEnabled: true,
        authenticated: false,
      });

      response = await fetch(`http://127.0.0.1:${hubPort}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
      });
      expect(response.status).toBe(401);

      response = await fetch(`http://127.0.0.1:${hubPort}/api/auth/setup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'secret-password', passwordConfirm: 'secret-password' }),
      });
      expect(response.status).toBe(201);
      const setupPayload = await response.json();
      const cookie = response.headers.get('set-cookie') || '';
      const sessionCookie = cookie.split(';', 1)[0] || cookie;
      expect(cookie).toContain('twm_session=');
      expect(setupPayload.csrfToken).toBeTruthy();

      response = await fetch(`http://127.0.0.1:${hubPort}/api/state`, {
        headers: { cookie: sessionCookie },
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ backends: [], sessions: [] });

      response = await fetch(`http://127.0.0.1:${hubPort}/api/auth/logout`, {
        method: 'POST',
        headers: { cookie: sessionCookie },
      });
      expect(response.status).toBe(403);

    } finally {
      await server.stop();
    }
  });


  it('rejects session-authenticated writes without a matching origin and csrf token', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twm-web-csrf-'));
    const hubPort = await getFreePort();
    const store = new BackendRegistryStore(root);
    const server = createWebServer({
      ...buildTestConfig(root, hubPort),
      hubAuthUsername: '',
      hubAuthPassword: '',
      hubApiToken: 'hub-api-token',
      hubSessionSecret: 'hub-session-secret',
      hubSessionTtlMs: 60_000,
      hubSecureCookies: false,
    }, store);
    await server.start();

    try {
      const setup = await fetch(`http://127.0.0.1:${hubPort}/api/auth/setup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'secret-password', passwordConfirm: 'secret-password' }),
      });
      const setupPayload = await setup.json();
      const cookie = setup.headers.get('set-cookie') || '';
      const sessionCookie = cookie.split(';', 1)[0] || cookie;

      let response = await fetch(`http://127.0.0.1:${hubPort}/api/backends`, {
        method: 'POST',
        headers: { cookie: sessionCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'x', baseUrl: 'http://127.0.0.1:9999', authToken: 'a' }),
      });
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: 'Invalid origin' });

      response = await fetch(`http://127.0.0.1:${hubPort}/api/backends`, {
        method: 'POST',
        headers: { cookie: sessionCookie, origin: `http://127.0.0.1:${hubPort}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'x', baseUrl: 'http://127.0.0.1:9999', authToken: 'a' }),
      });
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: 'Invalid CSRF token' });

    } finally {
      await server.stop();
    }
  });



  it('rate-limits repeated failed login attempts and records auth audit logs', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twm-web-auth-rate-'));
    const hubPort = await getFreePort();
    const server = createWebServer({
      ...buildTestConfig(root, hubPort),
      hubAuthUsername: '',
      hubAuthPassword: '',
      hubApiToken: 'hub-api-token',
      hubSessionSecret: 'hub-session-secret',
      hubSessionTtlMs: 60_000,
      hubSecureCookies: false,
    }, new BackendRegistryStore(root));
    await server.start();

    try {
      let response = await fetch(`http://127.0.0.1:${hubPort}/api/auth/setup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'secret-password', passwordConfirm: 'secret-password' }),
      });
      expect(response.status).toBe(201);

      for (let index = 0; index < 5; index += 1) {
        response = await fetch(`http://127.0.0.1:${hubPort}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
        });
        expect(response.status).toBe(401);
      }

      response = await fetch(`http://127.0.0.1:${hubPort}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
      });
      expect(response.status).toBe(429);

      const logLines = fs
        .readFileSync(path.join(root, 'central', 'auth-log.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(logLines.map((entry) => entry.event)).toContain('auth-setup');
      expect(logLines.map((entry) => entry.event)).toContain('auth-login');
      expect(logLines.map((entry) => entry.event)).toContain('auth-rate-limit');
      expect(logLines.at(-1)).toMatchObject({ event: 'auth-rate-limit', result: 'error' });
    } finally {
      await server.stop();
    }
  });

  it('reuses persisted hub credentials after restart instead of re-entering onboarding', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twm-web-auth-persist-'));
    const firstPort = await getFreePort();
    const secondPort = await getFreePort();

    const firstServer = createWebServer({
      ...buildTestConfig(root, firstPort),
      hubAuthUsername: '',
      hubAuthPassword: '',
      hubApiToken: 'hub-api-token',
      hubSessionSecret: 'hub-session-secret',
      hubSessionTtlMs: 60_000,
      hubSecureCookies: false,
    }, new BackendRegistryStore(root));
    await firstServer.start();

    try {
      const setup = await fetch(`http://127.0.0.1:${firstPort}/api/auth/setup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'secret-password', passwordConfirm: 'secret-password' }),
      });
      expect(setup.status).toBe(201);
    } finally {
      await firstServer.stop();
    }

    const secondServer = createWebServer({
      ...buildTestConfig(root, secondPort),
      hubAuthUsername: '',
      hubAuthPassword: '',
      hubApiToken: 'hub-api-token',
      hubSessionSecret: 'hub-session-secret',
      hubSessionTtlMs: 60_000,
      hubSecureCookies: false,
    }, new BackendRegistryStore(root));
    await secondServer.start();

    try {
      let response = await fetch(`http://127.0.0.1:${secondPort}/api/auth/session`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        authEnabled: true,
        authenticated: false,
        onboardingRequired: false,
        configuredUsername: 'admin',
      });

      response = await fetch(`http://127.0.0.1:${secondPort}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'secret-password' }),
      });
      expect(response.status).toBe(200);
    } finally {
      await secondServer.stop();
    }
  });

  it('allows hub API token access for CLI workflows', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twm-web-auth-token-'));
    const hubPort = await getFreePort();
    const server = createWebServer({
      ...buildTestConfig(root, hubPort),
      hubAuthPassword: 'secret-password',
      hubApiToken: 'hub-api-token',
      hubSessionSecret: 'hub-session-secret',
    }, new BackendRegistryStore(root));
    await server.start();

    try {
      const response = await fetch(`http://127.0.0.1:${hubPort}/api/state`, {
        headers: hubAuthHeaders(),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ backends: [], sessions: [] });
    } finally {
      await server.stop();
    }
  });

  it('logs successful relay attempts with ok result', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twm-web-relay-ok-'));
    const targetPort = await getFreePort();
    const hubPort = await getFreePort();
    const targetServer = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/sessions/by-name/ops/send-text') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/sessions/by-name/ops/read?lines=50') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ sessionName: 'ops', lines: 50, output: 'ready' }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/sessions') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ sessions: [] }));
        return;
      }
      res.writeHead(404).end();
    });
    await listen(targetServer, targetPort);

    const store = new BackendRegistryStore(root);
    store.save({
      name: 'server-b',
      baseUrl: `http://127.0.0.1:${targetPort}`,
      authToken: '',
    });
    const server = createWebServer(
      {
        mode: 'main',
        host: '127.0.0.1',
        port: hubPort,
        baseUrl: `http://127.0.0.1:${hubPort}`,
        dataDir: root,
        centralDataDir: path.join(root, 'central'),
        backendDataDir: path.join(root, 'backend'),
        allowedRoots: [root],
        backendHost: '127.0.0.1',
        backendPort: 8788,
        backendPublicUrl: 'http://127.0.0.1:8788',
        backendName: 'local',
        backendAuthToken: '',
        hubAuthUsername: 'admin',
        hubAuthPassword: 'secret-password',
        hubApiToken: 'hub-api-token',
        hubSessionSecret: 'hub-session-secret',
        hubSessionTtlMs: 60_000,
        hubSecureCookies: false,
        tmuxSocketMode: 'default',
        tmuxSocketName: 'tfw',
        sessionPrefix: 'tfw',
        ohMyTmuxConfigPath: '/opt/oh-my-tmux/.tmux.conf',
        backendAuthTokenPath: path.join(root, 'token'),
      },
      store,
    );
    await server.start();

    try {
      const readResponse = await fetch(`http://127.0.0.1:${hubPort}/api/relay/read`, {
        method: 'POST',
        headers: hubAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          sourceBackendName: 'server-a',
          sourceSessionName: 'build',
          targetBackendName: 'server-b',
          targetSessionName: 'ops',
          lines: 50,
        }),
      });
      expect(readResponse.status).toBe(200);

      const response = await fetch(`http://127.0.0.1:${hubPort}/api/relay/send-text`, {
        method: 'POST',
        headers: hubAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          sourceBackendName: 'server-a',
          sourceSessionName: 'build',
          targetBackendName: 'server-b',
          targetSessionName: 'ops',
          text: 'echo ok',
        }),
      });

      expect(response.status).toBe(200);

      const logLines = fs
        .readFileSync(path.join(root, 'central', 'relay-log.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(logLines.at(-1)).toMatchObject({
        operation: 'send-text',
        sourceBackendName: 'server-a',
        sourceSessionName: 'build',
        targetBackendName: 'server-b',
        targetSessionName: 'ops',
        text: 'echo ok',
        result: 'ok',
      });
    } finally {
      await server.stop();
      await closeServer(targetServer);
    }
  });

  it('logs failed relay attempts with error result', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twm-web-relay-error-'));
    const targetPort = await getFreePort();
    const hubPort = await getFreePort();
    const targetServer = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/sessions/by-name/ops/send-text') {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'boom' }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/sessions/by-name/ops/read?lines=50') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ sessionName: 'ops', lines: 50, output: 'ready' }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/sessions') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ sessions: [] }));
        return;
      }
      res.writeHead(404).end();
    });
    await listen(targetServer, targetPort);

    const store = new BackendRegistryStore(root);
    store.save({
      name: 'server-b',
      baseUrl: `http://127.0.0.1:${targetPort}`,
      authToken: '',
    });
    const server = createWebServer(
      {
        mode: 'main',
        host: '127.0.0.1',
        port: hubPort,
        baseUrl: `http://127.0.0.1:${hubPort}`,
        dataDir: root,
        centralDataDir: path.join(root, 'central'),
        backendDataDir: path.join(root, 'backend'),
        allowedRoots: [root],
        backendHost: '127.0.0.1',
        backendPort: 8788,
        backendPublicUrl: 'http://127.0.0.1:8788',
        backendName: 'local',
        backendAuthToken: '',
        hubAuthUsername: 'admin',
        hubAuthPassword: 'secret-password',
        hubApiToken: 'hub-api-token',
        hubSessionSecret: 'hub-session-secret',
        hubSessionTtlMs: 60_000,
        hubSecureCookies: false,
        tmuxSocketMode: 'default',
        tmuxSocketName: 'tfw',
        sessionPrefix: 'tfw',
        ohMyTmuxConfigPath: '/opt/oh-my-tmux/.tmux.conf',
        backendAuthTokenPath: path.join(root, 'token'),
      },
      store,
    );
    await server.start();

    try {
      const readResponse = await fetch(`http://127.0.0.1:${hubPort}/api/relay/read`, {
        method: 'POST',
        headers: hubAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          sourceBackendName: 'server-a',
          sourceSessionName: 'build',
          targetBackendName: 'server-b',
          targetSessionName: 'ops',
          lines: 50,
        }),
      });
      expect(readResponse.status).toBe(200);

      const response = await fetch(`http://127.0.0.1:${hubPort}/api/relay/send-text`, {
        method: 'POST',
        headers: hubAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          sourceBackendName: 'server-a',
          sourceSessionName: 'build',
          targetBackendName: 'server-b',
          targetSessionName: 'ops',
          text: 'echo fail',
        }),
      });

      expect(response.status).toBe(500);

      const logLines = fs
        .readFileSync(path.join(root, 'central', 'relay-log.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(logLines.at(-1)).toMatchObject({
        operation: 'send-text',
        sourceBackendName: 'server-a',
        sourceSessionName: 'build',
        targetBackendName: 'server-b',
        targetSessionName: 'ops',
        text: 'echo fail',
        result: 'error',
      });
      expect(logLines.at(-1)?.error).toMatch(/HTTP 500/);
    } finally {
      await server.stop();
      await closeServer(targetServer);
    }
  });

  it('rejects relay writes when no recent read exists', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twm-web-relay-guard-'));
    const targetPort = await getFreePort();
    const hubPort = await getFreePort();
    const targetServer = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/api/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/sessions') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ sessions: [] }));
        return;
      }
      res.writeHead(404).end();
    });
    await listen(targetServer, targetPort);

    const store = new BackendRegistryStore(root);
    store.save({
      name: 'server-b',
      baseUrl: `http://127.0.0.1:${targetPort}`,
      authToken: '',
    });
    const server = createWebServer(buildTestConfig(root, hubPort), store);
    await server.start();

    try {
      const response = await fetch(`http://127.0.0.1:${hubPort}/api/relay/send-text`, {
        method: 'POST',
        headers: hubAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          sourceBackendName: 'server-a',
          sourceSessionName: 'build',
          targetBackendName: 'server-b',
          targetSessionName: 'ops',
          text: 'echo blocked',
        }),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringMatching(/Recent read required/),
      });
    } finally {
      await server.stop();
      await closeServer(targetServer);
    }
  });

  it('relays send-text-no-enter, send-keys, message, and read operations', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twm-web-relay-ops-'));
    const targetPort = await getFreePort();
    const hubPort = await getFreePort();
    const requests: Array<{ method: string; url: string; body: unknown }> = [];
    const targetServer = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      const rawBody = Buffer.concat(chunks).toString('utf8');
      requests.push({
        method: req.method || '',
        url: req.url || '',
        body: rawBody ? JSON.parse(rawBody) : null,
      });

      if (req.method === 'POST' && req.url === '/api/sessions/by-name/ops/send-text-no-enter') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/sessions/by-name/ops/send-keys') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/sessions/by-name/ops/message') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/sessions/by-name/ops/read?lines=25') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ sessionName: 'ops', lines: 25, output: 'hello' }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/sessions') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ sessions: [] }));
        return;
      }
      res.writeHead(404).end();
    });
    await listen(targetServer, targetPort);

    const store = new BackendRegistryStore(root);
    store.save({
      name: 'server-b',
      baseUrl: `http://127.0.0.1:${targetPort}`,
      authToken: '',
    });
    const server = createWebServer(buildTestConfig(root, hubPort), store);
    await server.start();

    try {
      let response = await fetch(`http://127.0.0.1:${hubPort}/api/relay/read`, {
        method: 'POST',
        headers: hubAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          sourceBackendName: 'server-a',
          sourceSessionName: 'build',
          targetBackendName: 'server-b',
          targetSessionName: 'ops',
          lines: 25,
        }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        sessionName: 'ops',
        lines: 25,
        output: 'hello',
      });

      response = await fetch(`http://127.0.0.1:${hubPort}/api/relay/send-text-no-enter`, {
        method: 'POST',
        headers: hubAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          sourceBackendName: 'server-a',
          sourceSessionName: 'build',
          targetBackendName: 'server-b',
          targetSessionName: 'ops',
          text: 'echo hello',
        }),
      });
      expect(response.status).toBe(200);

      response = await fetch(`http://127.0.0.1:${hubPort}/api/relay/send-keys`, {
        method: 'POST',
        headers: hubAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          sourceBackendName: 'server-a',
          sourceSessionName: 'build',
          targetBackendName: 'server-b',
          targetSessionName: 'ops',
          keys: ['Enter', 'C-c'],
        }),
      });
      expect(response.status).toBe(200);

      response = await fetch(`http://127.0.0.1:${hubPort}/api/relay/message`, {
        method: 'POST',
        headers: hubAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          sourceBackendName: 'server-a',
          sourceSessionName: 'build',
          targetBackendName: 'server-b',
          targetSessionName: 'ops',
          text: 'please review',
        }),
      });
      expect(response.status).toBe(200);

      expect(requests).toContainEqual({
        method: 'GET',
        url: '/api/sessions/by-name/ops/read?lines=25',
        body: null,
      });
      expect(requests).toContainEqual({
        method: 'POST',
        url: '/api/sessions/by-name/ops/send-text-no-enter',
        body: { text: 'echo hello' },
      });
      expect(requests).toContainEqual({
        method: 'POST',
        url: '/api/sessions/by-name/ops/send-keys',
        body: { keys: ['Enter', 'C-c'] },
      });
      expect(requests).toContainEqual({
        method: 'POST',
        url: '/api/sessions/by-name/ops/message',
        body: {
          fromBackendName: 'server-a',
          fromSessionName: 'build',
          text: 'please review',
        },
      });

      const logLines = fs
        .readFileSync(path.join(root, 'central', 'relay-log.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(logLines.map((entry) => entry.operation)).toEqual([
        'read',
        'send-text-no-enter',
        'send-keys',
        'message',
      ]);
    } finally {
      await server.stop();
      await closeServer(targetServer);
    }
  });

  it('aggregates panes and relays pane-level operations', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twm-web-pane-relay-'));
    const targetPort = await getFreePort();
    const hubPort = await getFreePort();
    const requests: Array<{ method: string; url: string; body: unknown }> = [];
    const targetServer = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      const rawBody = Buffer.concat(chunks).toString('utf8');
      requests.push({
        method: req.method || '',
        url: req.url || '',
        body: rawBody ? JSON.parse(rawBody) : null,
      });

      if (req.method === 'GET' && req.url === '/api/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/sessions') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ sessions: [] }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/panes') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            panes: [
              {
                paneId: '%2',
                sessionName: 'ops',
                windowIndex: 0,
                paneIndex: 1,
                currentPath: '/workspace/ops',
                currentCommand: 'bash',
                title: '',
                label: 'reviewer',
                lastActivityAt: '2026-03-29T00:00:00.000Z',
              },
            ],
          }),
        );
        return;
      }
      if (req.method === 'GET' && req.url === '/api/panes/by-id/%252/read?lines=25') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ paneId: '%2', lines: 25, output: 'pane output' }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/panes/by-id/%252/send-text') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/panes/by-id/%252/send-text-no-enter') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/panes/by-id/%252/send-keys') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/panes/by-id/%252/message') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/panes/by-id/%252/label') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, paneId: '%2', label: 'codex' }));
        return;
      }
      res.writeHead(404).end();
    });
    await listen(targetServer, targetPort);

    const store = new BackendRegistryStore(root);
    store.save({
      name: 'server-b',
      baseUrl: `http://127.0.0.1:${targetPort}`,
      authToken: '',
    });
    const server = createWebServer(buildTestConfig(root, hubPort), store);
    await server.start();

    try {
      let response = await fetch(`http://127.0.0.1:${hubPort}/api/panes`, { headers: hubAuthHeaders() });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        panes: [
          expect.objectContaining({
            backendName: 'server-b',
            paneId: '%2',
            sessionName: 'ops',
          }),
        ],
      });

      response = await fetch(`http://127.0.0.1:${hubPort}/api/relay/panes/read`, {
        method: 'POST',
        headers: hubAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          sourceBackendName: 'server-a',
          sourcePaneId: '%1',
          targetBackendName: 'server-b',
          targetPaneId: '%2',
          lines: 25,
        }),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        paneId: '%2',
        lines: 25,
        output: 'pane output',
      });

      response = await fetch(`http://127.0.0.1:${hubPort}/api/relay/panes/send-text`, {
        method: 'POST',
        headers: hubAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          sourceBackendName: 'server-a',
          sourcePaneId: '%1',
          targetBackendName: 'server-b',
          targetLabel: 'reviewer',
          text: 'echo pane',
        }),
      });
      expect(response.status).toBe(200);

      response = await fetch(`http://127.0.0.1:${hubPort}/api/relay/panes/send-text-no-enter`, {
        method: 'POST',
        headers: hubAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          sourceBackendName: 'server-a',
          sourcePaneId: '%1',
          targetBackendName: 'server-b',
          targetLabel: 'reviewer',
          text: 'echo pane',
        }),
      });
      expect(response.status).toBe(200);

      response = await fetch(`http://127.0.0.1:${hubPort}/api/relay/panes/send-keys`, {
        method: 'POST',
        headers: hubAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          sourceBackendName: 'server-a',
          sourcePaneId: '%1',
          targetBackendName: 'server-b',
          targetLabel: 'reviewer',
          keys: ['Enter', 'C-c'],
        }),
      });
      expect(response.status).toBe(200);

      response = await fetch(`http://127.0.0.1:${hubPort}/api/relay/panes/message`, {
        method: 'POST',
        headers: hubAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          sourceBackendName: 'server-a',
          sourcePaneId: '%1',
          targetBackendName: 'server-b',
          targetLabel: 'reviewer',
          text: 'please review pane',
        }),
      });
      expect(response.status).toBe(200);

      response = await fetch(`http://127.0.0.1:${hubPort}/api/relay/panes/label`, {
        method: 'POST',
        headers: hubAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          sourceBackendName: 'server-a',
          sourcePaneId: '%1',
          targetBackendName: 'server-b',
          targetLabel: 'reviewer',
          label: 'codex',
        }),
      });
      expect(response.status).toBe(200);

      expect(requests).toContainEqual({
        method: 'GET',
        url: '/api/panes/by-id/%252/read?lines=25',
        body: null,
      });
      expect(requests).toContainEqual({
        method: 'POST',
        url: '/api/panes/by-id/%252/send-text',
        body: { text: 'echo pane' },
      });
      expect(requests).toContainEqual({
        method: 'POST',
        url: '/api/panes/by-id/%252/send-text-no-enter',
        body: { text: 'echo pane' },
      });
      expect(requests).toContainEqual({
        method: 'POST',
        url: '/api/panes/by-id/%252/send-keys',
        body: { keys: ['Enter', 'C-c'] },
      });
      expect(requests).toContainEqual({
        method: 'POST',
        url: '/api/panes/by-id/%252/message',
        body: {
          fromBackendName: 'server-a',
          fromPaneId: '%1',
          text: 'please review pane',
        },
      });
      expect(requests).toContainEqual({
        method: 'POST',
        url: '/api/panes/by-id/%252/label',
        body: { label: 'codex' },
      });

      const logLines = fs
        .readFileSync(path.join(root, 'central', 'relay-log.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(logLines.map((entry) => entry.operation)).toEqual([
        'pane-read',
        'pane-send-text',
        'pane-send-text-no-enter',
        'pane-send-keys',
        'pane-message',
        'pane-label',
      ]);
      expect(logLines.at(-1)).toMatchObject({
        sourcePaneId: '%1',
        targetLabel: 'reviewer',
        operation: 'pane-label',
      });
    } finally {
      await server.stop();
      await closeServer(targetServer);
    }
  });

  it('exposes agent-friendly orchestration pane discovery', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twm-web-pane-discovery-'));
    const targetPort = await getFreePort();
    const hubPort = await getFreePort();
    const targetServer = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/api/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/sessions') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ sessions: [] }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/panes') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            panes: [
              {
                paneId: '%2',
                sessionName: 'ops',
                windowIndex: 1,
                paneIndex: 0,
                currentPath: '/workspace/ops',
                currentCommand: 'bash',
                title: '',
                label: 'reviewer',
                lastActivityAt: '2026-03-29T00:00:00.000Z',
              },
            ],
          }),
        );
        return;
      }
      res.writeHead(404).end();
    });
    await listen(targetServer, targetPort);

    const store = new BackendRegistryStore(root);
    store.save({
      name: 'server-b',
      baseUrl: `http://127.0.0.1:${targetPort}`,
      authToken: '',
    });
    const server = createWebServer(buildTestConfig(root, hubPort), store);
    await server.start();

    try {
      const response = await fetch(`http://127.0.0.1:${hubPort}/api/orchestration/panes`, { headers: hubAuthHeaders() });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
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
        panes: [
          {
            targetId: 'server-b/%2',
            backendName: 'server-b',
            paneId: '%2',
            sessionName: 'ops',
            location: 'ops:1.0',
            label: 'reviewer',
            currentCommand: 'bash',
            currentPath: '/workspace/ops',
            lastActivityAt: '2026-03-29T00:00:00.000Z',
          },
        ],
      });

      const resolveResponse = await fetch(
        `http://127.0.0.1:${hubPort}/api/orchestration/panes/resolve?backendName=server-b&label=reviewer`,
        { headers: hubAuthHeaders() },
      );
      expect(resolveResponse.status).toBe(200);
      await expect(resolveResponse.json()).resolves.toEqual({
        pane: {
          targetId: 'server-b/%2',
          backendName: 'server-b',
          paneId: '%2',
          sessionName: 'ops',
          location: 'ops:1.0',
          label: 'reviewer',
          currentCommand: 'bash',
          currentPath: '/workspace/ops',
          lastActivityAt: '2026-03-29T00:00:00.000Z',
        },
      });
    } finally {
      await server.stop();
      await closeServer(targetServer);
    }
  });
});




function hubAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: 'Bearer hub-api-token', ...extra };
}

function buildTestConfig(root: string, hubPort: number) {
  return {
    mode: 'main' as const,
    host: '127.0.0.1',
    port: hubPort,
    baseUrl: `http://127.0.0.1:${hubPort}`,
    dataDir: root,
    centralDataDir: path.join(root, 'central'),
    backendDataDir: path.join(root, 'backend'),
    allowedRoots: [root],
    backendHost: '127.0.0.1',
    backendPort: 8788,
    backendPublicUrl: 'http://127.0.0.1:8788',
    backendName: 'local',
    backendAuthToken: '',
    hubAuthUsername: 'admin',
    hubAuthPassword: 'secret-password',
    hubApiToken: 'hub-api-token',
    hubSessionSecret: 'hub-session-secret',
    hubSessionTtlMs: 60_000,
    hubSecureCookies: false,
    tmuxSocketMode: 'default' as const,
    tmuxSocketName: 'tfw',
    sessionPrefix: 'tfw',
    ohMyTmuxConfigPath: '/opt/oh-my-tmux/.tmux.conf',
    backendAuthTokenPath: path.join(root, 'token'),
  };
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to allocate free port'));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function listen(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
