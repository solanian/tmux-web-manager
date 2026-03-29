# Agent Orchestration Protocol

This document defines the **smux-style communication protocol** for agents using
`tmux-web-manager`.

The goal is simple:

- agents must be able to discover targets
- read before they act
- communicate through panes or sessions in a predictable way
- leave auditable traces through the hub relay

## Scope

This protocol applies when an agent wants to interact with another agent through:

- the central hub relay
- backend/session APIs
- backend/pane APIs

The preferred target level is now:

1. **pane-level first**
2. session-level only as fallback when pane selection is not available

## Core Principles

### 1. Read before write

Agents **must read the target first** before sending text, keys, or messages.

Allowed sequence:

1. `read`
2. decide
3. `send-text` / `send-text-no-enter` / `send-keys` / `message`

This mirrors the spirit of `smux`'s `require_read()` behavior.

### 2. Prefer pane-level targeting

Use `paneId` when available.

Preferred target identity:

- `backendName + paneId`

Examples:

- `mac-mini + %12`
- `ubuntu-dev + %3`

Do **not** assume `sessionName + paneIndex` is stable enough to act as the canonical identifier.

### 3. Use the narrowest action possible

Preferred action order:

1. `read`
2. `message`
3. `send-text-no-enter`
4. `send-text`
5. `send-keys`

Guideline:

- use `message` for conversational coordination
- use `send-text-no-enter` when the target should inspect/edit before execution
- use `send-text` only when execution should happen immediately
- use `send-keys` only for control/navigation behavior

### 4. Keep actions auditable

All relay actions go through the hub when possible so that:

- operation type is logged
- source/target identity is logged
- success/failure is logged

## Discovery

### Backend and session discovery

Use:

```http
GET /api/state
```

This returns:

- backend list
- aggregated session list

### Pane discovery

Use:

```http
GET /api/panes
```

This returns aggregated pane metadata such as:

- `backendName`
- `paneId`
- `sessionName`
- `windowIndex`
- `paneIndex`
- `currentPath`
- `currentCommand`
- `label`

### Agent-friendly orchestration pane discovery

For agent workflows, prefer:

```http
GET /api/orchestration/panes
```

This endpoint is designed to be easier for agents to consume directly.

It provides:

- `targetIdFormat`
- `readBeforeWrite`
- relay endpoint hints
- simplified pane summaries

Important conventions:

- canonical target format: `backendName/paneId`
- canonical pane identity: tmux `paneId` such as `%12`

Typical response shape:

```json
{
  "targetIdFormat": "backendName/paneId",
  "readBeforeWrite": true,
  "endpoints": {
    "list": "GET /api/orchestration/panes",
    "read": "POST /api/relay/panes/read",
    "sendText": "POST /api/relay/panes/send-text",
    "sendTextNoEnter": "POST /api/relay/panes/send-text-no-enter",
    "sendKeys": "POST /api/relay/panes/send-keys",
    "message": "POST /api/relay/panes/message"
  },
  "panes": [
    {
      "targetId": "server-b/%2",
      "backendName": "server-b",
      "paneId": "%2",
      "sessionName": "ops",
      "location": "ops:1.0",
      "label": "reviewer",
      "currentCommand": "bash",
      "currentPath": "/workspace/ops",
      "lastActivityAt": "2026-03-29T00:00:00.000Z"
    }
  ]
}
```

Recommended agent flow:

1. call `GET /api/orchestration/panes`
2. choose a `targetId`
3. split it into `backendName` + `paneId`
4. call `read`
5. only then call a write operation

## Relay Operations

## Pane-level operations

### Read

```http
POST /api/relay/panes/read
```

Example body:

```json
{
  "sourceBackendName": "claude-host",
  "sourcePaneId": "%1",
  "targetBackendName": "codex-host",
  "targetPaneId": "%12",
  "lines": 30
}
```

Expected usage:

