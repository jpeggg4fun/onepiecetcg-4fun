import { getSessionUser } from '../_lib/auth.js';
import { readJson, methodNotAllowed, sendJson } from '../_lib/http.js';
import { getSupabaseAdmin } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const session = await getSessionUser(req);
  if (!session?.user) return sendJson(res, 401, { error: 'Unauthorized' });

  try {
    const { code } = await readJson(req);
    const normalizedCode = String(code || '').trim().toUpperCase();

    if (!normalizedCode) {
      return sendJson(res, 400, { error: 'Game code is required.' });
    }

    const supabase = getSupabaseAdmin();
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, code, status, host_user_id, guest_user_id')
      .eq('code', normalizedCode)
      .maybeSingle();

    if (gameError) throw gameError;
    if (!game) return sendJson(res, 404, { error: 'Game not found.' });
    if (game.host_user_id === session.user.id) return sendJson(res, 400, { error: 'You already host this game.' });
    if (game.guest_user_id && game.guest_user_id !== session.user.id) return sendJson(res, 409, { error: 'Game already has two players.' });

    const { data: updatedGame, error } = await supabase
      .from('games')
      .update({
        guest_user_id: session.user.id,
        status: 'ready'
      })
      .eq('id', game.id)
      .select('id, code, status, host_user_id, guest_user_id, created_at, updated_at')
      .single();

    if (error) throw error;

    return sendJson(res, 200, { game: updatedGame });
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to join game.' });
  }
}
