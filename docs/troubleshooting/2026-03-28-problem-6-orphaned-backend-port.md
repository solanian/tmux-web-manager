# Problem 6. An orphaned backend process kept port `38188` busy and blocked supervisor recovery

## Symptoms

- The supervised launcher kept restarting `main`
- `38188` stayed bound while `38187` was down
- `/api/state` failed because the web server was not listening even though a Node process still existed

## Cause

- An older orphaned `node dist/index.js main` process survived and kept the backend port open
- The new supervised process tried to bind `38188` and crashed with `EADDRINUSE`
- The supervisor loop restarted repeatedly until the orphaned process was removed

## Resolution

- Identified the stale process by checking listening ports and process IDs
- Force-killed the orphaned Node process that still owned `38188`
- Let the supervisor restart cleanly so a single fresh `main` process could bind both `38187` and `38188`

## Impact

- Recovery required cleaning up stale listeners before the autorestart loop could succeed
- Future port-collision diagnosis should check for partially alive old processes when only one of the two ports is bound
