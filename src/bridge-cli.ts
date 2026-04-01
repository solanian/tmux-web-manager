#!/usr/bin/env node

import os from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export interface BridgeCliOptions {
  hubBaseUrl: string;
  json: boolean;
  hubApiToken?: string;
  fromBackendName?: string;
  fromPaneId?: string;
  fromLabel?: string;
}

export interface PaneTargetSelector {
  targetPaneId?: string;
  targetLabel?: string;
}

export interface SourcePaneSelector {
  sourceBackendName: string;
  sourcePaneId?: string;
  sourceLabel?: string;
}

export interface ParsedBridgeCommand {
  command: string;
  positionals: string[];
  options: BridgeCliOptions;
}

export interface BridgeRequestSpec {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
}

export function printBridgeUsage(): string {
  return [
    'Usage: twm-bridge [options] <command> ...',
    '',
    'Global options:',
    '  --hub <url>            Hub base URL (default: $TWM_BASE_URL, $BASE_URL, http://127.0.0.1:8787)',
    '  --from-backend <name>  Source backend name (default: $TWM_SOURCE_BACKEND, $BACKEND_NAME, hostname)',
    '  --from-pane <paneId>   Source pane id (default: $TWM_SOURCE_PANE, $TMUX_PANE)',
    '  --from-label <label>   Source pane label fallback when no pane id is available',
    '  --hub-token <token>    Hub API token (default: $TWM_HUB_API_TOKEN, $HUB_API_TOKEN)',
    '  --json                 Print raw JSON responses when supported',
    '',
    'Commands:',
    '  panes',
    '  resolve <backend> <label>',
    '  read <backend> <target> [lines]',
    '  type <backend> <target> <text...>',
    '  send <backend> <target> <text...>',
    '  keys <backend> <target> <key...>',
    '  message <backend> <target> <text...>',
    '  label <backend> <target> <label>',
    '',
    'Targets:',
    '  %12        pane id',
    '  reviewer   pane label',
  ].join('\n');
}

export function normalizeHubBaseUrl(value: string | undefined): string {
  return (value || 'http://127.0.0.1:8787').replace(/\/+$/, '');
}

export function parseBridgeCliArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): ParsedBridgeCommand {
  const options: BridgeCliOptions = {
    hubBaseUrl: normalizeHubBaseUrl(env.TWM_BASE_URL || env.BASE_URL || 'http://127.0.0.1:8787'),
    json: false,
    ...(env.TWM_SOURCE_BACKEND || env.BACKEND_NAME || os.hostname()
      ? { fromBackendName: env.TWM_SOURCE_BACKEND || env.BACKEND_NAME || os.hostname() }
      : {}),
    ...(env.TWM_SOURCE_PANE || env.TMUX_PANE ? { fromPaneId: env.TWM_SOURCE_PANE || env.TMUX_PANE || undefined } : {}),
    ...(env.TWM_SOURCE_LABEL ? { fromLabel: env.TWM_SOURCE_LABEL } : {}),
    ...(env.TWM_HUB_API_TOKEN || env.HUB_API_TOKEN ? { hubApiToken: env.TWM_HUB_API_TOKEN || env.HUB_API_TOKEN || undefined } : {}),
  };

  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    switch (arg) {
      case '--hub':
        options.hubBaseUrl = normalizeHubBaseUrl(argv[index + 1]);
        index += 1;
        break;
      case '--from-backend':
        options.fromBackendName = argv[index + 1] || '';
        index += 1;
        break;
      case '--from-pane':
        options.fromPaneId = argv[index + 1] || '';
        index += 1;
        break;
      case '--from-label':
        options.fromLabel = argv[index + 1] || '';
        index += 1;
        break;
      case '--hub-token':
        options.hubApiToken = argv[index + 1] || '';
        index += 1;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        positionals.push(arg);
        break;
    }
  }

  const [command = 'help', ...rest] = positionals;
  return { command, positionals: rest, options };
}

export function parsePaneTargetSelector(token: string): PaneTargetSelector {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error('target is required');
  }
  if (trimmed.startsWith('%')) {
    return { targetPaneId: trimmed };
  }
  return { targetLabel: trimmed };
}

export function resolveSourceSelector(options: BridgeCliOptions): SourcePaneSelector {
  const sourceBackendName = options.fromBackendName?.trim();
  if (!sourceBackendName) {
    throw new Error('source backend is required; set --from-backend or TWM_SOURCE_BACKEND');
  }
  const sourcePaneId = options.fromPaneId?.trim();
  const sourceLabel = options.fromLabel?.trim();
  if (!sourcePaneId && !sourceLabel) {
    throw new Error('source pane is required; set --from-pane, $TMUX_PANE, or --from-label');
  }
  return {
    sourceBackendName,
    ...(sourcePaneId ? { sourcePaneId } : {}),
    ...(sourceLabel ? { sourceLabel } : {}),
  };
}

