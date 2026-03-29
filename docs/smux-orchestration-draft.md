# smux Comparison and Distributed Orchestration Draft

## Goal

이 문서는 `ShawnPana/smux` 의 tmux 간 통신 방식과 현재 `tmux-web-manager` 의 relay/session orchestration 방식을 비교하고,
현재 구조를 바탕으로 **hub 중심의 distributed smux-like orchestration** 으로 확장하는 초안을 정리합니다.

References:

- `smux` repository: https://github.com/ShawnPana/smux
- `smux` README: https://github.com/ShawnPana/smux/blob/main/README.md
- `smux` `tmux-bridge` script: https://github.com/ShawnPana/smux/blob/main/scripts/tmux-bridge

## Summary

### smux

`smux` 는 기본적으로 **같은 tmux 서버 안의 pane 간 통신/자동화** 도구입니다.

핵심 동작:

- `capture-pane` 기반 `read`
- `send-keys -l` 기반 `type`
- `send-keys` 기반 `keys`
- pane label(`@name`) 기반 `resolve`
- `TMUX_BRIDGE_SOCKET` / `$TMUX` / tmux socket scan 기반 socket 탐지
- `require_read()` 기반 read-before-send guard

즉 `smux` 는 **local tmux pane orchestration CLI** 에 가깝습니다.

### tmux-web-manager

현재 프로젝트는 **hub + multi-agent + session relay** 구조입니다.

핵심 동작:

- hub 가 여러 backend(agent)를 registry 로 관리
- backend 별 tmux session 을 집계
- hub relay API 가 target backend/session 으로 text 를 전달
- backend 가 실제 `tmux send-keys` 를 수행
- relay 감사 로그가 남음

즉 현재 프로젝트는 **distributed tmux session orchestration** 에 가깝습니다.

## Direct Comparison

| 항목 | smux | tmux-web-manager |
| --- | --- | --- |
| 주 대상 | pane | session |
| 범위 | 같은 tmux 서버 내부 | 여러 서버/backend |
| 호출 형태 | 로컬 CLI | hub-mediated HTTP/WebSocket |
| 대상 식별 | pane id / session:window.pane / label | backend name + session name |
| read 지원 | 있음 | 없음 |
| keys 지원 | 있음 | websocket 경로엔 있음, relay HTTP엔 없음 |
| message 지원 | 있음 | 없음 |
| label/resolve | 있음 | 없음 |
| read-before-send guard | 있음 | 없음 |
| 감사 로그 | 상대적으로 약함 | 강함(JSONL relay log) |

## Mapping smux Features to tmux-web-manager

| smux 기능 | 현재 상태 | 필요 작업 |
| --- | --- | --- |
| `list` | 부분 지원 (`session` 목록만) | pane-aware listing 이나 session-level list 정교화 |
| `read` | 없음 | backend/hub read API 추가 |
| `type` | 부분 지원 (`send-text + Enter`) | no-enter type API 추가 |
| `keys` | 부분 지원 | relay HTTP `send-keys` 추가 |
| `message` | 없음 | sender metadata prepend relay 추가 |
| `name` | 없음 | label 정책 추가 |
| `resolve` | 없음 | label registry/lookup 추가 |
| read guard | 없음 | hub state 기반 optional guard 추가 |

## Recommendation

### Preferred path: session-level smux first

현재 구조와 가장 잘 맞는 방향은 **pane-level smux clone** 이 아니라,
먼저 **session-level distributed smux** 를 구현하는 것입니다.

이유:

- 현재 시스템이 이미 session 중심
- 기존 sidebar / relay / backend API 구조와 잘 맞음
- 구현 범위가 작고 가치가 빠르게 나옴
- 이후 필요할 때 pane-aware 확장 가능

## Proposed Session-Level Orchestration APIs

### Backend / agent APIs

#### Read session output

`GET /api/sessions/by-name/:sessionName/read?lines=50`

Response:

```json
{
  "sessionName": "build",
  "lines": 50,
  "output": "..."
}
```

Implementation idea:

- `tmux capture-pane -t <session> -p -J -S -<lines>`