- inspect the latest output
- confirm target is the correct pane
- only then decide whether to respond

### Send text and execute

```http
POST /api/relay/panes/send-text
```

Example body:

```json
{
  "sourceBackendName": "claude-host",
  "sourcePaneId": "%1",
  "targetBackendName": "codex-host",
  "targetPaneId": "%12",
  "text": "npm test"
}
```

Behavior:

- sends text
- sends Enter

### Send text without Enter

```http
POST /api/relay/panes/send-text-no-enter
```

Example body:

```json
{
  "sourceBackendName": "claude-host",
  "sourcePaneId": "%1",
  "targetBackendName": "codex-host",
  "targetPaneId": "%12",
  "text": "review src/auth.ts"
}
```

Behavior:

- sends literal text only
- does not execute automatically

### Send keys

```http
POST /api/relay/panes/send-keys
```

Example body:

```json
{
  "sourceBackendName": "claude-host",
  "sourcePaneId": "%1",
  "targetBackendName": "codex-host",
  "targetPaneId": "%12",
  "keys": ["Enter"]
}
```

Use this for:

- Enter
- Ctrl-C
- navigation keys
- prompt control

### Message

```http
POST /api/relay/panes/message
```

Example body:

```json
{
  "sourceBackendName": "claude-host",
  "sourcePaneId": "%1",
  "targetBackendName": "codex-host",
  "targetPaneId": "%12",
  "text": "Please review the failing tests in api/auth.ts."
}
```

Behavior:

- prepends sender metadata
- then writes the resulting message to the target pane

## Session-level fallback operations

Use session-level relay only if pane-level identity is unavailable.

Supported operations:

- `POST /api/relay/read`
- `POST /api/relay/send-text`
- `POST /api/relay/send-text-no-enter`
- `POST /api/relay/send-keys`
- `POST /api/relay/message`

Preferred only when:

- the target has a single important pane
- pane-level metadata is unavailable
- the session itself is the stable coordination unit

## Required Interaction Pattern

Every agent should follow this sequence:

1. discover target
2. read target
3. evaluate target state
4. choose the least-invasive write action
5. log/observe follow-up output

In short:

```text
discover -> read -> decide -> write -> observe
```

Do not skip directly from discovery to write.

## Recommended Agent Behavior

### Good

- read the target pane before sending anything
- use `message` for coordination
- use `send-text-no-enter` when asking another agent to inspect a command first
- use `send-text` only when automatic execution is intended
- use `send-keys` sparingly and explicitly

### Bad

- blind writes to a pane you have not read
- using `send-text` where `message` would be safer
- guessing targets from pane index when `paneId` is available
- using session-level relay when pane-level relay is available and more precise

## Read Guard

The hub enforces a recent-read guard for write operations.

This applies to:

- session relay writes
- pane relay writes

Meaning:

- if the source has not recently read the exact target
- the hub may reject the write

This is intentional.

It prevents blind agent-to-agent interference.

## Relay Log Expectations

A relay event should be auditable by:

- operation type
- source backend/session or source backend/pane
- target backend/session or target backend/pane
- success/failure
- optional error

Agents should assume:

- relay actions are logged
- message contents may be logged depending on operation

## Suggested Prompt Guidance for Agents

If an agent is expected to use this protocol, tell it something like:

```text
When interacting with another agent terminal, always:
1. discover the target pane
2. read it first
3. then choose one of message / send-text-no-enter / send-text / send-keys
Prefer pane-level relay over session-level relay.
Do not send blind writes.
```

## Relationship to smux

This protocol intentionally follows the spirit of `smux`:

- read before write
- explicit target selection
- terminal-native agent communication

But it differs in one major way:

- `smux` is local and pane-to-pane inside a tmux environment
- `tmux-web-manager` is distributed and hub-mediated across multiple backends

So this protocol can be thought of as:

> a distributed, auditable, hub-mediated version of smux-style agent terminal orchestration
