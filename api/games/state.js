import { getSessionUser } from '../_lib/auth.js';
import { methodNotAllowed, readJson, sendJson } from '../_lib/http.js';
import { getSupabaseAdmin } from '../_lib/supabase.js';

async function ensureMember(gameId, userId, supabase) {
  const { data: game, error } = await supabase
    .from('games')
    .select('id, code, status, host_user_id, guest_user_id, host_deck_id, guest_deck_id, first_player, created_at, updated_at')
    .eq('id', gameId)
    .maybeSingle();

  if (error) throw error;
  if (!game) return null;
  if (game.host_user_id !== userId && game.guest_user_id !== userId) return false;
  return game;
}

async function getLatestSnapshot(gameId, supabase) {
  const { data: snapshot, error } = await supabase
    .from('game_state_snapshots')
    .select('id, turn, phase, state_json, created_at')
    .eq('game_id', gameId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return snapshot ?? null;
}

export default async function handler(req, res) {
  const session = await getSessionUser(req);
  if (!session?.user) return sendJson(res, 401, { error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();

  try {
    if (req.method === 'GET') {
      const gameId = String(req.query.gameId || '');
      if (!gameId) return sendJson(res, 400, { error: 'gameId is required.' });

      const game = await ensureMember(gameId, session.user.id, supabase);
      if (game === false) return sendJson(res, 403, { error: 'Forbidden' });
      if (!game) return sendJson(res, 404, { error: 'Game not found.' });

      const snapshot = await getLatestSnapshot(gameId, supabase);

      return sendJson(res, 200, { game, snapshot: snapshot ?? null });
    }

    if (req.method === 'POST') {
      const { gameId, state, turn, phase, baseSnapshotId } = await readJson(req);
      if (!gameId || !state) return sendJson(res, 400, { error: 'gameId and state are required.' });

      const game = await ensureMember(gameId, session.user.id, supabase);
      if (game === false) return sendJson(res, 403, { error: 'Forbidden' });
      if (!game) return sendJson(res, 404, { error: 'Game not found.' });

      const latestSnapshot = await getLatestSnapshot(gameId, supabase);
      const latestSnapshotId = latestSnapshot?.id ?? null;

      if ((baseSnapshotId ?? null) !== latestSnapshotId) {
        return sendJson(res, 409, {
          error: 'A sala recebeu uma atualização mais nova. Recarregue o estado antes de jogar.',
          conflict: true,
          latestSnapshot,
          game
        });
      }

      const nextTurn = typeof turn === 'number' ? turn : state.turn ?? 1;
      const nextPhase = typeof phase === 'string' ? phase : state.phase ?? 'setup';

      const { data: insertedSnapshot, error: insertError } = await supabase
        .from('game_state_snapshots')
        .insert({
          game_id: gameId,
          turn: nextTurn,
          phase: nextPhase,
          state_json: state
        })
        .select('id, turn, phase, state_json, created_at')
        .single();

      if (insertError) throw insertError;

      await supabase
        .from('games')
        .update({
          status: state.status === 'finished' ? 'finished' : 'in_progress'
        })
        .eq('id', gameId);

      return sendJson(res, 200, { snapshot: insertedSnapshot });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to handle game state.' });
  }
}