#### Type text without Enter

`POST /api/sessions/by-name/:sessionName/send-text-no-enter`

Request:

```json
{
  "text": "echo hello"
}
```

Response:

```json
{
  "ok": true
}
```

Implementation idea:

- `tmux send-keys -l -- <text>`

#### Send keys

`POST /api/sessions/by-name/:sessionName/send-keys`

Request:

```json
{
  "keys": ["C-c", "Enter"]
}
```

Response:

```json
{
  "ok": true
}
```

Implementation idea:

- multiple `tmux send-keys`

#### Message with sender metadata

`POST /api/sessions/by-name/:sessionName/message`

Request:

```json
{
  "fromBackendName": "mac-mini",
  "fromSessionName": "build",
  "text": "please check the failing tests"
}
```

Response:

```json
{
  "ok": true
}
```

Implementation idea:

- prepend:
  - `[relay from: mac-mini/build at: 2026-03-29T...Z] please check the failing tests`
- then send text + maybe optional Enter

### Hub APIs

#### Read

`POST /api/relay/read`

Request:

```json
{
  "sourceBackendName": "mac-mini",
  "sourceSessionName": "build",
  "targetBackendName": "ubuntu-dev",
  "targetSessionName": "ops",
  "lines": 50
}
```

Response:

```json
{
  "sessionName": "ops",
  "lines": 50,
  "output": "..."
}
```

#### Type without Enter

`POST /api/relay/send-text-no-enter`

Request:

```json
{
  "sourceBackendName": "mac-mini",
  "sourceSessionName": "build",
  "targetBackendName": "ubuntu-dev",
  "targetSessionName": "ops",
  "text": "echo hello"
}
```

#### Send keys

`POST /api/relay/send-keys`

Request:

```json
{
  "sourceBackendName": "mac-mini",
  "sourceSessionName": "build",
  "targetBackendName": "ubuntu-dev",
  "targetSessionName": "ops",
  "keys": ["Enter"]
}
```

#### Message

`POST /api/relay/message`

Request:

```json
{
  "sourceBackendName": "mac-mini",
  "sourceSessionName": "build",
  "targetBackendName": "ubuntu-dev",
  "targetSessionName": "ops",
  "text": "please review the output"
}
```

## Recommended Rollout Order

### Phase 1

- backend `read`
- backend `send-text-no-enter`
- backend `send-keys`
- hub relay wrappers for the three operations

### Phase 2

- hub/agent `message`
- relay audit log enrichment for read/keys/message

### Phase 3

- optional read-before-send guard
- optional sender metadata standardization

### Phase 4

- pane-aware model if needed

## Read-Guard Recommendation

`smux` 의 `require_read()` 는 유용하지만,
현재 프로젝트에선 초기 버전부터 강제하지 않는 쪽이 단순합니다.

Recommended approach:

- first implementation: **no guard**
- later optional mode:
  - hub state 에 `(sourceBackendName, sourceSessionName, targetBackendName, targetSessionName)` 단위의 recent read marker 저장
  - send-text/send-keys/message 전에 guard 확인

## Pane-Aware Expansion Draft

session-level orchestration 이 충분하지 않다면 그때 pane-aware 확장을 고려합니다.

Potential future APIs:

- `GET /api/panes`
- `GET /api/panes/by-id/:paneId/read`
- `POST /api/panes/by-id/:paneId/send-text`
- `POST /api/panes/by-id/:paneId/send-keys`
- `POST /api/panes/by-id/:paneId/name`
- `GET /api/panes/resolve/:label`

이 단계는 사실상 **distributed smux** 에 가까운 형태입니다.

## Conclusion

현재 `tmux-web-manager` 는 이미:

- multi-server
- hub relay
- session orchestration

구조를 가지고 있으므로,
`smux` 의 핵심 장점은 **session-level distributed orchestration** 으로 먼저 흡수하는 것이 가장 단순하고 직관적입니다.

Recommended next implementation target:

1. `read`
2. `send-text-no-enter`
3. `send-keys`
4. `message`

그 이후 필요할 때만 pane-aware 확장을 고려합니다.
