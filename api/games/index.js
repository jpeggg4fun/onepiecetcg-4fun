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
      .select('id, code, status, host_user_id, guest_user_id, host_deck_id, guest_deck_id, first_player, created_at, updated_at, host:host_user_id(username), guest:guest_user_id(username)')
      .or(`host_user_id.eq.${session.user.id},guest_user_id.eq.${session.user.id}`)
      .order('updated_at', { ascending: false });

    if (error) throw error;

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
      host_username: Array.isArray(game.host) ? game.host[0]?.username ?? null : game.host?.username ?? null,
      guest_username: Array.isArray(game.guest) ? game.guest[0]?.username ?? null : game.guest?.username ?? null
    }));

    return sendJson(res, 200, { games });
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to list games.' });
  }
}
