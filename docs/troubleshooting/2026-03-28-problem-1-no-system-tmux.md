# Problem 1. Host environment had no system `tmux`

## Symptoms

- `main` / `sub` runtime smoke failed immediately with `tmux is required but was not found in PATH`

## Cause

- The current environment did not have `tmux` installed
- Package-manager installation was not available in this environment

## Resolution

- Built `bison` and `tmux 3.5a` into `/workspace/sandbox/.local`
- Used `PATH=/workspace/sandbox/.local/bin:$PATH` during runtime verification

## Impact

- Runtime smoke was verified against a user-local `tmux`
- Production/native installs should still use a normal host `tmux`
