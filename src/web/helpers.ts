import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import type { BackendRegistryStore } from '../store.js';
import type { AggregatedSessionRecord, BackendHealth, BackendRecord, BackendState } from '../types.js';

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export function authHeaders(backend: BackendRecord): Record<string, string> {
  if (!backend.authToken) {
    return {};
  }
  return { Authorization: `Bearer ${backend.authToken}` };
}

export function getBackendByName(
  store: BackendRegistryStore,
  name: string,
): BackendRecord | undefined {
  return store.all().find((backend) => backend.name === name);
}

export function findSessionNameById(
  sessions: Array<{ id: string; tmuxSessionName: string }>,
  sessionId: string | undefined,
): string | undefined {
  if (!sessionId) {
    return undefined;
  }
  return sessions.find((session) => session.id === sessionId)?.tmuxSessionName;
}

export async function fetchJson<T>(
  backend: BackendRecord,
  pathname: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${normalizeBaseUrl(backend.baseUrl)}${pathname}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...authHeaders(backend),
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${backend.baseUrl}${pathname}`);
  }
  return (await response.json()) as T;
}

export async function fetchBackendState(backend: BackendRecord): Promise<BackendState> {
  try {
    const [health, sessionPayload] = await Promise.all([
      fetchJson<BackendHealth>(backend, '/api/health'),
      fetchJson<{ sessions: AggregatedSessionRecord[] }>(backend, '/api/sessions'),
    ]);
    const sessions = sortAggregatedSessionsByRecentActivity(
      sessionPayload.sessions.map((session) => ({
        ...session,
        backendId: backend.id,
        backendName: backend.name,
        backendBaseUrl: backend.baseUrl,
      })),
    );
    return {
      backend,
      online: true,
      health,
      sessions,
    };
  } catch (error) {
    return {
      backend,
      online: false,
      error: error instanceof Error ? error.message : String(error),
      sessions: [],
    };
  }
}

export async function aggregateBackendStates(store: BackendRegistryStore): Promise<BackendState[]> {
  return Promise.all(store.all().map((backend) => fetchBackendState(backend)));
}

export function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

export async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
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

export function appendJsonLine(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`);
}

export interface RelaySendTextRequest {
  sourceBackendName: string;
  sourceSessionName: string;
  targetBackendName: string;
  targetSessionName: string;
  text: string;
}

export interface RelayAuditRecord {
  timestamp: string;
  sourceBackendName: string;
  sourceSessionName: string;
  targetBackendName: string;
  targetSessionName: string;
  text: string;
  result: 'ok' | 'error';
  error?: string;
  targetBackendId?: string;
}

export function normalizeRelaySendTextRequest(
  body: Record<string, unknown>,
): RelaySendTextRequest {
  const sourceBackendName = String(body.sourceBackendName || '').trim();
  if (!sourceBackendName) {
    throw new Error('sourceBackendName is required');
  }
  const sourceSessionName = String(body.sourceSessionName || '').trim();
  if (!sourceSessionName) {
    throw new Error('sourceSessionName is required');
  }
  const targetBackendName = String(body.targetBackendName || '').trim();
  if (!targetBackendName) {
    throw new Error('targetBackendName is required');
  }
  const targetSessionName = String(body.targetSessionName || '').trim();
  if (!targetSessionName) {
    throw new Error('targetSessionName is required');
  }
  const text = String(body.text || '');
  if (!text) {
    throw new Error('text is required');
  }
  return {
    sourceBackendName,
    sourceSessionName,
    targetBackendName,
    targetSessionName,
    text,
  };
}

export function buildRelayAuditRecord(
  body: Record<string, unknown>,
  outcome: {
    result: 'ok' | 'error';
    error?: string;
    targetBackend?: BackendRecord;
    timestamp?: string;
  },
): RelayAuditRecord {
  return {
    timestamp: outcome.timestamp || new Date().toISOString(),
    sourceBackendName: outcome.targetBackend ? String(body.sourceBackendName || '').trim() : String(body.sourceBackendName || '').trim(),
    sourceSessionName: String(body.sourceSessionName || '').trim(),
    targetBackendName: outcome.targetBackend?.name || String(body.targetBackendName || '').trim(),
    targetSessionName: String(body.targetSessionName || '').trim(),
    text: String(body.text || ''),
    result: outcome.result,
    ...(outcome.error ? { error: outcome.error } : {}),
    ...(outcome.targetBackend ? { targetBackendId: outcome.targetBackend.id } : {}),
  };
}

export function buildSessionPathSummary(
  session: Pick<AggregatedSessionRecord, 'requestedPath' | 'currentPath'>,
): string {
  const requestedPath = session.requestedPath.trim();
  const currentPath = session.currentPath.trim();
  if (!currentPath || currentPath === requestedPath) {
    return requestedPath;
  }
  return `${requestedPath} · cwd ${currentPath}`;
}

function sortTimestampDesc(left?: string, right?: string): number {
  const leftMs = left ? Date.parse(left) : Number.NEGATIVE_INFINITY;
  const rightMs = right ? Date.parse(right) : Number.NEGATIVE_INFINITY;
  return rightMs - leftMs;
}

export function sortAggregatedSessionsByRecentActivity(
  sessions: AggregatedSessionRecord[],
): AggregatedSessionRecord[] {
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

export function formatRelativeTime(input: string | undefined, now = Date.now()): string {
  if (!input) {
    return 'unknown';
  }
  const target = Date.parse(input);
  if (!Number.isFinite(target)) {
    return 'unknown';
  }
  const diffMs = Math.max(0, now - target);
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 10) {
    return 'just now';
  }
  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) {
    return `${diffWeeks}w ago`;
  }
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths}mo ago`;
  }
  return `${Math.floor(diffDays / 365)}y ago`;
}
