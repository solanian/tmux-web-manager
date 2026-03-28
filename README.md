# tmux-web-manager

A web-based tmux session manager for multi-server environments.

`tmux-web-manager` is a distributed tmux web viewer built around two roles:

- `main`: starts the central xterm.js web UI and a local tmux backend server
- `sub`: starts only a tmux backend server for a remote machine

한국어 README는 [`README-ko.md`](./README-ko.md)에서 볼 수 있습니다.

Project docs live in [`docs/specification.md`](./docs/specification.md), [`docs/memory.md`](./docs/memory.md), [`docs/troubleshooting.md`](./docs/troubleshooting.md), and [`docs/test.md`](./docs/test.md).

The central UI stores backend server definitions, lets you create/delete tmux sessions on any registered backend, and renders the selected session in the middle panel with xterm.js.

## Features

- xterm.js terminal view with raw PTY-backed `tmux attach-session`
- multiple backend server registry with persistent storage
- left sidebar for backend management and tmux session management
- create sessions with target backend, working path, and optional session name
- backend sessions exposed through HTTP + WebSocket APIs
- tmux backend defaults to the host's default tmux server, with an optional dedicated socket mode that sources oh-my-tmux and forces mouse mode on
- single project with `main` / `sub` modes and Docker Compose services for both

## Environment variables

- `HOST`: central UI bind host in `main` mode, default `0.0.0.0`
- `PORT`: central UI port in `main` mode, default `8787`
- `BASE_URL`: central UI public URL, default `http://localhost:8787`
- `DATA_DIR`: root data directory, default `~/.tmux-web-manager`
- `ALLOWED_PROJECT_ROOTS`: comma-separated absolute roots allowed for tmux session paths
- `BACKEND_HOST`: tmux backend bind host, default `0.0.0.0`
- `BACKEND_PORT`: tmux backend port, default `8788`
- `BACKEND_PUBLIC_URL`: base URL the central service should use for its local backend entry
- `BACKEND_NAME`: display name for the local backend entry
- `BACKEND_AUTH_TOKEN`: bearer token required by the backend API and WebSocket; if omitted, the agent generates and persists one automatically
- `TMUX_SOCKET_MODE`: `default` or `dedicated`, default `default`
- `TMUX_SOCKET_NAME`: dedicated tmux socket name used when `TMUX_SOCKET_MODE=dedicated`
- `SESSION_PREFIX`: default prefix for auto-generated tmux session names
- `OH_MY_TMUX_CONF`: path to the oh-my-tmux config file used only for generated managed tmux config in dedicated mode

## Run locally

```bash
npm install
npm run build
npm run start:main
```

By default the app binds `HOST=0.0.0.0` and `BACKEND_HOST=0.0.0.0`, so the central UI and local backend are LAN-accessible unless you override them to loopback-only addresses such as `127.0.0.1`.

By default the backend attaches to the host's default tmux server. If you want the old isolated behavior, set `TMUX_SOCKET_MODE=dedicated`.

Each agent requires a backend auth token. If `BACKEND_AUTH_TOKEN` is not set, the agent generates one automatically and stores it in:

```bash
$DATA_DIR/backend/agent-auth-token
```

Hub-side backend registration must use that token.

Backend-only mode:

```bash
npm run start:sub
```

For a long-running auto-restarting host process:

```bash
nohup ./scripts/run-main-supervised.sh >/tmp/tmux-web-manager-supervised/nohup.out 2>&1 &
```

For a more robust user-level service, install the bundled systemd unit:

```bash
mkdir -p ~/.config/systemd/user
cp ./scripts/systemd/tmux-web-manager.service ~/.config/systemd/user/
mkdir -p ~/.config/tmux-web-manager
cp ./scripts/systemd/tmux-web-manager.env.example ~/.config/tmux-web-manager/tmux-web-manager.env
# edit ~/.config/tmux-web-manager/tmux-web-manager.env for your machine
systemctl --user daemon-reload
systemctl --user enable --now tmux-web-manager.service
```

## Native install

Install into a standalone prefix without Docker:

```bash
cd tmux-web-manager
./scripts/install-native.sh \
  --prefix "$HOME/.local/share/tmux-web-manager" \
  --data-dir "$HOME/.local/state/tmux-web-manager" \
  --allowed-root /workspace \
  --tmux-socket-mode default \
  --oh-my-tmux-conf "$HOME/.tmux.conf"
```

This generates:

- `PREFIX/app/` with `dist/`, `node_modules/`, and package metadata
- `PREFIX/etc/tmux-web-manager.env`
- `PREFIX/bin/run-main.sh`
- `PREFIX/bin/run-sub.sh`

Run natively after install:

```bash
$HOME/.local/share/tmux-web-manager/bin/run-main.sh
```

## Docker Compose

```bash
docker compose up --build
```

This starts:

- `main` on port `8787` with a local backend on `8788`
- `sub` on port `8790` as an extra remote-style backend server

## API summary

Central web server:

- `GET /api/state`
- `POST /api/backends`
- `PUT /api/backends/:id`
- `DELETE /api/backends/:id`
- `POST /api/sessions`
- `PUT /api/sessions/:backendId/:sessionId`
- `DELETE /api/sessions/:backendId/:sessionId`
- `POST /api/relay/send-text`
- `WS /ws/terminal?backendId=...&sessionId=...`

Relay usage example:

```bash
curl -X POST http://127.0.0.1:8787/api/relay/send-text \
  -H 'content-type: application/json' \
  -d '{
    "sourceBackendName": "server-a",
    "sourceSessionName": "source-session",
    "targetBackendName": "server-b",
    "targetSessionName": "target-session",
    "text": "echo hello"
  }'
```

Relay audit logs are written under:

```bash
$DATA_DIR/central/relay-log.jsonl
```

The relay request uses backend/session names only so the audit log always records a human-readable source and target.

tmux backend server:

- `GET /api/health`
- `GET /api/sessions`
- `POST /api/sessions`
- `POST /api/sessions/by-name/:sessionName/send-text`
- `PUT /api/sessions/:id`
- `DELETE /api/sessions/:id`
- `WS /ws/sessions/:id`

## Notes

- Native install expects `node` and `tmux` to exist on the host.
- In `dedicated` mode, the generated tmux config sources `OH_MY_TMUX_CONF` and forces `mouse on`.
