import { getSessionUser } from '../_lib/auth.js';
import { methodNotAllowed, sendJson } from '../_lib/http.js';
import { getSupabaseAdmin } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const session = await getSessionUser(req);
  if (!session?.user) return sendJson(res, 401, { error: 'Unauthorized' });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('games')
      .select('id, code, status, host_user_id, guest_user_id, host_deck_id, guest_deck_id, first_player, created_at, updated_at')
      .or(`host_user_id.eq.${session.user.id},guest_user_id.eq.${session.user.id}`)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const userIds = Array.from(new Set((data ?? [])
      .flatMap((game) => [game.host_user_id, game.guest_user_id])
      .filter(Boolean)));

    let usernameById = new Map();
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, username')
        .in('id', userIds);

      if (usersError) throw usersError;
      usernameById = new Map((users ?? []).map((user) => [user.id, user.username]));
    }

    const games = (data ?? []).map((game) => ({
      id: game.id,
      code: game.code,
      status: game.status,
      created_at: game.created_at,
      updated_at: game.updated_at,
      host_user_id: game.host_user_id,
      guest_user_id: game.guest_user_id,
      host_deck_id: game.host_deck_id ?? null,
      guest_deck_id: game.guest_deck_id ?? null,
      first_player: game.first_player ?? null,
      host_username: usernameById.get(game.host_user_id) ?? null,
      guest_username: game.guest_user_id ? usernameById.get(game.guest_user_id) ?? null : null
    }));

    return sendJson(res, 200, { games });
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to list games.' });
  }
}
