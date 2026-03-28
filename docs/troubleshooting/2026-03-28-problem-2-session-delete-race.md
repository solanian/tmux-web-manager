# Problem 2. Session list refresh could fail during tmux delete races

## Symptoms

- Backend `/api/sessions` could return `500` while a tmux session disappeared between liveness check and cwd lookup

## Cause

- The backend checked `has-session` and then separately queried `pane_current_path`
- If the tmux session exited in between, the second call raised and broke the whole response

## Resolution

- Treated cwd lookup failure as a per-session race
- Hide and prune that disappeared session instead of failing the whole API call

## Impact

- Backend list refresh and hub backend health sync remain stable under transient deletes, and vanished sessions no longer linger in the UI
