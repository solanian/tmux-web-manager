import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildManagedSessionName,
  buildManagedTmuxConfigContents,
  isNoServerRunningError,
  splitInput,
  validateProjectPath,
} from '../src/tmux.js';

describe('validateProjectPath', () => {
  it('accepts a directory under an allowed root and creates missing paths', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tfw-root-'));
    const target = path.join(root, 'nested', 'project');
    const resolved = validateProjectPath(target, [root]);
    expect(resolved).toBe(fs.realpathSync(target));
  });

  it('accepts a path under an allowed root even when the allowlist root does not exist yet', () => {
    const root = path.join(os.tmpdir(), `tfw-missing-root-${Date.now()}`);
    const target = path.join(root, 'project');
    const resolved = validateProjectPath(target, [root]);
    expect(resolved).toBe(fs.realpathSync(target));
  });

  it('rejects directories outside allowed roots', () => {
    const allowed = fs.mkdtempSync(path.join(os.tmpdir(), 'tfw-allowed-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'tfw-outside-'));
    expect(() => validateProjectPath(outside, [allowed])).toThrow(/outside allowed roots/);
  });
});

describe('buildManagedTmuxConfigContents', () => {
  it('enables mouse mode and sources the configured oh-my-tmux path', () => {
    const contents = buildManagedTmuxConfigContents('/opt/oh-my-tmux/.tmux.conf');
    expect(contents).toContain('source-file');
    expect(contents).toContain('set -g mouse on');
  });
});

describe('buildManagedSessionName', () => {
  it('uses the optional requested session name when provided', () => {
    expect(buildManagedSessionName('fleet', 'abc123456', 'my session')).toBe('my-session');
  });
});

describe('splitInput', () => {
  it('maps control characters and literal chunks', () => {
    expect(splitInput('hi\r\u0003')).toEqual([
      { type: 'literal', value: 'hi' },
      { type: 'key', value: 'Enter' },
      { type: 'key', value: 'C-c' },
    ]);
  });
});

describe('isNoServerRunningError', () => {
  it('treats missing tmux socket connection errors as an empty-server condition', () => {
    expect(
      isNoServerRunningError(
        new Error('error connecting to /tmp/tmux-1000/tmux-web-manager-main-run (No such file or directory)'),
      ),
    ).toBe(true);
  });
});
