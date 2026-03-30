<div align="center">

```text
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ████████╗███╗   ███╗██╗   ██╗██╗  ██╗      ██╗    ██╗███████╗██████╗ ┃
┃  ╚══██╔══╝████╗ ████║██║   ██║╚██╗██╔╝      ██║    ██║██╔════╝██╔══██╗┃
┃     ██║   ██╔████╔██║██║   ██║ ╚███╔╝       ██║ █╗ ██║█████╗  ██████╔╝┃
┃     ██║   ██║╚██╔╝██║██║   ██║ ██╔██╗       ██║███╗██║██╔══╝  ██╔══██╗┃
┃     ██║   ██║ ╚═╝ ██║╚██████╔╝██╔╝ ██╗      ╚███╔███╔╝███████╗██████╔╝┃
┃     ╚═╝   ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝       ╚══╝╚══╝ ╚══════╝╚═════╝ ┃
┃                                                                       ┃
┃      ███╗   ███╗ █████╗ ███╗   ██╗ █████╗  ██████╗ ███████╗██████╗    ┃
┃      ████╗ ████║██╔══██╗████╗  ██║██╔══██╗██╔════╝ ██╔════╝██╔══██╗   ┃
┃      ██╔████╔██║███████║██╔██╗ ██║███████║██║  ███╗█████╗  ██████╔╝   ┃
┃      ██║╚██╔╝██║██╔══██║██║╚██╗██║██╔══██║██║   ██║██╔══╝  ██╔══██╗   ┃
┃      ██║ ╚═╝ ██║██║  ██║██║ ╚████║██║  ██║╚██████╔╝███████╗██║  ██║   ┃
┃      ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

여러 서버 터미널을 위한 오픈소스 tmux 허브.

<img alt="bg" src="https://img.shields.io/badge/BG-091018?style=flat-square&labelColor=091018&color=091018" />
<img alt="panel" src="https://img.shields.io/badge/PANEL-101926?style=flat-square&labelColor=101926&color=101926" />
<img alt="panel-alt" src="https://img.shields.io/badge/PANEL_ALT-152233?style=flat-square&labelColor=152233&color=152233" />
<img alt="border" src="https://img.shields.io/badge/BORDER-223349?style=flat-square&labelColor=223349&color=223349" />
<img alt="text" src="https://img.shields.io/badge/TEXT-e5edf7?style=flat-square&labelColor=e5edf7&color=e5edf7" />
<img alt="accent" src="https://img.shields.io/badge/ACCENT-4ade80?style=flat-square&labelColor=4ade80&color=4ade80" />

[English](./README.md) | [한국어](./README-ko.md)

</div>

> **운영 브리프**  
> `tmux-web-manager`는 중앙 **hub**(`main`)와 여러 **agent**(`sub`)를 중심으로 동작하는 분산형 tmux 제어 도구입니다.  
> 여러 머신의 tmux 세션과 pane을 한곳에서 모아 보여주고, xterm.js로 붙어서 조작하며, relay/orchestration API와 얇은 CLI까지 제공합니다.

---

## ▣ 바로가기

- [주요 기능](#-주요-기능)
- [환경 변수](#-환경-변수)
- [로컬 실행](#-로컬-실행)
- [Agent-local CLI Wrapper](#-agent-local-cli-wrapper)
- [Native install](#-native-install)
- [Docker Compose](#-docker-compose)
- [API 요약](#-api-요약)
- [프로젝트 문서](#-프로젝트-문서)

## ▣ 프로젝트 문서

- [스펙](./docs/specification.md)
- [Memory / 구현 로그](./docs/memory.md)
- [Troubleshooting 인덱스](./docs/troubleshooting.md)
- [테스트 계획 / 최신 결과](./docs/test.md)

## ▣ 주요 기능

- raw PTY 기반 `tmux attach-session` xterm.js 터미널 뷰
- 여러 backend 서버 등록 및 영속 저장
- 좌측 sidebar 기반 backend / session 관리
- backend, 작업 경로, optional session 이름으로 세션 생성
- HTTP + WebSocket 기반 backend API
- 기본적으로 host의 기본 tmux server를 사용하고, 필요하면 dedicated socket mode 사용 가능
- `main` / `sub` 실행 모드 지원

## ▣ 환경 변수

- `HOST`: `main` 모드 중앙 UI bind host, 기본값 `0.0.0.0`
- `PORT`: `main` 모드 중앙 UI 포트, 기본값 `8787`
- `BASE_URL`: 중앙 UI public URL, 기본값 `http://localhost:8787`
- `DATA_DIR`: 데이터 루트 디렉터리, 기본값 `~/.tmux-web-manager`
- `ALLOWED_PROJECT_ROOTS`: 허용할 절대 경로 root 목록(콤마 구분)
- `BACKEND_HOST`: backend bind host, 기본값 `0.0.0.0`
- `BACKEND_PORT`: backend 포트, 기본값 `8788`
- `BACKEND_PUBLIC_URL`: 중앙 서비스가 local backend에 접근할 때 사용할 base URL
- `BACKEND_NAME`: local backend 표시 이름
- `BACKEND_AUTH_TOKEN`: backend API / WebSocket용 bearer token. 지정하지 않으면 agent가 자동 생성해서 저장합니다.
- `TMUX_SOCKET_MODE`: `default` 또는 `dedicated`, 기본값 `default`
- `TMUX_SOCKET_NAME`: `dedicated` 모드에서 사용할 tmux socket 이름
- `SESSION_PREFIX`: 자동 생성 세션 이름 prefix
- `OH_MY_TMUX_CONF`: `dedicated` 모드 generated config에서 source할 oh-my-tmux config 경로

