# tmux-web-manager Specification

## Project Scope

`tmux-web-manager/` 는 중앙 `hub` 와 여러 개의 원격/로컬 `agent` 로 이루어진 분산형 tmux web 프로젝트입니다.

- `hub` 는 중앙 web server 역할입니다.
- `agent` 는 tmux backend server 역할입니다.
- 현재 CLI 모드 이름은 각각 `main`, `sub` 이며 의미상 `hub = main`, `agent = sub` 입니다.

## Goals

- 구현은 `tmux-web-manager/` 디렉터리 내부에서 독립적으로 관리할 것
- `hub` 는 xterm.js 기반 중앙 web UI 를 제공할 것
- `hub` 는 여러 `agent` backend 를 등록/수정/삭제하고 영속 저장할 것
- `hub` 는 등록된 `agent` 의 상태와 session 목록을 합쳐 sidebar 에 표시할 것
- `hub` 는 선택된 session 을 중앙 terminal 영역에서 실제 터미널처럼 보여줄 것
- `agent` 는 tmux 제어용 HTTP/WebSocket API 를 제공할 것
- `agent` 는 allowlist 하위 경로에서 새 tmux session 생성/삭제/attach 를 지원할 것
- `agent` 가 생성하는 tmux 는 `oh-my-tmux` 를 source 하고 mouse mode 를 강제할 것
- native 설치가 우선 경로이며, 설치 후 `run-main.sh`, `run-sub.sh` 로 바로 실행 가능해야 할 것

## Hub Spec

- backend registry 를 파일에 영속 저장할 수 있어야 함
- 시작 시 local backend 를 기본 registry entry 로 자동 등록할 수 있어야 함
- 기본 central bind host 는 override 가 없으면 `0.0.0.0` 이어야 하며 LAN 접속을 허용해야 함
- relay/운영 식별 충돌을 막기 위해 backend/server 이름은 registry 전체에서 unique 해야 함
- backend add/update 시 health check 를 수행해 연결 가능한 backend 만 저장해야 함
- backend/server 기본 이름은 명시적 override가 없으면 해당 서버의 hostname 이어야 함
- 여러 backend 의 session 목록을 합쳐 단일 sidebar payload 로 제공해야 함
- session 생성 시 `backendId`, `path`, optional `sessionName` 을 대상 `agent` 에 전달해야 함
- session 이름 수정(rename) 요청을 대상 `agent` 에 전달할 수 있어야 함
- session 삭제 시 대상 `agent` 의 session delete API 를 호출해야 함
- hub 는 tunnel/relay 역할로 `sourceBackendName`, `sourceSessionName`, `targetBackendName`, `targetSessionName`, `text` 조합의 요청을 받아 target session에 text 입력을 전달할 수 있어야 함
- hub relay 요청은 source/target backend 이름, source/target session 이름, text, time 정보를 감사 로그로 남길 수 있어야 함
- relay 로그 `timestamp`는 ISO 8601 UTC 형식이어야 함
- 중앙 terminal WebSocket 은 대상 `agent` 의 terminal WebSocket 을 proxy 해야 함
- web UI 는 backend 관리 폼, session 생성 폼, session 목록, xterm.js terminal, 하단 composer UI 를 제공해야 함
- desktop 에서는 sidebar 가 좌측에 고정된 2-column 레이아웃이어야 함
- mobile 에서는 sidebar 가 상단 stack 으로 내려가지 않고 off-canvas sidebar/drawer 형태로 유지되어야 함
- mobile sidebar 는 버튼으로 숨김/표시 전환이 가능해야 함
- sidebar 내부 목록 영역은 최소 `Servers` / `Sessions` 두 개의 탭으로 나뉘어 전환 가능해야 함
- backend create/edit UI 와 session create UI 는 상시 표시되지 않고, 해당 액션 시 modal 로 표시되어야 함
- backend create/edit modal 에는 agent token 입력 UI가 명확히 보여야 하며, remote backend 등록 시 필수값처럼 안내되어야 함
- backend edit modal 은 기존 token 값을 password 형태로 prefill 할 수 있어야 함
- backend token 입력 UI는 일반 브라우저 복사 동작(`copy`, `cut`, `Ctrl/Cmd+C`)으로 token이 클립보드에 복사되지 않도록 보호되어야 함
- backend/session modal submit 실패 시 원인을 사용자에게 즉시 보여주는 에러 피드백이 있어야 함
- sidebar 의 server/session 목록은 `cmux` 같은 dense list 감성으로 compact 하게 표시되어야 함
- session list 에서는 session 이름이 가장 눈에 띄어야 하며 server tag 는 한 줄 아래에 배치되어야 함
- session list 의 경로 정보는 중복 없이 표시되어야 하며 `requestedPath` 와 `currentPath` 가 같으면 cwd 를 반복 표시하지 않아야 함
- session row 에서 잘린 경로 정보는 hover 시 custom tooltip 으로 전체 경로가 보여야 함
- session row 자체를 선택하면 terminal 이 열려야 하며 `Open` 전용 버튼에 의존하지 않아야 함
- session row 에는 rename 을 위한 `Edit` 액션이 있어야 함
- delete 액션은 실행 전에 확인 modal 을 한 번 더 표시해야 함
- session row 선택 상태는 클릭 직후 즉시 시각적으로 반영되어야 함
- active/hover row 강조는 compact list 에서도 한눈에 구분될 정도로 충분히 또렷해야 함
- session 목록의 보조 정보는 `running` 텍스트 대신 tmux `session_activity` 기반의 상대 시간(`5m ago` 등)을 표시해야 함
- session 목록 정렬은 tmux `session_activity` 최신순이어야 하며, 활동 시각이 없으면 생성 시각 기준으로 뒤에 배치할 수 있어야 함
- 웹 UI 스크롤 영역은 OS 기본 스크롤바 대신 modern 스타일의 커스텀 스크롤바로 표시되어야 함
- 상단 terminal bar 에 terminal font size 조절용 `-` / `+` 버튼이 있어야 함
- sidebar 가 열린 상태에서는 내부 닫기 버튼이 보여야 하고 햄버거 버튼은 숨겨져야 함
- sidebar 가 닫힌 상태에서는 햄버거 버튼으로 다시 열 수 있어야 함
- main session 화면의 하단 composer/input 영역은 viewport 높이 변화가 있어도 잘리지 않고 항상 완전히 보여야 함
- desktop 레이아웃에서는 하단 composer를 숨길 수 있어야 하고, mobile 레이아웃에서는 계속 보여야 함
- sidebar 전체가 통째로 스크롤되지 않고, backend/session row 목록 영역만 독립적으로 스크롤되어야 함
- sidebar list 영역은 높이가 제한된 세로 스크롤 영역이어야 하며, row가 넘치면 스크롤바가 실제로 보여야 함
- central API 는 최소 다음을 제공해야 함:
  - `GET /api/state`
  - `POST /api/backends`
  - `PUT /api/backends/:id`
  - `DELETE /api/backends/:id`
  - `POST /api/sessions`
  - `PUT /api/sessions/:backendId/:sessionId`
  - `DELETE /api/sessions/:backendId/:sessionId`
  - `POST /api/relay/send-text` (`targetBackendName` + `targetSessionName`)
  - `WS /ws/terminal`

