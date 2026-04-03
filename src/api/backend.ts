export interface AuthUser {
  id: string;
  username: string;
}

export interface LobbyGame {
  id: string;
  code: string;
  status: 'waiting' | 'ready' | 'in_progress' | 'finished';
  created_at: string;
  updated_at: string;
  host_user_id: string;
  guest_user_id: string | null;
  host_username: string | null;
  guest_username: string | null;
  host_deck_id: string | null;
  guest_deck_id: string | null;
  first_player: 'P1' | 'P2' | null;
}

export interface GameSnapshotRecord {
  id: string;
  turn: number;
  phase: string;
  state_json: unknown;
  created_at: string;
}

export class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(message: string, status: number, payload: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export interface OnlineRoomGame {
  id: string;
  code: string;
  status: 'waiting' | 'ready' | 'in_progress' | 'finished';
  host_user_id: string;
  guest_user_id: string | null;
  host_deck_id: string | null;
  guest_deck_id: string | null;
  first_player: 'P1' | 'P2' | null;
  created_at: string;
  updated_at: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    ...init
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(payload.error || 'Request failed.', response.status, payload);
  }

  return payload as T;
}

export async function getSession() {
  return request<{ user: AuthUser | null }>('/api/auth/session', { method: 'GET' });
}

export async function registerUser(username: string, password: string) {
  return request<{ user: AuthUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

export async function loginUser(username: string, password: string) {
  return request<{ user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

export async function logoutUser() {
  return request<{ ok: true }>('/api/auth/logout', {
    method: 'POST'
  });
}

export async function listGames() {
  return request<{ games: LobbyGame[] }>('/api/games', { method: 'GET' });
}

export async function createGame() {
  return request<{ game: LobbyGame }>('/api/games/create', { method: 'POST' });
}

export async function joinGame(code: string) {
  return request<{ game: LobbyGame }>('/api/games/join', {
    method: 'POST',
    body: JSON.stringify({ code })
  });
}

export async function updateGameDeck(gameId: string, deckId: string) {
  return request<{ game: LobbyGame }>('/api/games/set-deck', {
    method: 'POST',
    body: JSON.stringify({ gameId, deckId })
  });
}

export async function startOnlineGame(gameId: string) {
  return request<{ game: LobbyGame }>('/api/games/start', {
    method: 'POST',
    body: JSON.stringify({ gameId })
  });
}

export async function getOnlineGameState(gameId: string) {
  return request<{ game: OnlineRoomGame; snapshot: GameSnapshotRecord | null }>(`/api/games/state?gameId=${encodeURIComponent(gameId)}`, {
    method: 'GET'
  });
}

export async function saveOnlineGameState(
  gameId: string,
  state: unknown,
  turn: number,
  phase: string,
  baseSnapshotId?: string | null
) {
  return request<{ snapshot: GameSnapshotRecord }>('/api/games/state', {
    method: 'POST',
    body: JSON.stringify({ gameId, state, turn, phase, baseSnapshotId })
  });
}
