import { createSession, normalizeUsername, validatePassword, verifyPassword } from '../_lib/auth.js';
import { readJson, sendJson, methodNotAllowed } from '../_lib/http.js';
import { getSupabaseAdmin } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const { username, password } = await readJson(req);
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername || !validatePassword(password)) {
      return sendJson(res, 400, { error: 'Invalid credentials.' });
    }

    const supabase = getSupabaseAdmin();
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, password_hash')
      .eq('username', normalizedUsername)
      .maybeSingle();

    if (error) throw error;
    if (!user || !verifyPassword(password, user.password_hash)) {
      return sendJson(res, 401, { error: 'Invalid credentials.' });
    }

    await createSession(user.id, res);
    return sendJson(res, 200, { user: { id: user.id, username: user.username } });
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to login.' });
  }
}
