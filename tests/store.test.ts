import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BackendRegistryStore, ManagedSessionStore } from '../src/store.js';

describe('BackendRegistryStore', () => {
  it('persists backend records across instances', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tfw-backends-'));
    const store = new BackendRegistryStore(root);
    const created = store.save({
      name: 'local',
      baseUrl: 'http://127.0.0.1:8788',
      authToken: 'secret',
    });

    const reloaded = new BackendRegistryStore(root);
    expect(reloaded.getById(created.id)?.baseUrl).toBe('http://127.0.0.1:8788');
  });

  it('rejects duplicate backend names regardless of case', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tfw-backends-unique-'));
    const store = new BackendRegistryStore(root);

    store.save({
      name: 'Mac Mini',
      baseUrl: 'http://127.0.0.1:8788',
      authToken: 'secret',
    });

    expect(() =>
      store.save({
        name: 'mac mini',
        baseUrl: 'http://127.0.0.1:9797',
        authToken: 'secret-2',
      }),
    ).toThrow(/Backend name already exists/);
  });

  it('allows updating an existing backend without tripping the unique-name check', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tfw-backends-update-'));
    const store = new BackendRegistryStore(root);
    const created = store.save({
      name: 'local',
      baseUrl: 'http://127.0.0.1:8788',
      authToken: 'secret',
    });

    const updated = store.save({
      id: created.id,
      name: 'LOCAL',
      baseUrl: 'http://127.0.0.1:9898',
      authToken: 'secret-2',
    });

    expect(updated.id).toBe(created.id);
    expect(updated.baseUrl).toBe('http://127.0.0.1:9898');
  });
});

describe('ManagedSessionStore', () => {
  it('creates updates and removes session metadata', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tfw-sessions-'));
    const store = new ManagedSessionStore(root);
    const created = store.create({
      tmuxSessionName: 'sess-1',
      requestedPath: '/tmp/project',
      currentPath: '/tmp/project',
    });
    expect(store.all()).toHaveLength(1);

    store.update({ ...created, currentPath: '/tmp/project/src' });
    expect(store.getById(created.id)?.currentPath).toBe('/tmp/project/src');

    expect(store.remove(created.id)).toBe(true);
    expect(store.all()).toHaveLength(0);
  });
});