export function buildBridgeRequestSpec(parsed: ParsedBridgeCommand): BridgeRequestSpec {
  const { command, positionals, options } = parsed;
  if (command === 'panes') {
    return { method: 'GET', path: '/api/orchestration/panes' };
  }
  if (command === 'resolve') {
    const [backendName, label] = positionals;
    if (!backendName || !label) {
      throw new Error('resolve requires <backend> <label>');
    }
    const qs = new URLSearchParams({ backendName, label });
    return { method: 'GET', path: `/api/orchestration/panes/resolve?${qs.toString()}` };
  }

  const [backendName, targetToken, ...rest] = positionals;
  if (!backendName || !targetToken) {
    throw new Error(`${command} requires <backend> <target> ...`);
  }
  const target = parsePaneTargetSelector(targetToken);
  const source = resolveSourceSelector(options);

  if (command === 'read') {
    const [linesRaw] = rest;
    const lines = linesRaw && linesRaw.trim() ? Number.parseInt(linesRaw, 10) : 20;
    return {
      method: 'POST',
      path: '/api/relay/panes/read',
      body: {
        ...source,
        targetBackendName: backendName,
        ...target,
        lines,
      },
    };
  }

  if (command === 'type') {
    const text = rest.join(' ').trim();
    if (!text) {
      throw new Error('type requires <text...>');
    }
    return {
      method: 'POST',
      path: '/api/relay/panes/send-text-no-enter',
      body: {
        ...source,
        targetBackendName: backendName,
        ...target,
        text,
      },
    };
  }

  if (command === 'send') {
    const text = rest.join(' ').trim();
    if (!text) {
      throw new Error('send requires <text...>');
    }
    return {
      method: 'POST',
      path: '/api/relay/panes/send-text',
      body: {
        ...source,
        targetBackendName: backendName,
        ...target,
        text,
      },
    };
  }

  if (command === 'keys') {
    if (rest.length === 0) {
      throw new Error('keys requires <key...>');
    }
    return {
      method: 'POST',
      path: '/api/relay/panes/send-keys',
      body: {
        ...source,
        targetBackendName: backendName,
        ...target,
        keys: rest,
      },
    };
  }

  if (command === 'message') {
    const text = rest.join(' ').trim();
    if (!text) {
      throw new Error('message requires <text...>');
    }
    return {
      method: 'POST',
      path: '/api/relay/panes/message',
      body: {
        ...source,
        targetBackendName: backendName,
        ...target,
        text,
      },
    };
  }

  if (command === 'label') {
    const [label] = rest;
    if (!label) {
      throw new Error('label requires <label>');
    }
    return {
      method: 'POST',
      path: '/api/relay/panes/label',
      body: {
        ...source,
        targetBackendName: backendName,
        ...target,
        label,
      },
    };
  }

  throw new Error(`Unknown command: ${command}`);
}

export function formatPaneTable(payload: {
  panes: Array<{
    targetId: string;
    label: string;
    sessionName: string;
    location: string;
    currentCommand: string;
    currentPath: string;
  }>;
}): string {
  const rows = [
    ['TARGET', 'LABEL', 'SESSION', 'LOCATION', 'CMD', 'PATH'],
    ...payload.panes.map((pane) => [
      pane.targetId,
      pane.label || '-',
      pane.sessionName,
      pane.location,
      pane.currentCommand || '-',
      pane.currentPath || '-',
    ]),
  ];
  const widths = rows[0]!.map((_, index) => Math.max(...rows.map((row) => row[index]!.length)));
  return rows
    .map((row) => row.map((cell, index) => cell.padEnd(widths[index]!)).join('  ').trimEnd())
    .join('\n');
}

export async function runBridgeCommand(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const parsed = parseBridgeCliArgs(argv, env);
    if (parsed.command === 'help' || parsed.command === '--help' || parsed.command === '-h') {
      return { stdout: printBridgeUsage(), stderr: '', exitCode: 0 };
    }
    const request = buildBridgeRequestSpec(parsed);
    const headers: Record<string, string> = {};
    if (request.body) {
      headers['content-type'] = 'application/json';
    }
    if (parsed.options.hubApiToken) {
      headers['authorization'] = `Bearer ${parsed.options.hubApiToken}`;
    }
    const response = await fetchImpl(`${parsed.options.hubBaseUrl}${request.path}`, {
      method: request.method,
      headers: Object.keys(headers).length ? headers : undefined,
      body: request.body ? JSON.stringify(request.body) : undefined,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      return {
        stdout: '',
        stderr: payload?.error || response.statusText,
        exitCode: 1,
      };
    }
    if (parsed.options.json) {
      return { stdout: JSON.stringify(payload, null, 2), stderr: '', exitCode: 0 };
    }
    if (parsed.command === 'panes') {
      return { stdout: formatPaneTable(payload), stderr: '', exitCode: 0 };
    }
    if (parsed.command === 'resolve') {
      return { stdout: payload.pane.targetId, stderr: '', exitCode: 0 };
    }
    if (parsed.command === 'read') {
      return { stdout: payload.output || '', stderr: '', exitCode: 0 };
    }
    return { stdout: 'OK', stderr: '', exitCode: 0 };
  } catch (error) {
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };
  }
}

async function main(): Promise<void> {
  const result = await runBridgeCommand(process.argv.slice(2), process.env, fetch);
  if (result.stdout) {
    process.stdout.write(`${result.stdout}\n`);
  }
  if (result.stderr) {
    process.stderr.write(`${result.stderr}\n`);
  }
  process.exit(result.exitCode);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  void main();
}
