# tmux-web-manager Memory

## 2026-03-29

### Planned Cleanup

- `src/web.ts` 가 server routing, WebSocket proxy, HTML template, CSS, client-side JS, helper utilities를 한 파일에 모두 담고 있어 유지보수성이 낮음
- 기존 `tests/web.test.ts` 의 HTML 문자열/헬퍼 회귀 검증을 유지한 채, `src/web.ts` 를 facade 로 축소하고 내부 구현을 server/page/helpers 경계로 분리할 예정

### Implemented

- `src/web.ts` 를 public facade 로 축소하고 내부 구현을 `src/web/helpers.ts`, `src/web/page.ts`, `src/web/server.ts` 로 분리
- `renderHtmlPage`, `createWebServer`, relay/session helper export 표면은 유지해 기존 import 경로와 테스트가 그대로 동작하도록 정리
- relay 대상 식별 충돌을 막기 위해 backend registry 저장 시 backend 이름 unique 제약(대소문자 무시)을 추가
- relay 감사 로그에 `result`(`ok`/`error`)와 실패 `error` 메시지를 함께 기록하도록 보강

### Verification Summary

- `npm run build`: pass
- `npm test`: pass (`38 passed`)

## 2026-03-28

### Implemented

- 독립 프로젝트 `tmux-web-manager/` 생성
- `src/config.ts` 에 `main` / `sub` 실행 모드와 환경변수 설정 추가
- `src/store.ts` 에 backend registry / managed session metadata 영속 저장 추가
- `src/tmux.ts` 에 allowlist 검증, dedicated tmux socket 제어, generated tmux config, mouse-on, send-keys helper 추가
- `src/backend.ts` 에 tmux backend HTTP/WebSocket API 추가
- `src/web.ts` 에 중앙 web server, backend registry API, session 집계 API, xterm.js UI, terminal proxy 추가
- `src/index.ts` 에 `main` / `sub` 런처 추가
- `src/native.ts`, `src/install-native.ts`, `scripts/install-native.sh` 로 native 설치 경로 추가
- `README.md`, `.env.example`, `Dockerfile`, `docker-compose.yml` 추가
- `tests/config.test.ts`, `tests/store.test.ts`, `tests/tmux.test.ts`, `tests/web.test.ts`, `tests/native.test.ts` 추가
- backend session hydrate race-safe 보완 추가
- allowlist root 가 아직 존재하지 않아도 정책 경계로 취급하도록 경로 검증 보완
- `HOST` / `BACKEND_HOST` 기본값이 `0.0.0.0` 이어야 한다는 LAN 허용 정책을 문서와 테스트로 고정
- mobile sidebar drawer/toggle, `Servers`/`Sessions` 탭, server/session modal UI, compact `cmux` 스타일 목록 UI 추가
- agent tmux socket 의 기존 session 을 startup/list refresh 시 자동으로 store 에 편입하는 discovery 보강 추가
- tmux socket mode 를 `default`/`dedicated` 로 선택 가능하게 하고 기본값을 host default tmux 로 전환
- session list 가 session 이름 중심으로 읽히도록 server tag 를 다음 줄로 내리고 path/cwd 중복 표기를 제거
- session row click-to-open, session rename modal/API, server/session delete confirm modal 추가
- session row hover/active 스타일을 더 강하게 하고 클릭 즉시 active 상태가 반영되도록 render 타이밍 보강
- UI 전체 스크롤 영역에 modern custom scrollbar 스타일 적용
- sidebar toggle 이 mobile 전용이 아니라 desktop 포함 모든 환경에서 동작하도록 레이아웃 토글 보강
- sidebar open/closed 제어를 햄버거/내부 닫기 버튼 규칙으로 정리하고 terminal font size `- / +` 컨트롤 추가
- 장시간 실행용 `scripts/run-main-supervised.sh` autorestart launcher 추가 및 shutdown signal 로깅 보강
- troubleshooting 기록을 `docs/troubleshooting.md` 인덱스 + 개별 문서 구조로 분리
- session row hover 시 전체 경로를 custom tooltip 으로 표시하도록 개선
- sidebar 를 shell 고정 + list 영역 전용 스크롤 구조로 바꾸고, main 레이아웃을 grid rows 기반으로 조정해 composer 클리핑을 추가 보완
- README 상단 한줄 설명 추가 및 `README-ko.md` 한국어 문서 추가
- 프로젝트 사용자 노출 이름을 `tmux-web-manager`로 정리하고 현재 디렉터리를 독립 Git 저장소로 초기화
- backend에 session name 기준 `send-text + Enter` API 추가 및 실동작 검증 완료
- backend edit modal 에서 token을 password 형태로 prefill 하되 copy/cut/clipboard shortcut 차단을 추가
- hub relay send-text API를 추가해 backend A/B 사이를 중앙에서 text tunnel 방식으로 중계 가능하게 함
- relay 사용법을 README에 문서화하고 relay 감사 로그(jsonl) 저장 + hostname 기반 기본 backend 이름 적용
- repo 관리형 `systemd --user` 서비스 유닛 추가
- relay 감사 로그에 사람이 읽을 수 있는 backend 이름과 source session 이름도 함께 기록
- relay 로그 timestamp는 ISO 8601 UTC로 유지하고, sourceSessionId 기준 sourceSessionName 자동 보완 로직 추가

### Naming

- `hub` 역할 = CLI `main`
- `agent` 역할 = CLI `sub`

### Verification Summary

- `npm run build`: pass
- `npm test`: pass (`30 passed`)
- `node dist/index.js main --help`: pass
- `node dist/index.js sub --help`: pass
- `HOST=0.0.0.0 BACKEND_HOST=0.0.0.0 node dist/index.js main`: pass (LAN bind smoke on `0.0.0.0`)
- existing tmux session import on agent socket: pass (`tfw-manual-import-check` auto-imported into `/api/state`)
- `TMUX_SOCKET_MODE=default` host tmux visibility: pass (`discord-cli-bridge`, `dtwl-service`, `tfw-main-runner` 노출)
- session rename via UI/API flow: pass (`tfw-ui-edit-test-a` -> `tfw-ui-edit-test-b`)
- supervised main launcher: pass
- backend send-text API: pass (`POST /api/sessions/by-name/twm-send-text-test/send-text` -> `test` line written)
- hub relay send-text API: pass (`POST /api/relay/send-text` -> target tmux session file에 `test`)
- relay audit log: pass (`relay-log.jsonl` 에 source/target/text 기록)
- hostname default backend name: pass (`backend_name == hostname`)
- native install: pass
- installed `run-main.sh`: pass
- installed `run-sub.sh`: pass
- installed `hub` -> remote `agent` register/create/attach: pass (`NATIVE_REMOTE_OK`)
