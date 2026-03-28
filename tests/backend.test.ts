import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  appendEnter,
  mergeDiscoveredSessions,
  pruneHiddenSessions,
  sortSessionsByRecentActivity,
} from '../src/backend.js';
import { ManagedSessionStore } from '../src/store.js';

describe('mergeDiscoveredSessions', () => {
  it('imports tmux sessions that already exist on the agent socket', () => {
    const merged = mergeDiscoveredSessions(
      [
        {
          id: 'known-1',
          tmuxSessionName: 'alpha',
          requestedPath: '/workspace/alpha',
          currentPath: '/workspace/alpha',
          status: 'running',
          createdAt: '2026-03-28T00:00:00.000Z',
        },
      ],
      [
        {
          tmuxSessionName: 'alpha',
          currentPath: '/workspace/alpha',
          createdAt: '2026-03-28T00:00:00.000Z',
        },
        {
          tmuxSessionName: 'beta',
          currentPath: '/workspace/beta',
          createdAt: '2026-03-28T01:00:00.000Z',
        },
      ],
    );

    expect(merged).toHaveLength(2);
    expect(merged[0]?.id).toBe('known-1');
    expect(merged[1]?.tmuxSessionName).toBe('beta');
    expect(merged[1]?.requestedPath).toBe('/workspace/beta');
    expect(merged[1]?.currentPath).toBe('/workspace/beta');
    expect(merged[1]?.status).toBe('running');
    expect(merged[1]?.createdAt).toBe('2026-03-28T01:00:00.000Z');
  });
});

describe('pruneHiddenSessions', () => {
  it('removes stopped sessions from both returned results and the store', () => {
    const store = new ManagedSessionStore(fs.mkdtempSync(path.join(os.tmpdir(), 'tfw-backend-prune-')));
    const running = store.create({
      tmuxSessionName: 'running',
      requestedPath: '/workspace/running',
      currentPath: '/workspace/running',
      status: 'running',
    });
    const stopped = store.create({
      tmuxSessionName: 'stopped',
      requestedPath: '/workspace/stopped',
      currentPath: '/workspace/stopped',
      status: 'stopped',
    });

    const visible = pruneHiddenSessions(store, [running, stopped]);

    expect(visible).toHaveLength(1);
    expect(visible[0]?.tmuxSessionName).toBe('running');
    expect(store.getById(stopped.id)).toBeUndefined();
  });
});

describe('sortSessionsByRecentActivity', () => {
  it('orders sessions by last activity descending', () => {
    const sessions = sortSessionsByRecentActivity([
      {
        id: '1',
        tmuxSessionName: 'older',
        requestedPath: '/workspace/older',
        currentPath: '/workspace/older',
        status: 'running',
        createdAt: '2026-03-28T00:00:00.000Z',
        lastActivityAt: '2026-03-28T00:05:00.000Z',
      },
      {
        id: '2',
        tmuxSessionName: 'newer',
        requestedPath: '/workspace/newer',
        currentPath: '/workspace/newer',
        status: 'running',
        createdAt: '2026-03-28T00:00:00.000Z',
        lastActivityAt: '2026-03-28T00:10:00.000Z',
      },
    ]);

    expect(sessions.map((session) => session.tmuxSessionName)).toEqual(['newer', 'older']);
  });
});

describe('appendEnter', () => {
  it('appends an Enter keystroke to submitted text payloads', () => {
    expect(appendEnter('test')).toBe('test\r');
  });
});
