// ══════════════════════════════════════════════════════════
//  SESSION — Current game state + save logic
// ══════════════════════════════════════════════════════════
import { db }                        from './db.js';
import { markSave }                  from './sync.js';
import { currentUser }               from './auth.js';
import { toast }                     from './ui.js';
import { logActivity }               from './activity.js';
import { MAX_BUYINGS, MAX_RESULT }   from './config.js';

// ── Session state ─────────────────────────────────────────
export let sess = {
  active:   [],       // player names currently in session
  buyings:  {},       // { name: count }
  results:  {},       // { name: number }
};

export function resetSess() {
  sess = { active: [], buyings: {}, results: {} };
}

export function togglePlayer(name) {
  if (sess.active.includes(name)) {
    sess.active        = sess.active.filter(p => p !== name);
    delete sess.buyings[name];
    delete sess.results[name];
  } else {
    sess.active.push(name);
    sess.buyings[name] = 1;
    sess.results[name] = '';
  }
}

export function changeBuying(name, delta) {
  sess.buyings[name] = Math.max(0, Math.min(MAX_BUYINGS, (sess.buyings[name] || 0) + delta));
}

export function setResult(name, value) {
  sess.results[name] = value === '' ? '' : Number(value);
}

// ── Pot calculation ───────────────────────────────────────
export function calcPot(rate) {
  return sess.active.reduce((s, p) => s + (sess.buyings[p] || 0), 0) * rate;
}

export function calcResultSum() {
  return sess.active.reduce((s, p) => {
    const v = sess.results[p];
    return s + (v === '' || v === undefined ? 0 : Number(v));
  }, 0);
}

export function allResultsFilled() {
  return sess.active.length > 0 &&
    sess.active.every(p => sess.results[p] !== '' && sess.results[p] !== undefined);
}

// ── Save to Supabase ──────────────────────────────────────
export async function saveSession(rate) {
  if (!sess.active.length) throw new Error('Koi player select nahi!');

  // Sync latest DOM values
  sess.active.forEach(p => {
    const inp = document.getElementById(`res-${CSS.escape(p)}`);
    if (inp && inp.value !== '') sess.results[p] = Number(inp.value);
    if (sess.results[p] === '' || sess.results[p] === undefined) sess.results[p] = 0;
  });

  const entries = sess.active.map(p => ({
    player_name: p,
    buyings:     Math.max(0, Math.min(MAX_BUYINGS, parseInt(sess.buyings[p]) || 1)),
    result:      Math.max(-MAX_RESULT, Math.min(MAX_RESULT, Number(sess.results[p]) || 0)),
  }));

  markSave();
  const sessionId = await db.rpc('save_session', {
    p_buying_rate: rate,
    p_entries:     entries,
    p_saved_by:    currentUser?.name || 'Unknown',
  });

  await logActivity('session_saved',
    `${entries.length} players · ₹${entries.reduce((s, e) => s + e.buyings, 0) * rate}`
  );

  return sessionId;
}
