export type RunMode = 'main' | 'sub';
export type TmuxSocketMode = 'default' | 'dedicated';

export type SessionStatus = 'running' | 'stopped' | 'error';

export interface BackendRecord {
  id: string;
  name: string;
  baseUrl: string;
  authToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedSessionRecord {
  id: string;
  tmuxSessionName: string;
  requestedPath: string;
  currentPath: string;
  status: SessionStatus;
  createdAt: string;
  lastActivityAt?: string;
}

export interface AggregatedSessionRecord extends ManagedSessionRecord {
  backendId: string;
  backendName: string;
  backendBaseUrl: string;
}

export interface BackendHealth {
  ok: true;
  serverName: string;
  tmuxSocketName: string;
  ohMyTmuxConfigPath: string | null;
}

export interface BackendState {
  backend: BackendRecord;
  online: boolean;
  error?: string;
  health?: BackendHealth;
  sessions: AggregatedSessionRecord[];
}