## Agent Spec

- `GET /api/health` 로 backend 이름, tmux socket 이름, oh-my-tmux config 경로를 반환해야 함
- 기본 backend bind host 는 override 가 없으면 `0.0.0.0` 이어야 하며 LAN 접속을 허용해야 함
- agent는 backend auth token을 자동 생성/보존할 수 있어야 하며, token 없이는 hub가 agent API/WS에 연결할 수 없어야 함
- `GET /api/sessions` 로 관리 중인 session 목록을 반환해야 함
- agent 가 사용하는 tmux socket 에 기존 session 이 있으면 startup/list refresh 시 자동으로 관리 목록에 편입해야 함
- session payload 는 tmux `session_activity` 기반 최근 활동 시각을 포함해야 함
- `POST /api/sessions` 로 allowlist 검증 후 새 tmux session 을 생성해야 함
- `POST /api/sessions/by-name/:sessionName/send-text` 로 session name 기준 텍스트 입력 후 자동 Enter 전송을 지원해야 함
- `PUT /api/sessions/:id` 로 tmux session rename 을 지원해야 함
- `DELETE /api/sessions/:id` 로 tmux session 을 종료하고 메타데이터를 제거해야 함
- `WS /ws/sessions/:id` 로 `tmux attach-session` PTY stream 을 제공해야 함
- tmux socket mode 는 `host default` 와 `dedicated` 중 선택 가능해야 함
- 기본값은 `host default` mode 여야 하며 host 의 기본 tmux server/session 을 그대로 사용해야 함
- `dedicated` mode 를 선택한 경우 dedicated tmux socket 과 generated tmux config 를 사용해야 함
- `dedicated` mode 의 generated tmux config 는 지정된 `OH_MY_TMUX_CONF` 를 source 하고 `set -g mouse on` 을 강제해야 함
- session hydrate 도중 tmux session 이 사라져도 전체 목록 API 가 500 으로 실패하지 않아야 하며, 사라진 session 은 사용자 목록에서 숨겨지고 store 에서 정리될 수 있어야 함

## Native Install Spec

- install script 는 `app/`, `etc/`, `bin/` 산출물을 생성해야 함
- 설치 산출물은 최소 다음을 포함해야 함:
  - `PREFIX/app/dist/`
  - `PREFIX/app/node_modules/`
  - `PREFIX/etc/tmux-web-manager.env`
  - `PREFIX/bin/run-main.sh`
  - `PREFIX/bin/run-sub.sh`
- 설치 후 `PATH` 와 `.env` 파일만으로 `hub` / `agent` 실행이 가능해야 함
- 장시간 운영용 실행은 tmux session life-cycle 에 종속되지 않는 supervisor/autorestart 경로를 제공할 수 있어야 함
- 장시간 운영용 기본 경로로는 user-level service manager(systemd --user 등)를 사용할 수 있어야 함

## Constraints

- 경로 검증은 절대경로 + 허용 루트 하위 디렉터리 기준으로 제한할 것
- `hub` 와 `agent` 간 통신은 실제 원격 호스트를 상정한 HTTP/WebSocket 기반일 것
- tmux 화면은 snapshot 재렌더링이 아니라 `tmux attach-session` PTY attach 로 보여줄 것
- 같은 project path 로 여러 session 을 띄워도 고유 식별자 기준으로 관리돼야 함
- host default mode 에서는 host tmux server 설정/테마를 그대로 따르고, dedicated mode 에서만 app 전용 tmux 설정을 강제할 것
