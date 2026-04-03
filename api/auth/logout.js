import { destroySession } from '../_lib/auth.js';
import { methodNotAllowed, sendJson } from '../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  await destroySession(req, res);
  return sendJson(res, 200, { ok: true });
}
