import { createSession, hashPassword, normalizeUsername, validatePassword, validateUsername } from '../_lib/auth.js';
import { readJson, sendJson, methodNotAllowed } from '../_lib/http.js';
import { getSupabaseAdmin } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const { username, password } = await readJson(req);
    const normalizedUsername = normalizeUsername(username);

    if (!validateUsername(normalizedUsername)) {
      return sendJson(res, 400, { error: 'Username must have 3-24 chars and use only letters, numbers, or underscore.' });
    }

    if (!validatePassword(password)) {
      return sendJson(res, 400, { error: 'Password must have at least 6 characters.' });
    }

    const supabase = getSupabaseAdmin();
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', normalizedUsername)
      .maybeSingle();

    if (existingUser) {
      return sendJson(res, 409, { error: 'Username already exists.' });
    }

    const passwordHash = hashPassword(password);
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({ username: normalizedUsername, password_hash: passwordHash })
      .select('id, username')
      .single();

    if (error) throw error;

    await createSession(newUser.id, res);
    return sendJson(res, 201, { user: newUser });
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to register.' });
  }
}
