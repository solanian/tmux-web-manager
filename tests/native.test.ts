import { describe, expect, it } from 'vitest';

import { buildBridgeScript, buildEnvFile, buildRunScript } from '../src/native.js';

describe('native install assets', () => {
  it('renders env file with the configured backend and path values', () => {
    const envFile = buildEnvFile({
      prefix: '/opt/tmux-web-manager',
      dataDir: '/var/lib/tmux-web-manager',
      host: '0.0.0.0',
      port: 8787,
      baseUrl: 'http://localhost:8787',
      allowedRoots: ['/workspace', '/srv/projects'],
      backendHost: '0.0.0.0',
      backendPort: 8788,
      backendPublicUrl: 'http://127.0.0.1:8788',
      backendName: 'local-backend',
      backendAuthToken: 'secret',
      tmuxSocketMode: 'default',
      tmuxSocketName: 'tmux-web-manager',
      sessionPrefix: 'tmux-web-manager',
      ohMyTmuxConfigPath: '/opt/oh-my-tmux/.tmux.conf',
    });

    expect(envFile).toContain("DATA_DIR='/var/lib/tmux-web-manager'");
    expect(envFile).toContain("ALLOWED_PROJECT_ROOTS='/workspace,/srv/projects'");
    expect(envFile).toContain("BACKEND_AUTH_TOKEN='secret'");
    expect(envFile).toContain("TMUX_SOCKET_MODE='default'");
  });

  it('renders run scripts for main and sub modes', () => {
    expect(buildRunScript('main')).toContain('node dist/index.js main');
    expect(buildRunScript('sub')).toContain('node dist/index.js sub');
  });

  it('renders a bridge wrapper script that calls the hub-backed CLI', () => {
    expect(buildBridgeScript()).toContain('node dist/bridge-cli.js');
  });
});
