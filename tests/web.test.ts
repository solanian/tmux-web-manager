import { describe, expect, it } from 'vitest';

import {
  buildSessionPathSummary,
  createWebServer,
  findSessionNameById,
  formatRelativeTime,
  normalizeRelaySendTextRequest,
  renderHtmlPage,
  sortAggregatedSessionsByRecentActivity,
} from '../src/web.js';
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
    expect(html).toContain("body[data-sidebar-open=\"true\"] #sidebar");
  });
});

describe('createWebServer', () => {
  it('is constructible with the backend registry store', () => {
    const store = new BackendRegistryStore('/tmp/tfw-web-test');
    const server = createWebServer(
      {
        mode: 'main',
        host: '127.0.0.1',
        port: 8787,
        baseUrl: 'http://localhost:8787',
        dataDir: '/tmp/tfw',
        centralDataDir: '/tmp/tfw/central',
        backendDataDir: '/tmp/tfw/backend',
        allowedRoots: ['/tmp'],
        backendHost: '127.0.0.1',
        backendPort: 8788,
        backendPublicUrl: 'http://127.0.0.1:8788',
        backendName: 'local',
        backendAuthToken: '',
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
});
