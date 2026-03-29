import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import WebSocket, { WebSocketServer } from 'ws';

import type { AppConfig } from './config.js';
import { createLogger } from './logger.js';
import { BackendRegistryStore } from './store.js';
import type { AggregatedSessionRecord, BackendHealth, BackendRecord, BackendState } from './types.js';

const logger = createLogger('WEB');

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function authHeaders(backend: BackendRecord): Record<string, string> {
  if (!backend.authToken) {
    return {};
  }
  return { Authorization: `Bearer ${backend.authToken}` };
}

function getBackendByName(store: BackendRegistryStore, name: string): BackendRecord | undefined {
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

async function fetchJson<T>(backend: BackendRecord, pathname: string, init?: RequestInit): Promise<T> {
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

async function fetchBackendState(backend: BackendRecord): Promise<BackendState> {
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

async function aggregateBackendStates(store: BackendRegistryStore): Promise<BackendState[]> {
  return Promise.all(store.all().map((backend) => fetchBackendState(backend)));
}

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

function appendJsonLine(filePath: string, payload: unknown): void {
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

export function normalizeRelaySendTextRequest(
  body: Record<string, unknown>,
): RelaySendTextRequest {
  const sourceBackendName = String(body.sourceBackendName || '').trim();
  if (!sourceBackendName) {
    throw new Error('sourceBackendName is required');
  }
  const targetBackendName = String(body.targetBackendName || '').trim();
  const targetSessionName = String(body.targetSessionName || '').trim();
  const text = String(body.text || '');
  if (!targetBackendName) {
    throw new Error('targetBackendName is required');
  }
  if (!targetSessionName) {
    throw new Error('targetSessionName is required');
  }
  if (!text) {
    throw new Error('text is required');
  }
  const sourceSessionName = String(body.sourceSessionName || '').trim();
  if (!sourceSessionName) {
    throw new Error('sourceSessionName is required');
  }
  return {
    sourceBackendName,
    sourceSessionName,
    targetBackendName,
    targetSessionName,
    text,
  };
}

export function buildSessionPathSummary(session: Pick<AggregatedSessionRecord, 'requestedPath' | 'currentPath'>): string {
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

export function formatRelativeTime(
  input: string | undefined,
  now = Date.now(),
): string {
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

export function renderHtmlPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>tmux fleet web</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css">
  <style>
    :root {
      --bg: #091018;
      --panel: #101926;
      --panel-alt: #152233;
      --border: #223349;
      --text: #e5edf7;
      --muted: #8ea1b8;
      --accent: #4ade80;
      --danger: #f87171;
      --warning: #fbbf24;
    }
    * { box-sizing: border-box; }
    * {
      scrollbar-width: thin;
      scrollbar-color: #3b82f6 rgba(21, 34, 51, 0.55);
    }
    *::-webkit-scrollbar {
      width: 12px;
      height: 12px;
    }
    *::-webkit-scrollbar-track {
      background: rgba(11, 21, 33, 0.82);
      border-radius: 999px;
    }
    *::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, rgba(96, 165, 250, 0.92), rgba(59, 130, 246, 0.82));
      border: 2px solid rgba(11, 21, 33, 0.82);
      border-radius: 999px;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    }
    *::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(180deg, rgba(125, 185, 255, 0.96), rgba(59, 130, 246, 0.9));
    }
    *::-webkit-scrollbar-corner {
      background: rgba(11, 21, 33, 0.82);
    }
    html, body { margin: 0; height: 100%; min-height: 100dvh; background: radial-gradient(circle at top, #10233d, var(--bg)); color: var(--text); font-family: ui-sans-serif, system-ui, sans-serif; }
    #app { display: grid; grid-template-columns: 360px 1fr; height: 100dvh; min-height: 100vh; overflow: hidden; transition: grid-template-columns 160ms ease; }
    body[data-sidebar-open="false"] #app { grid-template-columns: 0 minmax(0, 1fr); }
    #sidebar { display: flex; flex-direction: column; overflow: hidden; border-right: 1px solid var(--border); background: rgba(8, 16, 24, 0.96); padding: 16px; min-width: 0; min-height: 0; transform: translateX(0); opacity: 1; transition: transform 160ms ease, opacity 160ms ease, padding 160ms ease, border-color 160ms ease; }
    body[data-sidebar-open="false"] #sidebar { transform: translateX(-100%); opacity: 0; pointer-events: none; padding-left: 0; padding-right: 0; border-right-color: transparent; }
    #sidebarBackdrop { display: none; }
    #sidebarHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    #sidebarTitle { margin: 0; font-size: 18px; }
    #sidebarToggle { display: inline-flex; align-items: center; justify-content: center; }
    #sidebarClose { display: inline-flex; align-items: center; justify-content: center; }
    body[data-sidebar-open="true"] #sidebarToggle { display: none; }
    body[data-sidebar-open="false"] #sidebarClose { display: none; }
    #sidebarToggle { min-width: 84px; }
    .iconButton { min-height: 38px; min-width: 38px; border-radius: 10px; border: 1px solid var(--border); background: var(--panel-alt); color: var(--text); cursor: pointer; }
    .sidebarTabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
    .sidebarTab { min-height: 40px; border-radius: 12px; border: 1px solid var(--border); background: #0d1520; color: var(--muted); font-weight: 600; cursor: pointer; }
    .sidebarTab.active { color: var(--text); background: var(--panel-alt); border-color: #2563eb; box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.25) inset; }
    .tabPanel { display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; overflow: hidden; }
    .tabPanel[hidden] { display: none !important; }
    #main { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-width: 0; min-height: 0; height: 100%; overflow: hidden; }
    #terminalBar { flex-shrink: 0; padding: 14px 16px; border-bottom: 1px solid var(--border); background: rgba(16, 25, 38, 0.9); display: flex; justify-content: space-between; gap: 12px; align-items: center; }
    #terminalBarLeft { display: flex; align-items: center; gap: 12px; min-width: 0; }
    #terminalBarRight { display: flex; align-items: center; gap: 10px; }
    #fontControls { display: inline-flex; align-items: center; gap: 6px; }
    #fontSizeLabel { min-width: 48px; text-align: center; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: var(--muted); }
    #terminalShell { display: flex; min-height: 0; padding: 8px 8px 0; overflow: hidden; }
    #terminal { flex: 1; min-width: 0; min-height: 0; width: 100%; height: auto; }
    #composer { display: none; position: relative; flex-direction: column; gap: 8px; padding: 12px 16px max(16px, calc(12px + env(safe-area-inset-bottom))); border-top: 1px solid var(--border); background: rgba(16, 25, 38, 0.94); }
    #composerKeys { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
    .composerKey, button, select, input { font: inherit; }
    .composerKey, .actionButton, button { min-height: 38px; border-radius: 10px; border: 1px solid var(--border); background: var(--panel-alt); color: var(--text); padding: 8px 10px; cursor: pointer; }
    .danger { border-color: #7f1d1d; color: #fecaca; }
    .muted { color: var(--muted); }
    .pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 2px 8px; font-size: 12px; border: 1px solid var(--border); }
    .online { color: #bbf7d0; border-color: #166534; }
    .offline { color: #fecaca; border-color: #7f1d1d; }
    .section { margin-bottom: 20px; }
    .sidebarScrollSection { display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; margin-bottom: 0; }
    .sectionHeader { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
    .section h2, .sectionHeader h2 { margin: 0; font-size: 15px; }
    .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
    .field input, .field select { width: 100%; min-height: 38px; border-radius: 10px; border: 1px solid var(--border); background: #0d1520; color: var(--text); padding: 8px 10px; }
    .fieldHint { font-size: 12px; color: var(--muted); line-height: 1.4; }
    .formError { margin-bottom: 12px; padding: 10px 12px; border-radius: 10px; border: 1px solid #7f1d1d; background: rgba(127, 29, 29, 0.18); color: #fecaca; font-size: 13px; }
    .formError[hidden] { display: none !important; }
    .row { display: flex; gap: 8px; }
    .row > * { flex: 1; }
    .list { display: flex; flex-direction: column; gap: 8px; }
    .cmuxList { gap: 6px; }
    .listScroll { display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; overflow-x: hidden; overflow-y: auto; padding-right: 4px; overscroll-behavior: contain; }
    .item { border: 1px solid var(--border); border-radius: 14px; padding: 10px; background: rgba(21, 34, 51, 0.64); }
    .cmuxItem { border-radius: 12px; padding: 9px 10px; background: linear-gradient(180deg, rgba(14, 23, 36, 0.96), rgba(10, 17, 28, 0.96)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.02); cursor: pointer; transition: border-color 90ms ease, box-shadow 90ms ease, transform 90ms ease, background 90ms ease; }
    .cmuxItem:hover { border-color: #36506e; background: linear-gradient(180deg, rgba(17, 29, 45, 0.98), rgba(11, 21, 33, 0.98)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.03), 0 8px 18px rgba(2, 6, 23, 0.18); }
    .cmuxItem:active { transform: translateY(1px); }
    .item.active { border-color: #3b82f6; background: linear-gradient(180deg, rgba(22, 38, 60, 0.98), rgba(13, 25, 40, 0.98)); box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.42) inset, 0 10px 24px rgba(37, 99, 235, 0.16); }
    .item.active .cmuxPrimary { color: #f8fbff; }
    .item.active .cmuxSecondary, .item.active .cmuxTertiary { color: #d6e4f5; }
    .itemHeader { display: flex; justify-content: space-between; gap: 8px; }
    .itemTitle { font-weight: 600; }
    .itemMeta { margin-top: 6px; font-size: 12px; color: var(--muted); word-break: break-all; }
    .itemActions { display: flex; gap: 8px; margin-top: 10px; }
    .itemActions button { flex: 1; }
    .cmuxRow { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .cmuxMain { min-width: 0; flex: 1; }
    .cmuxPrimary, .cmuxSecondary, .cmuxTertiary { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cmuxPrimary { display: flex; align-items: center; gap: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; font-weight: 700; }
    .cmuxSecondary, .cmuxTertiary { margin-top: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; color: var(--muted); }
    .cmuxSecondary { color: #bfd0e6; }
    .tooltipTarget { cursor: help; }
    .cmuxBadgeRow { display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
    .cmuxActions { display: flex; gap: 6px; flex-shrink: 0; }
    .cmuxActions button { min-height: 30px; padding: 5px 8px; font-size: 12px; border-radius: 8px; }
    .statusDot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; background: #ef4444; box-shadow: 0 0 0 1px rgba(255,255,255,0.08); }
    .statusDot.online { background: #22c55e; }
    .statusDot.offline { background: #ef4444; }
    .statusDot.warning { background: #f59e0b; }
    .inlineTag { display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 999px; border: 1px solid var(--border); font-size: 10px; color: var(--muted); }
    #modalBackdrop { position: fixed; inset: 0; background: rgba(2, 6, 23, 0.68); border: 0; padding: 0; z-index: 70; }
    .modal { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; z-index: 80; }
    .modal[hidden], #modalBackdrop[hidden] { display: none !important; }
    .modalPanel { width: min(100%, 520px); max-height: min(90vh, 720px); overflow: auto; background: rgba(8, 16, 24, 0.98); border: 1px solid var(--border); border-radius: 20px; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.45); padding: 18px; }
    .modalHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .modalHeader h2 { margin: 0; font-size: 18px; }
    #hoverTooltip { position: fixed; z-index: 120; max-width: min(72vw, 640px); padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(96, 165, 250, 0.35); background: rgba(8, 16, 24, 0.96); color: var(--text); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; box-shadow: 0 14px 32px rgba(2, 6, 23, 0.42); pointer-events: none; }
    #hoverTooltip[hidden] { display: none !important; }
    @media (max-width: 980px) {
      #app { grid-template-columns: 1fr; transition: none; }
      body[data-sidebar-open="false"] #app { grid-template-columns: 1fr; }
      #sidebarClose { display: inline-flex; align-items: center; justify-content: center; }
      #sidebarBackdrop { display: block; position: fixed; inset: 0; background: rgba(2, 6, 23, 0.62); border: 0; padding: 0; opacity: 0; pointer-events: none; transition: opacity 160ms ease; z-index: 30; }
      body[data-sidebar-open="true"] #sidebarBackdrop { opacity: 1; pointer-events: auto; }
      #sidebar { position: fixed; top: 0; left: 0; bottom: 0; width: min(88vw, 360px); z-index: 40; border-right: 1px solid var(--border); transform: translateX(-100%); transition: transform 160ms ease; box-shadow: 0 20px 45px rgba(0, 0, 0, 0.38); opacity: 1; padding-left: 16px; padding-right: 16px; }
      body[data-sidebar-open="true"] #sidebar { transform: translateX(0); }
      #composer { display: flex; }
      #composerKeys { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .modal { padding: 16px; align-items: flex-end; }
      .modalPanel { width: 100%; max-height: 86vh; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
    }
  </style>
</head>
<body data-sidebar-open="true">
  <button id="sidebarBackdrop" type="button" aria-label="Close sidebar" hidden></button>
  <button id="modalBackdrop" type="button" aria-label="Close modal" hidden></button>
  <div id="app">
    <aside id="sidebar">
      <div id="sidebarHeader">
        <h1 id="sidebarTitle">tmux fleet</h1>
        <button id="sidebarClose" class="iconButton" type="button" aria-label="Close sidebar">✕</button>
      </div>
      <div class="sidebarTabs" role="tablist" aria-label="Sidebar tabs">
        <button class="sidebarTab active" id="tabServers" type="button" role="tab" aria-selected="true" aria-controls="serversPanel" data-tab="servers">Servers</button>
        <button class="sidebarTab" id="tabSessions" type="button" role="tab" aria-selected="false" aria-controls="sessionsPanel" data-tab="sessions">Sessions</button>
      </div>
      <section id="serversPanel" class="tabPanel" role="tabpanel" aria-labelledby="tabServers">
        <div class="section sidebarScrollSection">
          <div class="sectionHeader">
            <h2>Backend Servers</h2>
            <button id="openBackendCreate" type="button">Add Server</button>
          </div>
          <div id="backendList" class="list cmuxList listScroll"></div>
        </div>
      </section>
      <section id="sessionsPanel" class="tabPanel" role="tabpanel" aria-labelledby="tabSessions" hidden>
        <div class="section sidebarScrollSection">
          <div class="sectionHeader">
            <h2>Sessions</h2>
            <button id="openSessionCreate" type="button">New Session</button>
          </div>
          <div id="sessionList" class="list cmuxList listScroll"></div>
        </div>
      </section>
    </aside>
    <main id="main">
      <div id="terminalBar">
        <div id="terminalBarLeft">
          <button id="sidebarToggle" class="iconButton" type="button" aria-label="Open sidebar">☰</button>
          <div>
            <div id="terminalTitle">No session selected</div>
            <div id="terminalStatus" class="muted">Select a session from the sidebar.</div>
          </div>
        </div>
        <div id="terminalBarRight">
          <div id="fontControls">
            <button id="fontSizeDecrease" class="iconButton" type="button" aria-label="Decrease terminal font size">−</button>
            <span id="fontSizeLabel">14px</span>
            <button id="fontSizeIncrease" class="iconButton" type="button" aria-label="Increase terminal font size">+</button>
          </div>
          <div><span id="connectionPill" class="pill offline">disconnected</span></div>
        </div>
      </div>
      <div id="terminalShell"><div id="terminal"></div></div>
      <div id="composer">
        <div id="composerKeys">
          <button class="composerKey" data-key="esc" type="button">Esc</button>
          <button class="composerKey" data-key="enter" type="button">Enter</button>
          <button class="composerKey" data-key="backspace" type="button">BS</button>
          <button class="composerKey" data-key="tab" type="button">Tab</button>
          <button class="composerKey" data-key="ctrl-c" type="button">Ctrl+C</button>
        </div>
        <div class="row">
          <input id="composerInput" type="text" placeholder="Send text to tmux and press Enter" autocomplete="off" />
          <button id="composerSend" type="button">Send</button>
        </div>
      </div>
    </main>
  </div>
  <div id="backendModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="backendModalTitle" hidden>
    <div class="modalPanel">
      <div class="modalHeader">
        <h2 id="backendModalTitle">Add Server</h2>
        <button class="iconButton" id="backendModalClose" type="button" aria-label="Close server modal">✕</button>
      </div>
      <form id="backendForm">
        <input type="hidden" id="backendId" />
        <div id="backendFormError" class="formError" hidden></div>
        <div class="field"><label for="backendName">Name</label><input id="backendName" required /></div>
        <div class="field"><label for="backendBaseUrl">Base URL</label><input id="backendBaseUrl" placeholder="http://host:8788" required /></div>
        <div class="field">
          <label for="backendAuthToken">Agent Token</label>
          <input id="backendAuthToken" type="password" placeholder="paste the token from the agent host" required />
          <div class="fieldHint">Read this from the agent file: <code>$DATA_DIR/backend/agent-auth-token</code></div>
        </div>
        <div class="row">
          <button type="submit" id="backendSubmit">Save Server</button>
          <button type="button" id="backendReset">Cancel</button>
        </div>
      </form>
    </div>
  </div>
  <div id="sessionModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="sessionModalTitle" hidden>
    <div class="modalPanel">
      <div class="modalHeader">
        <h2 id="sessionModalTitle">Create Session</h2>
        <button class="iconButton" id="sessionModalClose" type="button" aria-label="Close session modal">✕</button>
      </div>
      <form id="sessionForm">
        <input type="hidden" id="sessionEditingId" />
        <input type="hidden" id="sessionEditingBackendId" />
        <div id="sessionFormError" class="formError" hidden></div>
        <div class="field" id="sessionBackendField"><label for="sessionBackendId">Backend</label><select id="sessionBackendId" required></select></div>
        <div class="field" id="sessionPathField"><label for="sessionPath">Path</label><input id="sessionPath" placeholder="/absolute/path" required /></div>
        <div class="field"><label for="sessionName">Session Name</label><input id="sessionName" placeholder="optional" /></div>
        <div class="row">
          <button type="submit" id="sessionSubmit">Create Session</button>
          <button type="button" id="sessionReset">Cancel</button>
        </div>
      </form>
    </div>
  </div>
  <div id="confirmModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="confirmModalTitle" hidden>
    <div class="modalPanel">
      <div class="modalHeader">
        <h2 id="confirmModalTitle">Confirm Delete</h2>
        <button class="iconButton" id="confirmModalClose" type="button" aria-label="Close confirmation modal">✕</button>
      </div>
      <div id="confirmModalMessage" class="cmuxSecondary">Are you sure?</div>
      <div class="row" style="margin-top: 16px;">
        <button type="button" id="confirmModalSubmit" class="danger">Delete</button>
        <button type="button" id="confirmModalCancel">Cancel</button>
      </div>
    </div>
  </div>
  <div id="hoverTooltip" hidden></div>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
  <script>
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarClose = document.getElementById('sidebarClose');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');
    const modalBackdrop = document.getElementById('modalBackdrop');
    const sidebarTabs = document.querySelectorAll('.sidebarTab');
    const serversPanel = document.getElementById('serversPanel');
    const sessionsPanel = document.getElementById('sessionsPanel');
    const openBackendCreate = document.getElementById('openBackendCreate');
    const openSessionCreate = document.getElementById('openSessionCreate');
    const backendModal = document.getElementById('backendModal');
    const backendModalTitle = document.getElementById('backendModalTitle');
    const backendModalClose = document.getElementById('backendModalClose');
    const sessionModal = document.getElementById('sessionModal');
    const sessionModalTitle = document.getElementById('sessionModalTitle');
    const sessionModalClose = document.getElementById('sessionModalClose');
    const confirmModal = document.getElementById('confirmModal');
    const confirmModalMessage = document.getElementById('confirmModalMessage');
    const confirmModalClose = document.getElementById('confirmModalClose');
    const confirmModalSubmit = document.getElementById('confirmModalSubmit');
    const confirmModalCancel = document.getElementById('confirmModalCancel');
    const hoverTooltip = document.getElementById('hoverTooltip');
    const backendForm = document.getElementById('backendForm');
    const backendFormError = document.getElementById('backendFormError');
    const backendIdInput = document.getElementById('backendId');
    const backendNameInput = document.getElementById('backendName');
    const backendBaseUrlInput = document.getElementById('backendBaseUrl');
    const backendAuthTokenInput = document.getElementById('backendAuthToken');
    const backendSubmit = document.getElementById('backendSubmit');
    const backendResetButton = document.getElementById('backendReset');
    const backendList = document.getElementById('backendList');
    const sessionForm = document.getElementById('sessionForm');
    const sessionFormError = document.getElementById('sessionFormError');
    const sessionEditingId = document.getElementById('sessionEditingId');
    const sessionEditingBackendId = document.getElementById('sessionEditingBackendId');
    const sessionBackendField = document.getElementById('sessionBackendField');
    const sessionBackendId = document.getElementById('sessionBackendId');
    const sessionPathField = document.getElementById('sessionPathField');
    const sessionPathInput = document.getElementById('sessionPath');
    const sessionNameInput = document.getElementById('sessionName');
    const sessionSubmitButton = document.getElementById('sessionSubmit');
    const sessionResetButton = document.getElementById('sessionReset');
    const sessionList = document.getElementById('sessionList');
    const terminalTitle = document.getElementById('terminalTitle');
    const terminalStatus = document.getElementById('terminalStatus');
    const fontSizeDecrease = document.getElementById('fontSizeDecrease');
    const fontSizeIncrease = document.getElementById('fontSizeIncrease');
    const fontSizeLabel = document.getElementById('fontSizeLabel');
    const connectionPill = document.getElementById('connectionPill');
    const composerInput = document.getElementById('composerInput');
    const composerSend = document.getElementById('composerSend');
    const composerKeys = document.querySelectorAll('.composerKey');
    const state = { backends: [], sessions: [], activeBackendId: '', activeSessionId: '', activeSidebarTab: 'servers', sidebarOpen: true, terminalFontSize: 14, socket: null, confirmAction: null };

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, Consolas, monospace',
      fontSize: 14,
      scrollback: 5000,
      theme: { background: '#091018', foreground: '#e5edf7' }
    });
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById('terminal'));
    fitAddon.fit();
    protectSensitiveInput(backendAuthTokenInput);

    function applyTerminalFontSize(nextFontSize) {
      state.terminalFontSize = Math.max(10, Math.min(24, nextFontSize));
      term.options.fontSize = state.terminalFontSize;
      fontSizeLabel.textContent = state.terminalFontSize + 'px';
      fitAddon.fit();
      if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    }

    function isMobileLayout() {
      return window.matchMedia('(max-width: 980px)').matches;
    }

    function setSidebarOpen(open) {
      state.sidebarOpen = open;
      document.body.dataset.sidebarOpen = open ? 'true' : 'false';
      sidebarBackdrop.hidden = !(open && isMobileLayout());
    }

    function closeModal() {
      resetSessionForm();
      backendModal.hidden = true;
      sessionModal.hidden = true;
      confirmModal.hidden = true;
      modalBackdrop.hidden = true;
      state.confirmAction = null;
    }

    function openBackendModal(mode, backendState) {
      resetBackendForm();
      const isEdit = mode === 'edit';
      backendModalTitle.textContent = isEdit ? 'Edit Server' : 'Add Server';
      backendAuthTokenInput.required = !isEdit;
      if (backendState) {
        backendIdInput.value = backendState.backend.id;
        backendNameInput.value = backendState.backend.name;
        backendBaseUrlInput.value = backendState.backend.baseUrl;
        backendAuthTokenInput.value = backendState.backend.authToken || '';
        backendAuthTokenInput.placeholder = 'agent token';
      } else {
        backendAuthTokenInput.placeholder = 'paste the token from the agent host';
      }
      backendModal.hidden = false;
      sessionModal.hidden = true;
      modalBackdrop.hidden = false;
      backendNameInput.focus();
    }

    function openSessionModal(mode, session) {
      const isEdit = mode === 'edit';
      resetSessionForm();
      sessionEditingId.value = session ? session.id : '';
      sessionEditingBackendId.value = session ? session.backendId : '';
      sessionModalTitle.textContent = isEdit ? 'Edit Session' : 'Create Session';
      sessionSubmitButton.textContent = isEdit ? 'Save Session' : 'Create Session';
      sessionBackendField.hidden = isEdit;
      sessionPathField.hidden = isEdit;
      sessionBackendId.disabled = isEdit;
      sessionPathInput.disabled = isEdit;
      sessionNameInput.required = isEdit;
      sessionPathInput.value = '';
      sessionNameInput.value = session ? session.tmuxSessionName : '';
      renderBackendOptions();
      if (session) {
        sessionBackendId.value = session.backendId;
        sessionPathInput.value = session.requestedPath;
      }
      sessionModal.hidden = false;
      backendModal.hidden = true;
      confirmModal.hidden = true;
      modalBackdrop.hidden = false;
      sessionNameInput.focus();
    }

    function openConfirmModal(message, onConfirm) {
      backendModal.hidden = true;
      sessionModal.hidden = true;
      confirmModal.hidden = false;
      modalBackdrop.hidden = false;
      confirmModalMessage.textContent = message;
      state.confirmAction = onConfirm;
    }

    function setSidebarTab(tab) {
      state.activeSidebarTab = tab === 'sessions' ? 'sessions' : 'servers';
      sidebarTabs.forEach((button) => {
        const active = button.dataset.tab === state.activeSidebarTab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      serversPanel.hidden = state.activeSidebarTab !== 'servers';
      sessionsPanel.hidden = state.activeSidebarTab !== 'sessions';
    }

    function syncResponsiveLayout() {
      setSidebarOpen(state.sidebarOpen);
    }

    function showHoverTooltip(text, clientX, clientY) {
      if (!text) {
        return;
      }
      hoverTooltip.textContent = text;
      hoverTooltip.hidden = false;
      moveHoverTooltip(clientX, clientY);
    }

    function moveHoverTooltip(clientX, clientY) {
      if (hoverTooltip.hidden) {
        return;
      }
      const offset = 14;
      const maxLeft = window.innerWidth - hoverTooltip.offsetWidth - 12;
      const maxTop = window.innerHeight - hoverTooltip.offsetHeight - 12;
      const left = Math.max(12, Math.min(clientX + offset, maxLeft));
      const top = Math.max(12, Math.min(clientY + offset, maxTop));
      hoverTooltip.style.left = left + 'px';
      hoverTooltip.style.top = top + 'px';
    }

    function hideHoverTooltip() {
      hoverTooltip.hidden = true;
      hoverTooltip.textContent = '';
    }

    function attachHoverTooltip(element, text) {
      if (!text) {
        return;
      }
      element.classList.add('tooltipTarget');
      element.addEventListener('mouseenter', (event) => {
        showHoverTooltip(text, event.clientX, event.clientY);
      });
      element.addEventListener('mousemove', (event) => {
        moveHoverTooltip(event.clientX, event.clientY);
      });
      element.addEventListener('mouseleave', () => {
        hideHoverTooltip();
      });
    }

    function formatRelativeTime(input) {
      if (!input) {
        return 'unknown';
      }
      const target = Date.parse(input);
      if (!Number.isFinite(target)) {
        return 'unknown';
      }
      const diffMs = Math.max(0, Date.now() - target);
      const diffSeconds = Math.floor(diffMs / 1000);
      if (diffSeconds < 10) {
        return 'just now';
      }
      if (diffSeconds < 60) {
        return diffSeconds + 's ago';
      }
      const diffMinutes = Math.floor(diffSeconds / 60);
      if (diffMinutes < 60) {
        return diffMinutes + 'm ago';
      }
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) {
        return diffHours + 'h ago';
      }
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) {
        return diffDays + 'd ago';
      }
      const diffWeeks = Math.floor(diffDays / 7);
      if (diffWeeks < 5) {
        return diffWeeks + 'w ago';
      }
      const diffMonths = Math.floor(diffDays / 30);
      if (diffMonths < 12) {
        return diffMonths + 'mo ago';
      }
      return Math.floor(diffDays / 365) + 'y ago';
    }

    function buildSessionPathSummary(session) {
      const requestedPath = (session.requestedPath || '').trim();
      const currentPath = (session.currentPath || '').trim();
      if (!currentPath || currentPath === requestedPath) {
        return requestedPath;
      }
      return requestedPath + ' · cwd ' + currentPath;
    }

    function setConnectionState(connected, text) {
      connectionPill.textContent = text;
      connectionPill.className = 'pill ' + (connected ? 'online' : 'offline');
    }

    async function api(path, init) {
      const response = await fetch(path, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(init && init.headers ? init.headers : {}),
        },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(payload.error || response.statusText);
      }
      if (response.status === 204) {
        return null;
      }
      return response.json();
    }

    function resetBackendForm() {
      backendIdInput.value = '';
      backendNameInput.value = '';
      backendBaseUrlInput.value = '';
      backendAuthTokenInput.value = '';
      backendAuthTokenInput.required = true;
      backendAuthTokenInput.placeholder = 'paste the token from the agent host';
      backendFormError.hidden = true;
      backendFormError.textContent = '';
      backendSubmit.textContent = 'Save Server';
      backendSubmit.disabled = false;
    }

    function protectSensitiveInput(input) {
      const blockedClipboardEvents = ['copy', 'cut', 'dragstart', 'contextmenu'];
      blockedClipboardEvents.forEach((eventName) => {
        input.addEventListener(eventName, (event) => {
          event.preventDefault();
        });
      });
      input.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        if ((event.ctrlKey || event.metaKey) && (key === 'c' || key === 'x')) {
          event.preventDefault();
        }
      });
    }

    function resetSessionForm() {
      sessionEditingId.value = '';
      sessionEditingBackendId.value = '';
      sessionBackendField.hidden = false;
      sessionPathField.hidden = false;
      sessionBackendId.disabled = false;
      sessionPathInput.disabled = false;
      sessionPathInput.value = '';
      sessionNameInput.value = '';
      sessionNameInput.required = false;
      sessionSubmitButton.textContent = 'Create Session';
      sessionModalTitle.textContent = 'Create Session';
      sessionFormError.hidden = true;
      sessionFormError.textContent = '';
      sessionSubmitButton.disabled = false;
    }

    function renderBackendOptions() {
      const previousValue = sessionBackendId.value;
      sessionBackendId.replaceChildren();
      for (const backendState of state.backends) {
        const option = document.createElement('option');
        option.value = backendState.backend.id;
        option.textContent = backendState.backend.name + (backendState.online ? '' : ' (offline)');
        option.disabled = !backendState.online;
        option.selected = option.value === previousValue;
        sessionBackendId.appendChild(option);
      }
      if (!sessionBackendId.value) {
        const firstEnabled = Array.from(sessionBackendId.options).find((option) => !option.disabled);
        if (firstEnabled) {
          sessionBackendId.value = firstEnabled.value;
        }
      }
    }

    function renderBackends() {
      backendList.replaceChildren();
      for (const backendState of state.backends) {
        const item = document.createElement('div');
        item.className = 'item cmuxItem';
        const row = document.createElement('div');
        row.className = 'cmuxRow';
        const main = document.createElement('div');
        main.className = 'cmuxMain';
        const primary = document.createElement('div');
        primary.className = 'cmuxPrimary';
        const statusDot = document.createElement('span');
        statusDot.className = 'statusDot ' + (backendState.online ? 'online' : 'offline');
        const title = document.createElement('span');
        title.textContent = backendState.backend.name;
        const tag = document.createElement('span');
        tag.className = 'inlineTag';
        tag.textContent = backendState.online ? 'online' : 'offline';
        primary.append(statusDot, title, tag);
        const secondary = document.createElement('div');
        secondary.className = 'cmuxSecondary';
        secondary.textContent = backendState.backend.baseUrl;
        const tertiary = document.createElement('div');
        tertiary.className = 'cmuxTertiary';
        tertiary.textContent = backendState.error
          ? backendState.error
          : (backendState.health?.serverName || 'reachable backend') + ' · socket ' + (backendState.health?.tmuxSocketName || '-');
        main.append(primary, secondary, tertiary);
        const actions = document.createElement('div');
        actions.className = 'cmuxActions';
        const editButton = document.createElement('button');
        editButton.textContent = 'Edit';
        editButton.addEventListener('click', () => {
          setSidebarTab('servers');
          if (isMobileLayout()) {
            setSidebarOpen(true);
          }
          openBackendModal('edit', backendState);
        });
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'danger';
        deleteButton.addEventListener('click', (event) => {
          event.stopPropagation();
          openConfirmModal('Delete server "' + backendState.backend.name + '"?', async () => {
            await api('/api/backends/' + encodeURIComponent(backendState.backend.id), { method: 'DELETE' });
            if (state.activeBackendId === backendState.backend.id) {
              closeTerminal();
            }
            closeModal();
            await loadState();
          });
        });
        actions.append(editButton, deleteButton);
        row.append(main, actions);
        item.append(row);
        backendList.appendChild(item);
      }
    }

    function openTerminal(session) {
      closeTerminal(false);
      setSidebarTab('sessions');
      if (isMobileLayout()) {
        setSidebarOpen(false);
      }
      state.activeBackendId = session.backendId;
      state.activeSessionId = session.id;
      renderSessions();
      terminalTitle.textContent = session.tmuxSessionName;
      terminalStatus.textContent = session.backendName + ' · ' + session.requestedPath;
      setConnectionState(false, 'connecting');
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = proto + '//' + location.host + '/ws/terminal?backendId=' + encodeURIComponent(session.backendId) + '&sessionId=' + encodeURIComponent(session.id);
      const socket = new WebSocket(url);
      state.socket = socket;
      term.clear();
      socket.addEventListener('open', () => {
        setConnectionState(true, 'connected');
        socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      });
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'data') {
          term.write(message.data || '');
        } else if (message.type === 'error') {
          terminalStatus.textContent = message.message || 'terminal error';
          setConnectionState(false, 'error');
        } else if (message.type === 'exit') {
          terminalStatus.textContent = 'Session detached';
          setConnectionState(false, 'disconnected');
        }
      });
      socket.addEventListener('close', () => {
        if (state.socket === socket) {
          setConnectionState(false, 'disconnected');
          state.socket = null;
        }
      });
    }

    function closeTerminal(clearSelection = true) {
      if (state.socket) {
        try { state.socket.close(); } catch {}
        state.socket = null;
      }
      if (clearSelection) {
        state.activeBackendId = '';
        state.activeSessionId = '';
      }
      renderSessions();
      setConnectionState(false, 'disconnected');
    }

    function renderSessions() {
      sessionList.replaceChildren();
      for (const session of state.sessions) {
        const item = document.createElement('div');
        item.className = 'item cmuxItem' + (state.activeSessionId === session.id ? ' active' : '');
        item.addEventListener('click', () => openTerminal(session));
        const row = document.createElement('div');
        row.className = 'cmuxRow';
        const main = document.createElement('div');
        main.className = 'cmuxMain';
        const primary = document.createElement('div');
        primary.className = 'cmuxPrimary';
        const statusDot = document.createElement('span');
        statusDot.className = 'statusDot ' + (session.status === 'running' ? 'online' : 'warning');
        const title = document.createElement('span');
        title.textContent = session.tmuxSessionName;
        primary.append(statusDot, title);
        const serverTagRow = document.createElement('div');
        serverTagRow.className = 'cmuxBadgeRow';
        const serverTag = document.createElement('span');
        serverTag.className = 'inlineTag';
        serverTag.textContent = session.backendName;
        const activityTag = document.createElement('span');
        activityTag.className = 'inlineTag';
        activityTag.textContent = formatRelativeTime(session.lastActivityAt || session.createdAt);
        serverTagRow.append(serverTag, activityTag);
        const tertiary = document.createElement('div');
        tertiary.className = 'cmuxTertiary';
        const fullPathSummary = buildSessionPathSummary(session);
        tertiary.textContent = fullPathSummary;
        attachHoverTooltip(tertiary, fullPathSummary);
        main.append(primary, serverTagRow, tertiary);
        const actions = document.createElement('div');
        actions.className = 'cmuxActions';
        const editButton = document.createElement('button');
        editButton.textContent = 'Edit';
        editButton.addEventListener('click', (event) => {
          event.stopPropagation();
          openSessionModal('edit', session);
        });
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'danger';
        deleteButton.addEventListener('click', (event) => {
          event.stopPropagation();
          openConfirmModal('Delete session "' + session.tmuxSessionName + '"?', async () => {
            await api('/api/sessions/' + encodeURIComponent(session.backendId) + '/' + encodeURIComponent(session.id), { method: 'DELETE' });
            if (state.activeSessionId === session.id) {
              closeTerminal();
            }
            closeModal();
            await loadState();
          });
        });
        actions.append(editButton, deleteButton);
        row.append(main, actions);
        item.append(row);
        sessionList.appendChild(item);
      }
    }

    async function loadState() {
      const payload = await api('/api/state');
      state.backends = payload.backends;
      state.sessions = payload.sessions;
      renderBackends();
      renderBackendOptions();
      renderSessions();
    }

    backendForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      backendFormError.hidden = true;
      backendFormError.textContent = '';
      backendSubmit.disabled = true;
      backendSubmit.textContent = 'Saving...';
      try {
        const body = JSON.stringify({
          name: backendNameInput.value,
          baseUrl: backendBaseUrlInput.value,
          ...(backendAuthTokenInput.value ? { authToken: backendAuthTokenInput.value } : {}),
        });
        const backendId = backendIdInput.value.trim();
        if (backendId) {
          await api('/api/backends/' + encodeURIComponent(backendId), { method: 'PUT', body });
        } else {
          await api('/api/backends', { method: 'POST', body });
        }
        resetBackendForm();
        closeModal();
        await loadState();
      } catch (error) {
        backendFormError.textContent = String(error);
        backendFormError.hidden = false;
      } finally {
        backendSubmit.disabled = false;
        backendSubmit.textContent = 'Save Server';
      }
    });

    backendResetButton.addEventListener('click', () => {
      resetBackendForm();
      closeModal();
    });

    sessionForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setSidebarTab('sessions');
      sessionFormError.hidden = true;
      sessionFormError.textContent = '';
      sessionSubmitButton.disabled = true;
      sessionSubmitButton.textContent = sessionEditingId.value ? 'Saving...' : 'Creating...';
      try {
        if (sessionEditingId.value && sessionEditingBackendId.value) {
          await api(
            '/api/sessions/' + encodeURIComponent(sessionEditingBackendId.value) + '/' + encodeURIComponent(sessionEditingId.value),
            {
              method: 'PUT',
              body: JSON.stringify({
                sessionName: sessionNameInput.value,
              }),
            },
          );
        } else {
          await api('/api/sessions', {
            method: 'POST',
            body: JSON.stringify({
              backendId: sessionBackendId.value,
              path: sessionPathInput.value,
              sessionName: sessionNameInput.value,
            }),
          });
        }
        resetSessionForm();
        closeModal();
        await loadState();
      } catch (error) {
        sessionFormError.textContent = String(error);
        sessionFormError.hidden = false;
      } finally {
        sessionSubmitButton.disabled = false;
        sessionSubmitButton.textContent = sessionEditingId.value ? 'Save Session' : 'Create Session';
      }
    });

    sessionResetButton.addEventListener('click', () => {
      resetSessionForm();
      closeModal();
    });

    sidebarToggle.addEventListener('click', () => {
      setSidebarOpen(!state.sidebarOpen);
    });

    sidebarClose.addEventListener('click', () => setSidebarOpen(false));
    sidebarBackdrop.addEventListener('click', () => setSidebarOpen(false));
    modalBackdrop.addEventListener('click', () => closeModal());
    backendModalClose.addEventListener('click', () => closeModal());
    sessionModalClose.addEventListener('click', () => {
      resetSessionForm();
      closeModal();
    });
    confirmModalClose.addEventListener('click', () => closeModal());
    confirmModalCancel.addEventListener('click', () => closeModal());
    confirmModalSubmit.addEventListener('click', async () => {
      const action = state.confirmAction;
      if (!action) {
        closeModal();
        return;
      }
      await action();
    });
    openBackendCreate.addEventListener('click', () => {
      setSidebarTab('servers');
      openBackendModal('create');
    });
    openSessionCreate.addEventListener('click', () => {
      setSidebarTab('sessions');
      openSessionModal('create');
    });
    sidebarTabs.forEach((button) => {
      button.addEventListener('click', () => {
        setSidebarTab(button.dataset.tab);
      });
    });

    term.onData((data) => {
      if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({ type: 'input', data }));
      }
    });

    term.onResize(({ cols, rows }) => {
      if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    composerSend.addEventListener('click', () => {
      if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      const value = composerInput.value.trimEnd();
      if (!value) {
        return;
      }
      state.socket.send(JSON.stringify({ type: 'sendText', data: value }));
      composerInput.value = '';
    });

    composerInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        composerSend.click();
      }
    });

    composerKeys.forEach((button) => {
      button.addEventListener('click', () => {
        if (state.socket && state.socket.readyState === WebSocket.OPEN) {
          state.socket.send(JSON.stringify({ type: 'sendKey', data: button.dataset.key }));
        }
      });
    });

    fontSizeDecrease.addEventListener('click', () => {
      applyTerminalFontSize(state.terminalFontSize - 1);
    });

    fontSizeIncrease.addEventListener('click', () => {
      applyTerminalFontSize(state.terminalFontSize + 1);
    });

    window.addEventListener('resize', () => {
      syncResponsiveLayout();
      fitAddon.fit();
      if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (!backendModal.hidden || !sessionModal.hidden) {
          closeModal();
          return;
        }
        if (isMobileLayout() && document.body.dataset.sidebarOpen === 'true') {
          setSidebarOpen(false);
        }
      }
    });

    state.sidebarOpen = !isMobileLayout();
    setSidebarTab('servers');
    applyTerminalFontSize(state.terminalFontSize);
    syncResponsiveLayout();
    loadState().catch((error) => {
      terminalStatus.textContent = String(error);
    });
    setInterval(() => { void loadState(); }, 5000);
  </script>
</body>
</html>`;
}

export function createWebServer(config: AppConfig, store: BackendRegistryStore) {
  const relayLogPath = path.join(config.centralDataDir, 'relay-log.jsonl');
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
        const relayRequest = normalizeRelaySendTextRequest(body);
        const targetBackend = getBackendByName(store, relayRequest.targetBackendName);
        if (!targetBackend) {
          sendJson(res, 404, { error: `Unknown backend name: ${relayRequest.targetBackendName}` });
          return;
        }
        const sourceBackend = getBackendByName(store, relayRequest.sourceBackendName);
        const payload = await fetchJson<{ ok: true }>(
          targetBackend,
          `/api/sessions/by-name/${encodeURIComponent(relayRequest.targetSessionName)}/send-text`,
          {
            method: 'POST',
            body: JSON.stringify({ text: relayRequest.text }),
          },
        );
        appendJsonLine(relayLogPath, {
          timestamp: new Date().toISOString(),
          sourceBackendName: sourceBackend?.name || relayRequest.sourceBackendName,
          sourceSessionName: relayRequest.sourceSessionName,
          targetBackendId: targetBackend.id,
          targetBackendName: targetBackend.name,
          targetSessionName: relayRequest.targetSessionName,
          text: relayRequest.text,
        });
        sendJson(res, 200, payload);
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
