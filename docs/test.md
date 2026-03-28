# tmux-web-manager Test Plan

## Hub / main

- backend registry 추가/수정/삭제/영속 저장
- 여러 agent backend 의 session 목록 집계와 sidebar payload 구성
- session 생성 시 backend 선택, 작업 경로, optional session 이름 전달
- session rename 시 backend/session id 와 새 session 이름 전달
- 중앙 terminal WebSocket proxy 가 agent terminal stream 을 중계
- `main` 모드가 web + local backend 를 함께 띄우는 config parse
- `HOST` 미지정 시 기본 bind host 가 `0.0.0.0` 이어서 LAN 접속을 허용
- native install 후 `run-main.sh` 가 실행 명령을 보존
- 설치된 `run-main.sh` 로 실제 central web + local backend 기동
- 설치된 `run-main.sh` 에서 remote agent backend 등록 및 remote session attach 가능

## Agent / sub

- 경로 allowlist 검증
- tmux session id 생성과 optional session name 반영
- session name 기준 send-text + auto-enter API
- tmux session rename API
- tmux 입력 매핑과 `send-keys` 경로
- 기본 tmux socket mode 가 host default tmux 를 사용
- dedicated tmux socket / config 는 opt-in mode 로 사용
- dedicated mode 에서 generated tmux config 의 oh-my-tmux source + mouse-on 설정
- `sub` 모드가 backend 전용으로 기동되는 config parse
- `BACKEND_HOST` 미지정 시 기본 bind host 가 `0.0.0.0` 이어서 LAN 접속을 허용
- 기존 tmux session discovery 결과가 store 목록에 자동 편입
- 사라진 tmux session 은 hydrate 후 목록에서 숨겨지고 store 에서 제거
- native install 후 `run-sub.sh` 가 실행 명령을 보존
- 설치된 `run-sub.sh` 로 실제 agent backend 기동

## Native install

- install script 가 env/run 파일을 올바르게 생성
- 설치 prefix 아래 `app/dist`, `app/node_modules`, `etc`, `bin` 산출물 생성
- restart-loop launcher script 가 존재하고 long-running main 실행에 사용 가능

## UI rendering

- 하단 composer UI 렌더링 및 `sendText` 경로 존재
- 특수키 버튼 렌더링 및 `sendKey` 경로 존재
- 모바일 레이아웃용 sticky composer CSS 존재
- mobile 에서 sidebar toggle 버튼과 off-canvas/sidebar drawer 구조 존재
- sidebar 에 `Servers` / `Sessions` 탭이 존재하고 탭 panel 구분 마크업이 존재
- backend/session 생성·수정 폼은 modal 마크업으로 존재하고 상시 sidebar 에 노출되지 않음
- sidebar server/session 목록에 compact list 전용 클래스/마크업이 존재
- session list 요약 문자열이 동일 requested/cwd 를 중복 표시하지 않음
- session row 클릭으로 open 가능하고 delete confirm modal 마크업이 존재
- session active row 스타일과 hover 스타일이 명시적으로 존재
- session relative activity helper와 최신 활동순 정렬 helper가 존재
- session row/path summary custom tooltip 마크업과 JS 표시 로직이 존재
- custom scrollbar CSS(`::-webkit-scrollbar`, `scrollbar-color`)가 존재
- terminal bar 에 font size 감소/증가 버튼이 존재
- sidebar open/closed 상태에 따라 햄버거/닫기 버튼 표시 규칙 CSS가 존재
- main/composer 레이아웃에 `100dvh` 또는 하단 입력 영역 비클리핑을 위한 CSS가 존재
- sidebar list 영역 전용 스크롤 CSS(`overflow: hidden` on sidebar shell + `overflow: auto` on list region)가 존재

## Commands

- `cd tmux-web-manager && npm install`
- `cd tmux-web-manager && npm run build`
- `cd tmux-web-manager && npm test`
- `cd tmux-web-manager && node dist/index.js main --help`
- `cd tmux-web-manager && node dist/index.js sub --help`
- `cd tmux-web-manager && ./scripts/install-native.sh --prefix ...`
- `export PATH=/workspace/sandbox/.local/bin:$PATH && /tmp/tmux-web-manager-main/bin/run-main.sh`
- `export PATH=/workspace/sandbox/.local/bin:$PATH && /tmp/tmux-web-manager-sub/bin/run-sub.sh`
- `node --input-type=module ...` (central `/ws/terminal` proxy smoke)
- `python3 ...` (hub API 기준 remote agent backend add + remote session create/delete smoke)

## Latest Results

- `npm run build`: pass
- `npm test`: pass (`25 passed`)
- `node dist/index.js main --help`: pass
- `node dist/index.js sub --help`: pass
- `HOST=0.0.0.0 BACKEND_HOST=0.0.0.0 node dist/index.js main`: pass (UI `38187`, backend `38188`, LAN IP smoke `192.168.0.80`)
- existing tmux session import: pass (`tmux -L tmux-web-manager-main-run ... new-session -s tfw-manual-import-check` 후 `/api/state` 노출)
- host default tmux mode: pass (`TMUX_SOCKET_MODE=default` 에서 host 기본 tmux session 13개 노출)
- session rename flow: pass (`PUT /api/sessions/local/...` 로 `tfw-ui-edit-test-a` -> `tfw-ui-edit-test-b`)
- supervised launcher runtime: pass (`bash ./scripts/run-main-supervised.sh` + `/api/state` 응답)
- backend send-text API: pass (`POST /api/sessions/by-name/twm-send-text-test/send-text` -> `/tmp/twm-send-text-test.out`에 `test`)
- native install artifact generation: pass
- installed `run-main.sh`: pass
- installed `run-sub.sh`: pass
- installed `hub` -> remote `agent` register/create/attach: pass (`NATIVE_REMOTE_OK`)
