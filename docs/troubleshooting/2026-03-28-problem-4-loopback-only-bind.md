# Problem 4. Service was started with loopback-only bind addresses during manual smoke

## Symptoms

- Same-network devices could not reach the central UI even though the app was running locally

## Cause

- The manual smoke used `HOST=127.0.0.1` and `BACKEND_HOST=127.0.0.1`
- Loopback binding allows only same-host access

## Resolution

- Keep the application defaults at `HOST=0.0.0.0` and `BACKEND_HOST=0.0.0.0`
- Document and test the LAN-accessible default explicitly

## Impact

- Default startup remains LAN-accessible unless the operator intentionally overrides the bind host
