// ══════════════════════════════════════════════════════════
//  ACTIVITY — Log + 7-day auto cleanup
// ══════════════════════════════════════════════════════════
import { db }          from './db.js';
import { currentUser } from './auth.js';

export async function logActivity(action, detail = '') {
  try {
    await db.post('poker_activity', {
      action,
      done_by: currentUser?.name || 'System',
      detail,
    });
  } catch { /* log failure should never break main flow */ }
}

export async function cleanupOldLogs() {
  try {
    const deleted = await db.rpc('cleanup_old_logs', {});
    if (deleted > 0) console.info(`[Activity] ${deleted} old logs cleaned up`);
  } catch { /* ignore */ }
}

export const ACTION_META = {
  session_saved:       { icon: '✅', label: 'Session saved',           color: '#22c55e' },
  session_deleted:     { icon: '🗑', label: 'Session trashed',         color: '#ef4444' },
  session_restored:    { icon: '♻️', label: 'Session restored',        color: '#22c55e' },
  session_purged:      { icon: '💥', label: 'Session permanently deleted', color: '#ef4444' },
  player_added:        { icon: '➕', label: 'Player added',            color: '#eab308' },
  player_deleted:      { icon: '🗑', label: 'Player trashed',          color: '#ef4444' },
  player_restored:     { icon: '♻️', label: 'Player restored',         color: '#22c55e' },
  player_purged:       { icon: '💥', label: 'Player permanently deleted', color: '#ef4444' },
  player_activated:    { icon: '✅', label: 'Player activated',        color: '#22c55e' },
  player_deactivated:  { icon: '💤', label: 'Player deactivated',      color: '#94a3b8' },
  data_reset:          { icon: '💥', label: 'All data reset',          color: '#ef4444' },
};
