// ══════════════════════════════════════════════════════════
//  TRASH — Recycle bin (admin only)
// ══════════════════════════════════════════════════════════
import { db }          from './db.js';
import { currentUser } from './auth.js';
import { logActivity } from './activity.js';
import { loadAll }     from './sync.js';

// ── Soft delete helpers ───────────────────────────────────
export async function softDeleteSession(id) {
  await db.patch(`poker_sessions?id=eq.${id}`, {
    deleted_at: new Date().toISOString(),
    deleted_by: currentUser?.name || 'Admin',
  });
  await logActivity('session_deleted', 'Session moved to trash');
}

export async function softDeletePlayer(id, name) {
  await db.patch(`poker_players?id=eq.${id}`, {
    deleted_at: new Date().toISOString(),
    deleted_by: currentUser?.name || 'Admin',
    device_id:  null,  // force logout
  });
  await logActivity('player_deleted', name);
}

// ── Restore ───────────────────────────────────────────────
export async function restoreSession(id) {
  await db.patch(`poker_sessions?id=eq.${id}`, {
    deleted_at: null,
    deleted_by: null,
  });
  await logActivity('session_restored', 'Session restored from trash');
  await loadAll();
}

export async function restorePlayer(id, name) {
  await db.patch(`poker_players?id=eq.${id}`, {
    deleted_at: null,
    deleted_by: null,
  });
  await logActivity('player_restored', name);
  await loadAll();
}

// ── Permanent delete ──────────────────────────────────────
export async function purgeSession(id) {
  await db.del(`poker_entries?session_id=eq.${id}`);
  await db.del(`poker_sessions?id=eq.${id}`);
  await logActivity('session_purged', 'Session permanently deleted');
}

export async function purgePlayer(id, name) {
  await db.del(`poker_players?id=eq.${id}`);
  await logActivity('player_purged', name);
}

// ── Fetch trash data ──────────────────────────────────────
export async function fetchTrashedSessions() {
  const rows = await db.get(
    'poker_sessions?deleted_at=not.is.null&order=deleted_at.desc&select=id,played_at,buying_rate,saved_by,deleted_at,deleted_by'
  );
  if (!rows?.length) return [];

  const entries = await db.get(
    `poker_entries?session_id=in.(${rows.map(r => r.id).join(',')})&select=session_id,player_name,buyings,result`
  );
  const em = {};
  (entries || []).forEach(e => {
    if (!em[e.session_id]) em[e.session_id] = [];
    em[e.session_id].push(e);
  });
  return rows.map(s => ({ ...s, entries: em[s.id] || [] }));
}

export async function fetchTrashedPlayers() {
  return await db.get(
    'poker_players?deleted_at=not.is.null&order=deleted_at.desc&select=id,name,phone,deleted_at,deleted_by'
  ) || [];
}

// ── Trash count (for badge) ───────────────────────────────
export async function getTrashCount() {
  const [s, p] = await Promise.all([
    db.get('poker_sessions?deleted_at=not.is.null&select=id'),
    db.get('poker_players?deleted_at=not.is.null&select=id'),
  ]);
  return (s?.length || 0) + (p?.length || 0);
}
