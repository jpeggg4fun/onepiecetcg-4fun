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
    throw new Error(payload.error || 'Request failed.');
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
