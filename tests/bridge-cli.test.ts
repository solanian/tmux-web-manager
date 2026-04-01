import { describe, expect, it } from 'vitest';

import {
  buildBridgeRequestSpec,
  formatPaneTable,
  parseBridgeCliArgs,
  parsePaneTargetSelector,
  resolveSourceSelector,
  runBridgeCommand,
} from '../src/bridge-cli.js';

describe('parsePaneTargetSelector', () => {
  it('treats % targets as pane ids and others as labels', () => {
    expect(parsePaneTargetSelector('%12')).toEqual({ targetPaneId: '%12' });
    expect(parsePaneTargetSelector('reviewer')).toEqual({ targetLabel: 'reviewer' });
  });
});

describe('resolveSourceSelector', () => {
  it('uses explicit source pane data when available', () => {
    expect(
      resolveSourceSelector({
        hubBaseUrl: 'http://127.0.0.1:8787',
        json: false,
        fromBackendName: 'server-a',
        fromPaneId: '%1',
      }),
    ).toEqual({
      sourceBackendName: 'server-a',
      sourcePaneId: '%1',
    });
  });
});

describe('parseBridgeCliArgs', () => {
  it('parses bridge options and command positionals', () => {
    expect(
      parseBridgeCliArgs(['--hub', 'http://hub:8787', '--hub-token', 'hub-secret', '--json', 'read', 'server-b', 'reviewer', '20'], {
        TWM_SOURCE_BACKEND: 'server-a',
        TWM_SOURCE_PANE: '%1',
      } as NodeJS.ProcessEnv),
    ).toEqual({
      command: 'read',
      positionals: ['server-b', 'reviewer', '20'],
      options: {
        hubBaseUrl: 'http://hub:8787',
        hubApiToken: 'hub-secret',
        json: true,
        fromBackendName: 'server-a',
        fromPaneId: '%1',
      },
    });
  });
});

describe('buildBridgeRequestSpec', () => {
  it('builds pane relay requests for read and message commands', () => {
    expect(
      buildBridgeRequestSpec({
        command: 'read',
        positionals: ['server-b', 'reviewer', '15'],
        options: {
          hubBaseUrl: 'http://127.0.0.1:8787',
          json: false,
          fromBackendName: 'server-a',
          fromPaneId: '%1',
        },
      }),
    ).toEqual({
      method: 'POST',
      path: '/api/relay/panes/read',
      body: {
        sourceBackendName: 'server-a',
        sourcePaneId: '%1',
        targetBackendName: 'server-b',
        targetLabel: 'reviewer',
        lines: 15,
      },
    });

    expect(
      buildBridgeRequestSpec({
        command: 'message',
        positionals: ['server-b', '%12', 'please', 'review'],
        options: {
          hubBaseUrl: 'http://127.0.0.1:8787',
          json: false,
          fromBackendName: 'server-a',
          fromPaneId: '%1',
        },
      }),
    ).toEqual({
      method: 'POST',
      path: '/api/relay/panes/message',
      body: {
        sourceBackendName: 'server-a',
        sourcePaneId: '%1',
        targetBackendName: 'server-b',
        targetPaneId: '%12',
        text: 'please review',
      },
    });
  });
});

describe('formatPaneTable', () => {
  it('renders a simple pane summary table', () => {
    const table = formatPaneTable({
      panes: [
        {
          targetId: 'server-b/%2',
          label: 'reviewer',
          sessionName: 'ops',
          location: 'ops:1.0',
          currentCommand: 'bash',
          currentPath: '/workspace/ops',
        },
      ],
    });

    expect(table).toContain('TARGET');
    expect(table).toContain('server-b/%2');
    expect(table).toContain('reviewer');
  });
});

describe('runBridgeCommand', () => {
  it('executes panes, resolve, and read commands against the hub API', async () => {
    const fetchImpl: typeof fetch = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/orchestration/panes')) {
        return new Response(
          JSON.stringify({
            panes: [
              {
                targetId: 'server-b/%2',
                label: 'reviewer',
                sessionName: 'ops',
                location: 'ops:1.0',
                currentCommand: 'bash',
                currentPath: '/workspace/ops',
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/api/orchestration/panes/resolve')) {
        return new Response(JSON.stringify({ pane: { targetId: 'server-b/%2' } }), { status: 200 });
      }
      if (url.endsWith('/api/relay/panes/read')) {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          sourceBackendName: 'server-a',
          sourcePaneId: '%1',
          targetBackendName: 'server-b',
          targetLabel: 'reviewer',
          lines: 10,
        });
        return new Response(JSON.stringify({ paneId: '%2', lines: 10, output: 'ready' }), { status: 200 });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    let result = await runBridgeCommand(['panes'], {
      TWM_BASE_URL: 'http://hub:8787',
      TWM_SOURCE_BACKEND: 'server-a',
      TWM_SOURCE_PANE: '%1',
    } as NodeJS.ProcessEnv, fetchImpl);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('server-b/%2');

    result = await runBridgeCommand(['resolve', 'server-b', 'reviewer'], {
      TWM_BASE_URL: 'http://hub:8787',
      TWM_SOURCE_BACKEND: 'server-a',
      TWM_SOURCE_PANE: '%1',
    } as NodeJS.ProcessEnv, fetchImpl);
    expect(result).toMatchObject({ exitCode: 0, stdout: 'server-b/%2' });

    result = await runBridgeCommand(['read', 'server-b', 'reviewer', '10'], {
      TWM_BASE_URL: 'http://hub:8787',
      TWM_SOURCE_BACKEND: 'server-a',
      TWM_SOURCE_PANE: '%1',
    } as NodeJS.ProcessEnv, fetchImpl);
    expect(result).toMatchObject({ exitCode: 0, stdout: 'ready' });
  });

  it('forwards hub API tokens as bearer auth headers', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch: typeof fetch = (async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ panes: [] }), { status: 200 });
    }) as typeof fetch;

    await runBridgeCommand(['--hub-token', 'hub-secret', 'panes'], process.env, fakeFetch);

    expect(calls[0]?.init?.headers).toMatchObject({ authorization: 'Bearer hub-secret' });
  });
});
