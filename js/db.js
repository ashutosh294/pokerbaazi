// ══════════════════════════════════════════════════════════
//  DB — Supabase REST wrapper
// ══════════════════════════════════════════════════════════
import { SB_URL, SB_KEY } from './config.js';
import { setSync }        from './sync.js';

async function req(method, path, body) {
  setSync('busy');
  const isRpc = path.startsWith('rpc/');
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
      method,
      headers: {
        'apikey':        SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        isRpc ? '' : method === 'POST' ? 'return=representation' : 'return=minimal',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    setSync('on');
    if (!r.ok) {
      const err = await r.json().catch(() => ({ message: r.statusText }));
      throw new Error(err.message || `HTTP ${r.status}`);
    }
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  } catch (e) {
    setSync('err');
    throw e;
  }
}

export const db = {
  get:   (path)        => req('GET',    path),
  post:  (path, body)  => req('POST',   path, body),
  patch: (path, body)  => req('PATCH',  path, body),
  del:   (path)        => req('DELETE', path),
  rpc:   (fn, params)  => req('POST',   `rpc/${fn}`, params),
};