## ▣ 로컬 실행

```bash
npm install
npm run build
npm run start:main
```

기본적으로 `HOST=0.0.0.0`, `BACKEND_HOST=0.0.0.0`으로 bind되므로, loopback으로 제한하지 않는 한 LAN에서 접근할 수 있습니다.

기본 backend는 host의 기본 tmux server에 붙습니다. 예전처럼 격리된 동작이 필요하면 `TMUX_SOCKET_MODE=dedicated`를 사용하면 됩니다.

각 agent는 backend auth token이 반드시 필요합니다. `BACKEND_AUTH_TOKEN`이 없으면 agent가 자동으로 생성해서 다음 파일에 저장합니다.

```bash
$DATA_DIR/backend/agent-auth-token
```

hub에서 backend를 등록할 때는 이 토큰을 사용해야 합니다.

backend 전용 실행:

```bash
npm run start:sub
```

장시간 운영용 자동 재시작 실행:

```bash
nohup ./scripts/run-main-supervised.sh >/tmp/tmux-web-manager-supervised/nohup.out 2>&1 &
```

더 안정적인 user-level 서비스가 필요하면 포함된 systemd unit을 사용할 수 있습니다.

```bash
mkdir -p ~/.config/systemd/user
cp ./scripts/systemd/tmux-web-manager.service ~/.config/systemd/user/
mkdir -p ~/.config/tmux-web-manager
cp ./scripts/systemd/tmux-web-manager.env.example ~/.config/tmux-web-manager/tmux-web-manager.env
# ~/.config/tmux-web-manager/tmux-web-manager.env 를 현재 서버 환경에 맞게 수정
systemctl --user daemon-reload
systemctl --user enable --now tmux-web-manager.service
```

## ▣ Agent-local CLI Wrapper

agent shell이나 tmux pane에서 바로 사용할 수 있는 얇은 CLI wrapper도 포함되어 있습니다.

이 wrapper는 agent host에서 실행되지만, 내부적으로는 hub relay API를 호출합니다.

예시:

```bash
npm run bridge -- panes
npm run bridge -- resolve server-b reviewer
npm run bridge -- read server-b reviewer 20
npm run bridge -- message server-b reviewer "Please review the failing test output."
```

tmux 안에서 실행하면 `$TMUX_PANE`를 기본 source pane으로 활용할 수 있습니다.

유용한 환경 변수:

- `TWM_BASE_URL` 또는 `BASE_URL`
- `TWM_SOURCE_BACKEND`
- `TWM_SOURCE_PANE`
- `TWM_SOURCE_LABEL`

예:

```bash
export TWM_BASE_URL=http://127.0.0.1:8787
export TWM_SOURCE_BACKEND=server-a
export TWM_SOURCE_PANE=%1
npm run bridge -- read server-b reviewer 20
```

## ▣ Native Install

Docker 없이 standalone prefix에 설치:

```bash
cd tmux-web-manager
./scripts/install-native.sh \
  --prefix "$HOME/.local/share/tmux-web-manager" \
  --data-dir "$HOME/.local/state/tmux-web-manager" \
  --allowed-root /workspace \
  --tmux-socket-mode default \
  --oh-my-tmux-conf "$HOME/.tmux.conf"
```

생성물:

- `PREFIX/app/` (`dist/`, `node_modules/`, package metadata 포함)
- `PREFIX/etc/tmux-web-manager.env`
- `PREFIX/bin/run-main.sh`
- `PREFIX/bin/run-sub.sh`

설치 후 실행:

```bash
$HOME/.local/share/tmux-web-manager/bin/run-main.sh
```

## ▣ Docker Compose

```bash
docker compose up --build
```

기본 구성:

- `main`: `8787`
- local backend: `8788`
- extra `sub` backend: `8790`

## ▣ Inspiration / 참고한 프로젝트

이 프로젝트는 완전히 진공 상태에서 나온 것이 아니라, 몇 가지 오픈소스에서 인터랙션 방향과 웹 터미널 전달 방식, agent 지향 tmux 제어 아이디어를 많이 참고했습니다:

