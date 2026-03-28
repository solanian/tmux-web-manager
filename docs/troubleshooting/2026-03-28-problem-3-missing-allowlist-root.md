# Problem 3. Native-installed remote agent failed when a default allowlist root did not exist

## Symptoms

- Remote `agent` session creation returned `ENOENT: no such file or directory, lstat '/home/node/workspace'`

## Cause

- Allowlist validation resolved roots with `realpathSync`
- A default root that did not exist caused validation to fail before the requested path was checked

## Resolution

- Changed allowlist normalization to use `path.resolve(...)` for roots
- The requested target path is still created and resolved normally after allowlist acceptance

## Impact

- Native installs work even if some default allowlist roots are absent on a given host
