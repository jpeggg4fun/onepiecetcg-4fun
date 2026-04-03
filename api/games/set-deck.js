import { getSessionUser } from '../_lib/auth.js';
import { methodNotAllowed, readJson, sendJson } from '../_lib/http.js';
import { getSupabaseAdmin } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const session = await getSessionUser(req);
  if (!session?.user) return sendJson(res, 401, { error: 'Unauthorized' });

  try {
    const { gameId, deckId } = await readJson(req);
    if (!gameId || !deckId) {
      return sendJson(res, 400, { error: 'gameId and deckId are required.' });
    }

    const supabase = getSupabaseAdmin();
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, host_user_id, guest_user_id, status')
      .eq('id', gameId)
      .maybeSingle();

    if (gameError) throw gameError;
    if (!game) return sendJson(res, 404, { error: 'Game not found.' });
    if (game.status === 'in_progress' || game.status === 'finished') {
      return sendJson(res, 409, { error: 'Cannot change decks after the game has started.' });
    }

    let updatePayload;
    if (game.host_user_id === session.user.id) {
      updatePayload = { host_deck_id: deckId };
    } else if (game.guest_user_id === session.user.id) {
      updatePayload = { guest_deck_id: deckId };
    } else {
      return sendJson(res, 403, { error: 'You are not part of this game.' });
    }

    const { data: updatedGame, error } = await supabase
      .from('games')
      .update(updatePayload)
      .eq('id', gameId)
      .select('id, code, status, host_user_id, guest_user_id, host_deck_id, guest_deck_id, first_player, created_at, updated_at')
      .single();

    if (error) throw error;

    return sendJson(res, 200, { game: updatedGame });
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to set deck.' });
  }
}
