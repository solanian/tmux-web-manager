# Problem 5. Manually hosted runtime could disappear when the hosting tmux session died

## Symptoms

- The web UI and backend ports stopped listening
- The detached `tfw-main-runner` session disappeared together with the `node dist/index.js main` process

## Cause

- The runtime had been hosted inside a tmux session
- When that tmux session was terminated, the Node process also exited
- The previous logs only showed shutdown-path warnings and did not record which signal triggered the exit

## Resolution

- Add a restart-loop launcher for supervised long-running execution
- Improve runtime shutdown logging so future exits record the received signal

## Impact

- Long-running operation no longer depends on the survival of a manually created tmux session alone
