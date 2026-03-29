import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ensureExecutableFile,
  getNodePtySpawnHelperCandidates,
  resolveNodePtySpawnHelperPath,
} from '../src/pty.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('pty helper utilities', () => {
  it('adds execute bits to a helper file when they are missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pty-helper-test-'));
    tempDirs.push(dir);
    const helperPath = path.join(dir, 'spawn-helper');
    fs.writeFileSync(helperPath, '#!/bin/sh\n', { mode: 0o644 });

    ensureExecutableFile(helperPath);

    expect(fs.statSync(helperPath).mode & 0o777).toBe(0o755);
  });

  it('prefers the prebuilt helper path when build outputs are absent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pty-helper-test-'));
    tempDirs.push(dir);
    const helperPath = path.join(dir, 'prebuilds', 'darwin-arm64', 'spawn-helper');
    fs.mkdirSync(path.dirname(helperPath), { recursive: true });
    fs.writeFileSync(helperPath, '');

    expect(resolveNodePtySpawnHelperPath(dir, 'darwin', 'arm64')).toBe(helperPath);
    expect(getNodePtySpawnHelperCandidates(dir, 'darwin', 'arm64')).toContain(helperPath);
  });
});
