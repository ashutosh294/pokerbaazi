// ══════════════════════════════════════════════════════════
//  UI — All render functions + DOM helpers
// ══════════════════════════════════════════════════════════
import { players, sessions, pStats }       from './sync.js';
import { currentUser, isAdmin, isMember, canWrite, canDelete } from './auth.js';
import { sess, calcPot, calcResultSum, allResultsFilled } from './session.js';
import { computeBalances, minTransactions, settleText }   from './settle.js';
import { computePlayerStats, drawGraph, GRAPH_COLORS }    from './stats.js';
import { ACTION_META }                                    from './activity.js';
import { getTrashCount }                                  from './trash.js';
import { db }                                             from './db.js';

// ── Escape helper ─────────────────────────────────────────
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Toast ─────────────────────────────────────────────────
export function toast(msg, duration = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), duration);
}

// ── Tab switching ─────────────────────────────────────────
let activeTab = 'board';
export function switchTab(name) {
  activeTab = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${name}`)?.classList.add('active');
  document.getElementById(`nav-${name}`)?.classList.add('active');

  const renders = {
    board:    renderBoard,
    session:  renderSessionTab,
    history:  renderHistory,
    settle:   renderSettle,
    stats:    renderStats,
    trash:    renderTrash,
    more:     renderMore,
    activity: renderActivity,
  };
  renders[name]?.();
}

// ── Render all ────────────────────────────────────────────
export function renderAll() {
  renderBoard();
  renderSessionTab();
  renderHistory();
  renderSettle();
  renderStats();
  renderMore();
  updateTrashBadge();
  updateUserBar();
}

// ── User bar ──────────────────────────────────────────────
export function updateUserBar() {
  const bar  = document.getElementById('user-bar');
  const name = document.getElementById('user-name');
  const role = document.getElementById('user-role');
  if (!bar) return;
  if (currentUser) {
    bar.classList.add('show');
    name.textContent = currentUser.name;
    role.textContent = isAdmin ? 'Admin 👑' : 'Member';
  } else {
    bar.classList.remove('show');
  }
}

// ── Board (Leaderboard) ───────────────────────────────────
export function renderBoard() {
  const el  = document.getElementById('lb-list');
  const sum = document.getElementById('lb-sum');
  if (!el) return;

  const totalPot = sessions.reduce(
    (s, ss) => s + ss.entries.reduce((a, e) => a + e.buyings, 0) * ss.buying_rate, 0
  );

  sum.innerHTML = `
    <div class="stat-pill"><div class="sp-val">${sessions.length}</div><div class="sp-key">Sessions</div></div>
    <div class="stat-pill"><div class="sp-val">₹${fmt(totalPot)}</div><div class="sp-key">Total pot</div></div>
    <div class="stat-pill"><div class="sp-val">${players.length}</div><div class="sp-key">Players</div></div>`;

  if (!pStats.length) {
    el.innerHTML = empty('🃏', 'Koi session nahi. Khelo!');
    return;
  }

  const sorted = [...pStats].sort((a, b) => Number(b.net_profit) - Number(a.net_profit));
  el.innerHTML = sorted.map((s, i) => {
    const net  = Number(s.net_profit);
    const cls  = net > 0 ? 'pos' : net < 0 ? 'neg' : 'zero';
    const sign = net > 0 ? '+' : '';
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    return `<div class="lb-row ${cls}">
      <div class="lb-rank">${medal}</div>
      <div class="lb-info">
        <div class="lb-name">${esc(s.name)}</div>
        <div class="lb-meta">${s.total_sessions} sessions · ${s.total_buyings} buyings</div>
      </div>
      <div class="lb-net ${cls}">${sign}₹${fmt(Math.abs(net))}</div>
    </div>`;
  }).join('');
}

// ── Session tab ───────────────────────────────────────────
export function renderSessionTab() {
  renderPlayerToggles();
  renderEntries();
}

export function renderPlayerToggles() {
  const el = document.getElementById('player-togs');
  if (!el) return;
  const active = players.filter(p => p.is_active !== false);
  if (!active.length) {
    el.innerHTML = `<div class="hint">⚙️ More tab mein players add karo</div>`;
    return;
  }
  el.innerHTML = active.map(p => {
    const on = sess.active.includes(p.name);
    return `<button class="ptog ${on ? 'on' : ''}" data-name="${esc(p.name)}"
      onclick="app.toggleP(this.dataset.name)">${on ? '✓ ' : ''}${esc(p.name)}</button>`;
  }).join('');
}

export function renderEntries() {
  const el   = document.getElementById('sess-entries');
  const rate = getRate();
  if (!el) return;

  if (!sess.active.length) {
    el.innerHTML = `<div class="hint" style="padding:24px 0">Players select karo ↑</div>`;
    document.getElementById('pot-val').textContent = '₹0';
    document.getElementById('pot-sub').textContent = '';
    document.getElementById('warn-box').style.display = 'none';
    return;
  }

  el.innerHTML = sess.active.map(p => {
    const b  = sess.buyings[p] || 0;
    const r  = sess.results[p] !== undefined ? sess.results[p] : '';
    const ep = esc(p);
    return `<div class="entry-row">
      <div class="entry-name">${ep}</div>
      <div class="buy-ctrl">
        <button class="buy-btn" data-name="${ep}" onclick="app.chgBuy(this.dataset.name,-1)">−</button>
        <span class="buy-cnt" id="bc-${ep}">${b}</span>
        <button class="buy-btn" data-name="${ep}" onclick="app.chgBuy(this.dataset.name,1)">+</button>
      </div>
      <input class="res-inp" type="number" id="res-${ep}"
        value="${r}" placeholder="±₹"
        oninput="app.onRes('${ep}',this.value)">
    </div>`;
  }).join('');

  // Pot
  const pot = calcPot(rate);
  const tot = sess.active.reduce((s, p) => s + (sess.buyings[p] || 0), 0);
  document.getElementById('pot-val').textContent = `₹${fmt(pot)}`;
  document.getElementById('pot-sub').textContent = `${tot} buyings × ₹${rate}`;

  // Warn
  const warn = document.getElementById('warn-box');
  if (allResultsFilled()) {
    const sum = calcResultSum();
    if (Math.abs(sum) > 1) {
      warn.style.display = 'block';
      warn.textContent   = `⚠️ Sum = ₹${sum} (₹0 hona chahiye)`;
    } else {
      warn.style.display = 'none';
    }
  } else {
    warn.style.display = 'none';
  }
}

// ── History ───────────────────────────────────────────────
export function renderHistory() {
  const el = document.getElementById('hist-list');
  if (!el) return;
  if (!sessions.length) { el.innerHTML = empty('📜', 'Koi session nahi abhi'); return; }

  el.innerHTML = sessions.map((s, idx) => {
    const d   = new Date(s.played_at);
    const ds  = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const ts  = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const pot = s.entries.reduce((a, e) => a + e.buyings, 0) * s.buying_rate;

    const rows = s.entries.map(e => {
      const cls = e.result > 0 ? 'pos' : e.result < 0 ? 'neg' : 'zero';
      return `<div class="hist-row">
        <span class="h-name">${esc(e.player_name)}</span>
        <span class="h-buy">${e.buyings}×</span>
        <span class="h-net ${cls}">${e.result > 0 ? '+' : ''}₹${fmt(e.result)}</span>
      </div>`;
    }).join('');

    const delBtn = canDelete()
      ? `<button class="icon-btn danger" data-id="${esc(s.id)}" onclick="app.trashSession(this.dataset.id)" title="Trash">🗑</button>`
      : '';

    return `<div class="hist-card">
      <div class="hist-hdr">
        <div>
          <div class="hist-ttl">Session #${sessions.length - idx}</div>
          <div class="hist-meta">${ds} · ${ts} · ₹${fmt(pot)} pot · by ${esc(s.saved_by)}</div>
        </div>
        ${delBtn}
      </div>
      <div class="hist-body">${rows}</div>
    </div>`;
  }).join('');
}

// ── Settle ────────────────────────────────────────────────
let settleSrc = 'last';
export function setSettleSrc(src) {
  settleSrc = src;
  document.getElementById('st-last').classList.toggle('active', src === 'last');
  document.getElementById('st-all').classList.toggle('active', src === 'all');
  renderSettle();
}

export function renderSettle() {
  const el = document.getElementById('settle-body');
  const cp = document.getElementById('settle-copy');
  if (!el) return;

  if (!sessions.length) {
    el.innerHTML = empty('💸', 'Koi session nahi abhi');
    cp.style.display = 'none';
    return;
  }

  const ss   = settleSrc === 'last' ? [sessions[0]] : sessions;
  const bal  = computeBalances(ss);
  const txns = minTransactions(bal);
  const pot  = ss.reduce((s, x) => s + x.entries.reduce((a, e) => a + e.buyings, 0) * x.buying_rate, 0);

  let html = `<div class="stat-pills mb">
    <div class="stat-pill"><div class="sp-val">₹${fmt(pot)}</div><div class="sp-key">Pot</div></div>
    <div class="stat-pill"><div class="sp-val">${ss.length}</div><div class="sp-key">Sessions</div></div>
    <div class="stat-pill"><div class="sp-val">${txns.length}</div><div class="sp-key">Payments</div></div>
  </div>
  <div class="section-label">Balances</div>`;

  Object.entries(bal).sort((a, b) => b[1] - a[1]).forEach(([n, a]) => {
    const cls = a > 0 ? 'pos' : a < 0 ? 'neg' : 'zero';
    html += `<div class="bal-row">
      <span class="bal-name">${esc(n)}</span>
      <span class="bal-amt ${cls}">${a > 0 ? '+' : ''}₹${fmt(Math.round(a))}</span>
    </div>`;
  });

  if (!txns.length) {
    html += `<div class="all-settled">✅ Sab settled!</div>`;
    cp.style.display = 'none';
  } else {
    html += `<div class="section-label" style="margin-top:16px">Payments needed</div>`;
    txns.forEach((t, i) => {
      html += `<div class="txn-card" style="animation-delay:${i * 60}ms">
        <span class="txn-from">${esc(t.from)}</span>
        <span class="txn-arrow">→</span>
        <span class="txn-to">${esc(t.to)}</span>
        <span class="txn-amt">₹${fmt(t.amount)}</span>
      </div>`;
    });
    cp.style.display = 'block';
    cp.onclick = () => {
      navigator.clipboard.writeText(settleText(txns, bal, settleSrc))
        .then(() => toast('Copied! 📋'))
        .catch(() => toast('Copy failed'));
    };
  }
  el.innerHTML = html;
}

// ── Stats ─────────────────────────────────────────────────
let statsView = 'ranking'; // 'ranking' | 'player'
let statsName = null;
let graphActive = [];

export function renderStats() {
  if (statsView === 'ranking') renderStatsRanking();
  else renderPlayerStats(statsName);
}

export function renderStatsRanking() {
  statsView = 'ranking';
  document.getElementById('stats-ranking').style.display = 'block';
  document.getElementById('stats-player').style.display  = 'none';

  const el = document.getElementById('stats-ranking-list');
  if (!pStats.length) { el.innerHTML = empty('📊', 'Koi session nahi abhi'); return; }

  const sorted = [...pStats].sort((a, b) => Number(b.net_profit) - Number(a.net_profit));
  el.innerHTML = sorted.map((s, i) => {
    const net = Number(s.net_profit), cls = net > 0 ? 'pos' : net < 0 ? 'neg' : 'zero';
    const wr  = s.total_sessions > 0 ? Math.round(Number(s.wins) / Number(s.total_sessions) * 100) : 0;
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    return `<div class="rank-card ${cls}" data-name="${esc(s.name)}" onclick="app.showPlayerStats(this.dataset.name)">
      <div class="rc-rank">${medal}</div>
      <div class="rc-info">
        <div class="rc-name">${esc(s.name)}</div>
        <div class="rc-meta">${s.total_sessions} sessions · ${wr}% wins</div>
      </div>
      <div class="rc-right">
        <div class="rc-net ${cls}">${net > 0 ? '+' : ''}₹${fmt(Math.abs(net))}</div>
        <div class="rc-avg">${net > 0 ? '+' : ''}₹${fmt(Math.abs(Math.round(Number(s.avg_per_session))))}/sess</div>
      </div>
      <div class="rc-arrow">›</div>
    </div>`;
  }).join('');

  // Graph
  if (!graphActive.length && players.length)
    graphActive = players.slice(0, Math.min(3, players.length)).map(p => p.name);
  renderGraph();
}

export function renderPlayerStats(name) {
  statsView = 'player';
  statsName = name;
  document.getElementById('stats-ranking').style.display = 'none';
  document.getElementById('stats-player').style.display  = 'block';

  const dbStat = pStats.find(s => s.name === name);
  const el     = document.getElementById('stats-player-body');
  const stat   = computePlayerStats(name, sessions, dbStat);

  if (!stat) { el.innerHTML = empty('🃏', 'Koi session nahi'); return; }

  const { net, n, buy, wins, losses, bw, bl, avg, wr, streak, sType, results } = stat;
  const nc = net > 0 ? 'pos' : net < 0 ? 'neg' : 'zero';
  const ac = avg > 0 ? 'pos' : avg < 0 ? 'neg' : 'zero';
  const sg = v => v > 0 ? '+' : '';
  const dots = results.slice(-10).map(r =>
    r > 0 ? '<div class="dot win"></div>' : r < 0 ? '<div class="dot loss"></div>' : '<div class="dot push"></div>'
  ).join('');

  el.innerHTML = `
    <div class="player-header">
      <div class="player-title">${esc(name)}</div>
      <div class="player-sub">Individual stats</div>
    </div>
    <div class="stat-grid">
      <div class="stat-card full ${nc}"><div class="sc-val ${nc}">${sg(net)}₹${fmt(Math.abs(net))}</div><div class="sc-key">All-time net</div></div>
      <div class="stat-card"><div class="sc-val gold">${wr}%</div><div class="sc-key">Win rate</div></div>
      <div class="stat-card"><div class="sc-val">${n}</div><div class="sc-key">Sessions</div></div>
      <div class="stat-card"><div class="sc-val ${ac}">${sg(avg)}₹${fmt(Math.abs(avg))}</div><div class="sc-key">Avg/session</div></div>
      <div class="stat-card"><div class="sc-val">${n > 0 ? (buy / n).toFixed(1) : 0}</div><div class="sc-key">Avg buyings</div></div>
      <div class="stat-card"><div class="sc-val pos">+₹${fmt(bw)}</div><div class="sc-key">Best session</div></div>
      <div class="stat-card"><div class="sc-val neg">₹${fmt(Math.abs(bl))}</div><div class="sc-key">Worst session</div></div>
      <div class="stat-card"><div class="sc-val">${wins}W · ${losses}L</div><div class="sc-key">Record</div></div>
      <div class="stat-card"><div class="sc-val ${sType === 'W' ? 'pos' : 'neg'}">${streak}${sType === 'W' ? ' 🔥' : ' ❄️'}</div><div class="sc-key">Streak</div></div>
    </div>
    <div class="section-label" style="margin-top:16px">Last 10 sessions</div>
    <div class="dots-row">${dots}</div>`;
}

export function toggleGraphPlayer(name) {
  if (graphActive.includes(name)) {
    if (graphActive.length === 1) return;
    graphActive = graphActive.filter(p => p !== name);
  } else {
    graphActive.push(name);
  }
  renderGraph();
}

function renderGraph() {
  const btns = document.getElementById('graph-btns');
  const leg  = document.getElementById('graph-leg');
  const cv   = document.getElementById('pnl-canvas');
  if (!btns || !cv) return;

  btns.innerHTML = players.map((p, i) => {
    const col = GRAPH_COLORS[i % GRAPH_COLORS.length];
    const on  = graphActive.includes(p.name);
    return `<button class="gpbtn ${on ? 'active' : ''}"
      style="${on ? `border-color:${col};color:${col};background:${col}22` : ''}"
      data-name="${esc(p.name)}" onclick="app.togGraph(this.dataset.name)">${esc(p.name)}</button>`;
  }).join('');

  const series = drawGraph(cv, players, sessions, graphActive);
  if (!series) { leg.innerHTML = ''; return; }

  leg.innerHTML = graphActive.map(name => {
    const pi   = players.findIndex(p => p.name === name);
    const col  = GRAPH_COLORS[pi % GRAPH_COLORS.length];
    const last = series[name]?.[series[name].length - 1] ?? 0;
    return `<div class="gleg">
      <div class="gleg-dot" style="background:${col}"></div>
      ${esc(name)}: <span style="color:${last >= 0 ? '#22c55e' : '#ef4444'}">${last > 0 ? '+' : ''}₹${fmt(Math.abs(last))}</span>
    </div>`;
  }).join('');
}

// ── Activity log ──────────────────────────────────────────
export async function renderActivity() {
  const el = document.getElementById('activity-list');
  if (!el) return;
  try {
    const rows = await db.get('poker_activity?order=created_at.desc&limit=50&select=*');
    if (!rows?.length) { el.innerHTML = empty('📋', 'Koi activity nahi abhi'); return; }
    el.innerHTML = rows.map(r => {
      const m = ACTION_META[r.action] || { icon: '•', label: r.action, color: '#94a3b8' };
      return `<div class="act-row">
        <div class="act-icon" style="color:${m.color}">${m.icon}</div>
        <div class="act-info">
          <div class="act-label">${m.label} <span class="act-detail">${esc(r.detail)}</span></div>
          <div class="act-meta">by <strong>${esc(r.done_by)}</strong> · ${timeAgo(r.created_at)}</div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div style="color:#ef4444;font-size:12px">Error: ${e.message}</div>`;
  }
}

// ── Trash tab ─────────────────────────────────────────────
let trashTab = 'sessions';
export function setTrashTab(t) {
  trashTab = t;
  document.getElementById('tt-sess').classList.toggle('active', t === 'sessions');
  document.getElementById('tt-play').classList.toggle('active', t === 'players');
  renderTrash();
}

export async function renderTrash() {
  const el = document.getElementById('trash-body');
  if (!el) return;
  if (!isAdmin) {
    el.innerHTML = `<div class="empty-state"><div class="ei">🔒</div><p>Sirf admin dekh sakta hai</p></div>`;
    return;
  }
  el.innerHTML = `<div class="hint">Loading...</div>`;
  try {
    const { fetchTrashedSessions, fetchTrashedPlayers } = await import('./trash.js');
    if (trashTab === 'sessions') {
      const rows = await fetchTrashedSessions();
      if (!rows.length) { el.innerHTML = empty('✨', 'Trash khali hai'); return; }
      el.innerHTML = rows.map((s, idx) => {
        const d   = new Date(s.played_at);
        const ds  = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        const pot = s.entries.reduce((a, e) => a + e.buyings, 0) * s.buying_rate;
        const delDate = new Date(s.deleted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const rows2 = s.entries.map(e => {
          const cls = e.result > 0 ? 'pos' : e.result < 0 ? 'neg' : 'zero';
          return `<div class="hist-row">
            <span class="h-name">${esc(e.player_name)}</span>
            <span class="h-buy">${e.buyings}×</span>
            <span class="h-net ${cls}">${e.result > 0 ? '+' : ''}₹${fmt(e.result)}</span>
          </div>`;
        }).join('');
        return `<div class="trash-card" style="animation-delay:${idx * 50}ms">
          <div class="trash-hdr">
            <div>
              <div class="trash-ttl">${ds} · ₹${fmt(pot)} pot</div>
              <div class="trash-meta">🗑 ${delDate} by ${esc(s.deleted_by || 'Admin')}</div>
            </div>
            <div class="trash-acts">
              <button class="tbtn restore" data-id="${esc(s.id)}" onclick="app.restoreSess(this.dataset.id)">♻️</button>
              <button class="tbtn purge"   data-id="${esc(s.id)}" onclick="app.purgeSess(this.dataset.id)">💥</button>
            </div>
          </div>
          <div class="hist-body">${rows2}</div>
        </div>`;
      }).join('');
    } else {
      const rows = await fetchTrashedPlayers();
      if (!rows.length) { el.innerHTML = empty('✨', 'Koi player trash mein nahi'); return; }
      el.innerHTML = rows.map((p, idx) => {
        const delDate = new Date(p.deleted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        return `<div class="trash-player" style="animation-delay:${idx * 50}ms">
          <div>
            <div class="tp-name">🃏 ${esc(p.name)}</div>
            <div class="trash-meta">🗑 ${delDate} by ${esc(p.deleted_by || 'Admin')}</div>
          </div>
          <div class="trash-acts">
            <button class="tbtn restore" data-id="${esc(p.id)}" data-name="${esc(p.name)}" onclick="app.restorePlay(this.dataset.id,this.dataset.name)">♻️ Restore</button>
            <button class="tbtn purge"   data-id="${esc(p.id)}" data-name="${esc(p.name)}" onclick="app.purgePlay(this.dataset.id,this.dataset.name)">💥 Delete</button>
          </div>
        </div>`;
      }).join('');
    }
  } catch (e) {
    el.innerHTML = `<div style="color:#ef4444;font-size:12px;padding:12px">Error: ${e.message}</div>`;
  }
}

export async function updateTrashBadge() {
  if (!isAdmin) return;
  try {
    const { getTrashCount } = await import('./trash.js');
    const count = await getTrashCount();
    const nb    = document.getElementById('nav-trash');
    if (!nb) return;
    let badge = nb.querySelector('.nav-badge');
    if (count > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge'; nb.appendChild(badge); }
      badge.textContent = count;
    } else {
      badge?.remove();
    }
  } catch {}
}

// ── More tab ──────────────────────────────────────────────
export function renderMore() {
  renderPlayerList();
  document.getElementById('more-device-id').textContent = localStorage.getItem('poker_device_v2') || '—';
  document.getElementById('more-stats').textContent =
    `${players.length} players · ${sessions.length} sessions`;
  if (isAdmin) {
    document.getElementById('admin-section').style.display = 'block';
  }
}

export function renderPlayerList() {
  const el = document.getElementById('players-list');
  if (!el) return;

  const active   = players.filter(p => p.is_active !== false);
  const inactive = players.filter(p => p.is_active === false);
  let html = '';

  if (active.length) {
    html += `<div class="section-label">Active</div>`;
    html += active.map(p => `
      <div class="player-row">
        <div class="pr-info">
          <div class="pr-name">${esc(p.name)}</div>
          <div class="pr-phone">${esc(p.phone)}</div>
        </div>
        ${isAdmin ? `<div class="pr-acts">
          <button class="small-btn" data-id="${esc(p.id)}" data-name="${esc(p.name)}" onclick="app.deactivatePlayer(this.dataset.id,this.dataset.name)">Deactivate</button>
          <button class="small-btn danger" data-id="${esc(p.id)}" data-name="${esc(p.name)}" onclick="app.trashPlayer(this.dataset.id,this.dataset.name)">🗑</button>
        </div>` : ''}
      </div>`).join('');
  }

  if (inactive.length) {
    html += `<div class="section-label" style="margin-top:16px">Inactive</div>`;
    html += inactive.map(p => `
      <div class="player-row inactive">
        <div class="pr-info">
          <div class="pr-name">${esc(p.name)}</div>
          <div class="pr-phone">${esc(p.phone)}</div>
        </div>
        ${isAdmin ? `<div class="pr-acts">
          <button class="small-btn green" data-id="${esc(p.id)}" data-name="${esc(p.name)}" onclick="app.activatePlayer(this.dataset.id,this.dataset.name)">Activate</button>
          <button class="small-btn danger" data-id="${esc(p.id)}" data-name="${esc(p.name)}" onclick="app.trashPlayer(this.dataset.id,this.dataset.name)">🗑</button>
        </div>` : ''}
      </div>`).join('');
  }

  if (!html) html = empty('👤', 'Koi player nahi. Add karo!');
  el.innerHTML = html;
}

// ── Helpers ───────────────────────────────────────────────
function getRate() {
  return parseInt(document.getElementById('buying-rate')?.value) || 100;
}

function fmt(n) {
  return Math.abs(Number(n)).toLocaleString('en-IN');
}

function empty(icon, msg) {
  return `<div class="empty-state"><div class="ei">${icon}</div><p>${msg}</p></div>`;
}

function timeAgo(dateStr) {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'abhi';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
