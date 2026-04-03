import crypto from 'node:crypto';
import { getSessionUser } from '../_lib/auth.js';
import { methodNotAllowed, sendJson } from '../_lib/http.js';
import { getSupabaseAdmin } from '../_lib/supabase.js';

function createRoomCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const session = await getSessionUser(req);
  if (!session?.user) return sendJson(res, 401, { error: 'Unauthorized' });

  try {
    const supabase = getSupabaseAdmin();
    let createdGame = null;

    for (let attempt = 0; attempt < 5 && !createdGame; attempt++) {
      const code = createRoomCode();
      const { data, error } = await supabase
        .from('games')
        .insert({
          code,
          host_user_id: session.user.id,
          status: 'waiting'
        })
        .select('id, code, status, host_user_id, guest_user_id, created_at, updated_at')
        .single();

      if (!error) {
        createdGame = data;
      }
    }

    if (!createdGame) {
      return sendJson(res, 500, { error: 'Failed to generate a unique game code.' });
    }

    return sendJson(res, 201, { game: createdGame });
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to create game.' });
  }
}
