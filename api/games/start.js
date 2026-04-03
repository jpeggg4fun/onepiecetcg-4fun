import { getSessionUser } from '../_lib/auth.js';
import { methodNotAllowed, readJson, sendJson } from '../_lib/http.js';
import { getSupabaseAdmin } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const session = await getSessionUser(req);
  if (!session?.user) return sendJson(res, 401, { error: 'Unauthorized' });

  try {
    const { gameId } = await readJson(req);
    if (!gameId) return sendJson(res, 400, { error: 'gameId is required.' });

    const supabase = getSupabaseAdmin();
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, host_user_id, guest_user_id, host_deck_id, guest_deck_id, status')
      .eq('id', gameId)
      .maybeSingle();

    if (gameError) throw gameError;
    if (!game) return sendJson(res, 404, { error: 'Game not found.' });
    if (game.host_user_id !== session.user.id) return sendJson(res, 403, { error: 'Only the host can start the match.' });
    if (!game.guest_user_id) return sendJson(res, 409, { error: 'Waiting for the second player.' });
    if (!game.host_deck_id || !game.guest_deck_id) return sendJson(res, 409, { error: 'Both players must select a deck first.' });

    const firstPlayer = Math.random() < 0.5 ? 'P1' : 'P2';
    const seed = Math.floor(Math.random() * 2147483647);
    const { data: updatedGame, error } = await supabase
      .from('games')
      .update({
        status: 'in_progress',
        first_player: firstPlayer
      })
      .eq('id', gameId)
      .select('id, code, status, host_user_id, guest_user_id, host_deck_id, guest_deck_id, first_player, created_at, updated_at')
      .single();

    if (error) throw error;

    await supabase.from('game_state_snapshots').insert({
      game_id: gameId,
      turn: 1,
      phase: 'setup',
      state_json: {
        host_deck_id: game.host_deck_id,
        guest_deck_id: game.guest_deck_id,
        first_player: firstPlayer,
        seed,
        started_by: session.user.id
      }
    });

    return sendJson(res, 200, { game: updatedGame });
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to start game.' });
  }
}