- [`ShawnPana/smux`](https://github.com/ShawnPana/smux) — pane label/resolve, `read`-before-`write` guard, agent-to-agent tmux 자동화 패턴에 큰 영향을 준 프로젝트입니다.
- [`tsl0922/ttyd`](https://github.com/tsl0922/ttyd) — 가벼운 web terminal 제공 방식과 실용적인 브라우저 터미널 UX를 참고했습니다.
- [`sorenisanerd/gotty`](https://github.com/sorenisanerd/gotty) — terminal을 웹 애플리케이션처럼 노출하는 초기 아이디어에 참고가 되었습니다.
- [`butlerx/wetty`](https://github.com/butlerx/wetty) — HTTP/HTTPS 기반 browser terminal UX와 remote terminal access 패턴을 참고했습니다.

이 프로젝트는 여기에 더해 **hub/agent registry**, **tmux session + pane orchestration**, **relay logging**, **agent-local / hub-backed CLI**를 한 시스템으로 결합하는 쪽으로 확장했습니다.

## ▣ API 요약

중앙 web server:

- `GET /api/state`
- `GET /api/panes`
- `GET /api/orchestration/panes`
- `GET /api/orchestration/panes/resolve?backendName=...&label=...`
- `POST /api/backends`
- `PUT /api/backends/:id`
- `DELETE /api/backends/:id`
- `POST /api/sessions`
- `PUT /api/sessions/:backendId/:sessionId`
- `DELETE /api/sessions/:backendId/:sessionId`
- `POST /api/relay/send-text`
- `POST /api/relay/send-text-no-enter`
- `POST /api/relay/send-keys`
- `POST /api/relay/message`
- `POST /api/relay/read`
- `POST /api/relay/panes/read`
- `POST /api/relay/panes/send-text`
- `POST /api/relay/panes/send-text-no-enter`
- `POST /api/relay/panes/send-keys`
- `POST /api/relay/panes/message`
- `POST /api/relay/panes/label`
- `WS /ws/terminal?backendId=...&sessionId=...`

Relay 사용 예시:

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

relay 감사 로그는 다음 파일에 기록됩니다:

```bash
$DATA_DIR/central/relay-log.jsonl
```

relay 요청은 backend/session 이름만 사용하므로 감사 로그에서도 source/target을 사람이 읽기 쉬운 형태로 남길 수 있습니다.

Pane orchestration discovery 예시:

```bash
curl http://127.0.0.1:8787/api/orchestration/panes
```

이 응답에는 다음이 포함됩니다:

- `targetIdFormat: "backendName/paneId"`
- `readBeforeWrite`
- relay endpoint 안내
- `backendName`, `paneId`, `sessionName`, `location`, `label`, `currentCommand`, `currentPath` 가 들어간 pane summary

Pane resolve 예시:

```bash
curl "http://127.0.0.1:8787/api/orchestration/panes/resolve?backendName=server-b&label=reviewer"
```

Pane relay read 예시:

```bash
curl -X POST http://127.0.0.1:8787/api/relay/panes/read \
  -H 'content-type: application/json' \
  -d '{
    "sourceBackendName": "server-a",
    "sourcePaneId": "%1",
    "targetBackendName": "server-b",
    "targetLabel": "reviewer",
    "lines": 20
  }'
```

Pane relay message 예시:

```bash
curl -X POST http://127.0.0.1:8787/api/relay/panes/message \
  -H 'content-type: application/json' \
  -d '{
    "sourceBackendName": "server-a",
    "sourcePaneId": "%1",
    "targetBackendName": "server-b",
    "targetLabel": "reviewer",
    "text": "Please review the failing test output."
  }'
```

Pane label 설정 예시:

```bash
curl -X POST http://127.0.0.1:8787/api/relay/panes/label \
  -H 'content-type: application/json' \
  -d '{
    "sourceBackendName": "server-a",
    "sourcePaneId": "%1",
    "targetBackendName": "server-b",
    "targetPaneId": "%12",
    "label": "reviewer"
  }'
```

명시적인 pane label이 없으면 session 이름 기반 숫자 suffix 형식(`build-1`, `build-2`)으로 자동 label이 생성되며, 이 자동 label도 discovery/resolve에서 그대로 사용할 수 있습니다.

tmux backend server:

- `GET /api/health`
- `GET /api/sessions`
- `GET /api/panes`
- `GET /api/panes/resolve/:label`
- `POST /api/sessions`
- `POST /api/sessions/by-name/:sessionName/send-text`
- `POST /api/sessions/by-name/:sessionName/send-text-no-enter`
- `POST /api/sessions/by-name/:sessionName/send-keys`
- `POST /api/sessions/by-name/:sessionName/message`
- `GET /api/sessions/by-name/:sessionName/read`
- `POST /api/panes/by-id/:paneId/label`
- `POST /api/panes/by-id/:paneId/send-text`
- `POST /api/panes/by-id/:paneId/send-text-no-enter`
- `POST /api/panes/by-id/:paneId/send-keys`
- `POST /api/panes/by-id/:paneId/message`
- `GET /api/panes/by-id/:paneId/read`
- `PUT /api/sessions/:id`
- `DELETE /api/sessions/:id`
- `WS /ws/sessions/:id`

## 참고

- native install은 host에 `node`와 `tmux`가 있어야 합니다.
- `dedicated` 모드에서는 generated tmux config가 `OH_MY_TMUX_CONF`를 source하고 `mouse on`을 강제합니다.
