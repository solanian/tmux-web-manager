import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  applyDerivedPaneLabels,
  buildUtf8LocaleEnv,
  buildDerivedPaneLabel,
  buildManagedSessionName,
  buildManagedTmuxConfigContents,
  isNoServerRunningError,
  resolveUtf8Locale,
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

describe('resolveUtf8Locale', () => {
  it('preserves an existing UTF-8 locale', () => {
    expect(resolveUtf8Locale({ LANG: 'ko_KR.UTF-8' })).toBe('ko_KR.UTF-8');
  });

  it('upgrades a locale without an encoding suffix to UTF-8', () => {
    expect(resolveUtf8Locale({ LANG: 'ko_KR' })).toBe('ko_KR.UTF-8');
  });

  it('falls back to en_US.UTF-8 when no usable locale is present', () => {
    expect(resolveUtf8Locale({ LC_ALL: 'C' })).toBe('en_US.UTF-8');
  });
});

describe('buildUtf8LocaleEnv', () => {
  it('forces LANG, LC_ALL, and LC_CTYPE to UTF-8 while preserving unrelated vars', () => {
    expect(
      buildUtf8LocaleEnv({
        LANG: 'ko_KR',
        TERM: 'tmux-256color',
      }),
    ).toMatchObject({
      LANG: 'ko_KR.UTF-8',
      LC_ALL: 'ko_KR.UTF-8',
      LC_CTYPE: 'ko_KR.UTF-8',
      TERM: 'tmux-256color',
    });
  });
});

describe('buildDerivedPaneLabel', () => {
  it('builds a session-based suffix label', () => {
    expect(buildDerivedPaneLabel('build session', 2)).toBe('build-session-2');
  });
});

describe('applyDerivedPaneLabels', () => {
  it('fills missing pane labels using session-name suffixes while preserving explicit labels', () => {
    expect(
      applyDerivedPaneLabels([
        {
          paneId: '%3',
          sessionName: 'build',
          windowIndex: 1,
          paneIndex: 0,
          currentPath: '/workspace/build',
          currentCommand: 'bash',
          title: '',
          label: '',
        },
        {
          paneId: '%1',
          sessionName: 'build',
          windowIndex: 0,
          paneIndex: 0,
          currentPath: '/workspace/build',
          currentCommand: 'bash',
          title: '',
          label: '',
        },
        {
          paneId: '%2',
          sessionName: 'build',
          windowIndex: 0,
          paneIndex: 1,
          currentPath: '/workspace/build',
          currentCommand: 'bash',
          title: '',
          label: 'reviewer',
        },
      ]),
    ).toEqual([
      {
        paneId: '%1',
        sessionName: 'build',
        windowIndex: 0,
        paneIndex: 0,
        currentPath: '/workspace/build',
        currentCommand: 'bash',
        title: '',
        label: 'build-1',
      },
      {
        paneId: '%2',
        sessionName: 'build',
        windowIndex: 0,
        paneIndex: 1,
        currentPath: '/workspace/build',
        currentCommand: 'bash',
        title: '',
        label: 'reviewer',
      },
      {
        paneId: '%3',
        sessionName: 'build',
        windowIndex: 1,
        paneIndex: 0,
        currentPath: '/workspace/build',
        currentCommand: 'bash',
        title: '',
        label: 'build-2',
      },
    ]);
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
