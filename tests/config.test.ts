import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { getConfig, getUsageText, resolveRunMode } from '../src/config.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('resolveRunMode', () => {
  it('defaults to main', () => {
    expect(resolveRunMode([])).toBe('main');
  });

  it('supports sub mode', () => {
    expect(resolveRunMode(['sub'])).toBe('sub');
  });
});

describe('getConfig', () => {
  it('defaults main and backend bind hosts to 0.0.0.0 for LAN access', () => {
    delete process.env['HOST'];
    delete process.env['BACKEND_HOST'];
    delete process.env['PORT'];
    delete process.env['BACKEND_PORT'];
    delete process.env['TMUX_SOCKET_MODE'];
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfw-config-default-'));
    process.env['DATA_DIR'] = dataDir;
    process.env['ALLOWED_PROJECT_ROOTS'] = dataDir;

    const config = getConfig(['main']);

    expect(config.host).toBe('0.0.0.0');
    expect(config.backendHost).toBe('0.0.0.0');
    expect(config.tmuxSocketMode).toBe('default');
  });

  it('builds separate central and backend data directories', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfw-config-'));
    process.env['DATA_DIR'] = dataDir;
    process.env['ALLOWED_PROJECT_ROOTS'] = dataDir;
    const config = getConfig(['main']);

    expect(config.centralDataDir).toBe(path.join(dataDir, 'central'));
    expect(config.backendDataDir).toBe(path.join(dataDir, 'backend'));
    expect(fs.existsSync(config.centralDataDir)).toBe(true);
    expect(fs.existsSync(config.backendDataDir)).toBe(true);
  });
});

describe('getUsageText', () => {
  it('documents main and sub modes', () => {
    expect(getUsageText()).toContain('main');
    expect(getUsageText()).toContain('sub');
  });
});
