import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { BackendRecord, ManagedSessionRecord, SessionStatus } from './types.js';

interface BackendPayload {
  backends: BackendRecord[];
}

interface SessionPayload {
  sessions: ManagedSessionRecord[];
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function normalizeBackendName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export class BackendRegistryStore {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'backends.json');
  }

  private read(): BackendPayload {
    const payload = readJsonFile<BackendPayload>(this.filePath, { backends: [] });
    return {
      backends: Array.isArray(payload.backends) ? payload.backends : [],
    };
  }

  private write(payload: BackendPayload): void {
    writeJsonFile(this.filePath, payload);
  }

  all(): BackendRecord[] {
    return this.read().backends;
  }

  getById(id: string): BackendRecord | undefined {
    return this.read().backends.find((backend) => backend.id === id);
  }

  save(input: { id?: string; name: string; baseUrl: string; authToken?: string }): BackendRecord {
    const payload = this.read();
    const normalizedName = normalizeBackendName(input.name);
    const duplicate = payload.backends.find(
      (backend) => backend.id !== input.id && normalizeBackendName(backend.name) === normalizedName,
    );
    if (duplicate) {
      throw new Error(`Backend name already exists: ${input.name}`);
    }
    const now = new Date().toISOString();
    const next: BackendRecord = {
      id: input.id || crypto.randomUUID(),
      name: input.name,
      baseUrl: input.baseUrl,
      authToken: input.authToken || '',
      createdAt: now,
      updatedAt: now,
    };
    const index = payload.backends.findIndex((backend) => backend.id === next.id);
    if (index >= 0) {
      next.createdAt = payload.backends[index]!.createdAt;
      payload.backends[index] = next;
    } else {
      payload.backends.push(next);
    }
    this.write(payload);
    return next;
  }

  remove(id: string): boolean {
    const payload = this.read();
    const next = payload.backends.filter((backend) => backend.id !== id);
    if (next.length === payload.backends.length) {
      return false;
    }
    this.write({ backends: next });
    return true;
  }
}

export class ManagedSessionStore {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'sessions.json');
  }

  private read(): SessionPayload {
    const payload = readJsonFile<SessionPayload>(this.filePath, { sessions: [] });
    return {
      sessions: Array.isArray(payload.sessions) ? payload.sessions : [],
    };
  }

  private write(payload: SessionPayload): void {
    writeJsonFile(this.filePath, payload);
  }

  all(): ManagedSessionRecord[] {
    return this.read().sessions;
  }

  getById(id: string): ManagedSessionRecord | undefined {
    return this.read().sessions.find((session) => session.id === id);
  }

  create(input: {
    tmuxSessionName: string;
    requestedPath: string;
    currentPath: string;
    status?: SessionStatus;
    createdAt?: string;
    lastActivityAt?: string;
  }): ManagedSessionRecord {
    const payload = this.read();
    const session: ManagedSessionRecord = {
      id: crypto.randomUUID(),
      tmuxSessionName: input.tmuxSessionName,
      requestedPath: input.requestedPath,
      currentPath: input.currentPath,
      status: input.status || 'running',
      createdAt: input.createdAt || new Date().toISOString(),
      lastActivityAt: input.lastActivityAt,
    };
    payload.sessions.unshift(session);
    this.write(payload);
    return session;
  }

  update(session: ManagedSessionRecord): ManagedSessionRecord {
    const payload = this.read();
    const index = payload.sessions.findIndex((entry) => entry.id === session.id);
    if (index === -1) {
      throw new Error(`Unknown session id: ${session.id}`);
    }
    payload.sessions[index] = session;
    this.write(payload);
    return session;
  }

  remove(id: string): boolean {
    const payload = this.read();
    const next = payload.sessions.filter((session) => session.id !== id);
    if (next.length === payload.sessions.length) {
      return false;
    }
    this.write({ sessions: next });
    return true;
  }
}
