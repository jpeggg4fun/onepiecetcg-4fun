import { getSessionUser } from '../_lib/auth.js';
import { methodNotAllowed, sendJson } from '../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const session = await getSessionUser(req);
  return sendJson(res, 200, { user: session?.user ?? null });
}
