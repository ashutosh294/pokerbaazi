// ══════════════════════════════════════════════════════════
//  SYNC — Offline cache + Realtime + Online/Offline
// ══════════════════════════════════════════════════════════
import { SB_URL, SB_KEY, CACHE_KEY, WS_RECONNECT } from './config.js';
import { db }    from './db.js';
import { toast } from './ui.js';

// ── State ─────────────────────────────────────────────────
export let players  = [];
export let sessions = [];
export let pStats   = [];

let realtimeWs   = null;
let lastSaveTime = 0;
let syncDotEl    = null;

// ── Sync dot (status indicator) ──────────────────────────
export function initSyncDot(el) { syncDotEl = el; }
export function setSync(state) {
  if (!syncDotEl) return;
  syncDotEl.className = 'sync-dot' + (state ? ` ${state}` : '');
}

// ── Load all data from Supabase ───────────────────────────
export async function loadAll() {
  const [pl, rawSess, entries, statsRaw] = await Promise.all([
    db.get('poker_players?order=created_at.asc&select=id,name,phone,is_active,is_admin,created_at&deleted_at=is.null'),
    db.get('poker_sessions?order=played_at.desc&select=id,played_at,buying_rate,saved_by&limit=200&deleted_at=is.null'),
    db.get('poker_entries?select=session_id,player_name,buyings,result'),
    db.get('player_stats_cache?select=*'),
  ]);

  players = pl       || [];
  pStats  = statsRaw || [];

  if (!rawSess?.length) {
    sessions = [];
  } else {
    const em = {};
    (entries || []).forEach(e => {
      if (!em[e.session_id]) em[e.session_id] = [];
      em[e.session_id].push(e);
    });
    sessions = rawSess.map(s => ({ ...s, entries: em[s.id] || [] }));
  }

  saveCache();
  return { players, sessions, pStats };
}

// ── localStorage cache ────────────────────────────────────
export function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      players, sessions, pStats, cachedAt: Date.now(),
    }));
  } catch { /* storage full — ignore */ }
}

export function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    players  = d.players  || [];
    sessions = d.sessions || [];
    pStats   = d.pStats   || [];
    return true;
  } catch {
    return false;
  }
}

// ── Mark save time (suppress self-toast on realtime) ─────
export function markSave() { lastSaveTime = Date.now(); }

// ── Realtime WebSocket ────────────────────────────────────
export function setupRealtime(onUpdate) {
  if (!SB_URL || SB_URL === '__SB_URL__') return;

  const wsUrl = SB_URL.replace('https://', 'wss://')
    + '/realtime/v1/websocket?apikey=' + SB_KEY + '&vsn=1.0.0';

  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      topic:   'realtime:poker',
      event:   'phx_join',
      payload: {
        config: {
          broadcast:        { self: false },
          postgres_changes: [
            { event: '*', schema: 'public', table: 'poker_sessions' },
            { event: '*', schema: 'public', table: 'poker_entries'  },
            { event: '*', schema: 'public', table: 'poker_players'  },
          ],
        },
      },
      ref: '1',
    }));
    setSync('on');
  };

  ws.onmessage = async (msg) => {
    const data = JSON.parse(msg.data);
    if (data.event === 'phx_reply' && data.payload?.status === 'ok') return;
    if (data.event === 'heartbeat') {
      ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null }));
      return;
    }
    if (data.event === 'postgres_changes' || data.payload?.data) {
      const isSelf = (Date.now() - lastSaveTime) < 3000;
      await loadAll();
      onUpdate();
      if (!isSelf) toast('🔄 Data updated!');
    }
  };

  ws.onclose = () => {
    setSync('');
    realtimeWs = null;
    setTimeout(() => setupRealtime(onUpdate), WS_RECONNECT);
  };

  ws.onerror = () => ws.close();
  realtimeWs = ws;
}

// ── Online/Offline banner ─────────────────────────────────
export function initNetworkListeners(onOnline) {
  window.addEventListener('online', async () => {
    document.getElementById('offline-bar').style.display = 'none';
    await loadAll();
    onOnline();
  });
  window.addEventListener('offline', () => {
    document.getElementById('offline-bar').style.display = 'flex';
    setSync('err');
  });
}
