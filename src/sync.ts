import type { Session } from './SessionTabs';

export interface SyncState {
  sessions: Session[];
  activeSessionId: string;
  updatedAt: number;
}

interface PullResponse {
  state: SyncState | null;
}

interface PushResponse {
  state: SyncState;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Sync request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function pullSyncState(token: string): Promise<SyncState | null> {
  const data = await postJson<PullResponse>('/api/sync/pull', { token });
  return data.state;
}

export async function pushSyncState(token: string, state: SyncState): Promise<SyncState> {
  const data = await postJson<PushResponse>('/api/sync/push', { token, state });
  return data.state;
}
