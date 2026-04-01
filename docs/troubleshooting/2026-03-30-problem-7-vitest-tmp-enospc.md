# 2026-03-30 / Problem 7 / Vitest could fail under `/tmp` ENOSPC and needed a local TMPDIR override

## Symptom

- `npm test` failed before tests ran
- Vitest reported `ENOSPC: no space left on device, mkdir ... /tmp/.../ssr`

## Cause

- The environment had insufficient free space in the default `/tmp` area used by Vitest temporary directories

## Resolution

- Re-ran tests with a repository-local temporary directory:

```bash
TMPDIR=$PWD/.tmp-vitest npm test
```

- Removed the temporary directory after verification

## Follow-up

- Keep the plain `npm test` command documented, but note the `TMPDIR` override in `docs/test.md` for constrained environments
