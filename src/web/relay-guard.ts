import type { RelayPaneTargetRequest, RelayTargetRequest } from './helpers.js';

export const RELAY_READ_GUARD_WINDOW_MS = 5 * 60 * 1000;

export function buildRelayGuardKey(request: RelayTargetRequest): string {
  return [
    request.sourceBackendName,
    request.sourceSessionName,
    request.targetBackendName,
    request.targetSessionName,
  ].join('\u0000');
}

export function buildRelayPaneGuardKey(request: RelayPaneTargetRequest): string {
  return [
    request.sourceBackendName,
    request.sourcePaneId,
    request.targetBackendName,
    request.targetPaneId,
  ].join('\u0000');
}

export function createRelayReadGuard(maxAgeMs = RELAY_READ_GUARD_WINDOW_MS) {
  const recentReads = new Map<string, number>();

  function prune(now = Date.now()): void {
    for (const [key, timestamp] of recentReads) {
      if (now - timestamp > maxAgeMs) {
        recentReads.delete(key);
      }
    }
  }

  return {
    markRead(request: RelayTargetRequest, now = Date.now()): void {
      prune(now);
      recentReads.set(buildRelayGuardKey(request), now);
    },
    requireRecentRead(request: RelayTargetRequest, now = Date.now()): void {
      prune(now);
      const key = buildRelayGuardKey(request);
      const timestamp = recentReads.get(key);
      if (!timestamp || now - timestamp > maxAgeMs) {
        throw new Error(
          `Recent read required before relay write: ${request.sourceBackendName}/${request.sourceSessionName} -> ${request.targetBackendName}/${request.targetSessionName}`,
        );
      }
    },
  };
}

export function createRelayPaneReadGuard(maxAgeMs = RELAY_READ_GUARD_WINDOW_MS) {
  const recentReads = new Map<string, number>();

  function prune(now = Date.now()): void {
    for (const [key, timestamp] of recentReads) {
      if (now - timestamp > maxAgeMs) {
        recentReads.delete(key);
      }
    }
  }

  return {
    markRead(request: RelayPaneTargetRequest, now = Date.now()): void {
      prune(now);
      recentReads.set(buildRelayPaneGuardKey(request), now);
    },
    requireRecentRead(request: RelayPaneTargetRequest, now = Date.now()): void {
      prune(now);
      const key = buildRelayPaneGuardKey(request);
      const timestamp = recentReads.get(key);
      if (!timestamp || now - timestamp > maxAgeMs) {
        throw new Error(
          `Recent read required before pane relay write: ${request.sourceBackendName}/${request.sourcePaneId} -> ${request.targetBackendName}/${request.targetPaneId}`,
        );
      }
    },
  };
}
