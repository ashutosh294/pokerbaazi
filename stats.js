// ══════════════════════════════════════════════════════════
//  STATS — Per-player stats + P&L canvas graph
// ══════════════════════════════════════════════════════════

const GRAPH_COLORS = [
  '#e07b39','#3b82f6','#22c55e','#a855f7',
  '#ef4444','#eab308','#06b6d4','#f97316',
];

// ── Individual stat computation ───────────────────────────
export function computePlayerStats(name, sessions, dbStat) {
  const ps = sessions.filter(s => s.entries.some(e => e.player_name === name));
  if (!ps.length || !dbStat) return null;

  const net    = Number(dbStat.net_profit);
  const n      = Number(dbStat.total_sessions);
  const buy    = Number(dbStat.total_buyings);
  const wins   = Number(dbStat.wins);
  const losses = Number(dbStat.losses);
  const bw     = Number(dbStat.best_session);
  const bl     = Number(dbStat.worst_session);
  const avg    = Math.round(Number(dbStat.avg_per_session));
  const wr     = n > 0 ? Math.round((wins / n) * 100) : 0;

  // Current streak
  const results = ps.map(s => s.entries.find(e => e.player_name === name)?.result ?? 0);
  const rev     = [...results].reverse();
  const sType   = rev[0] > 0 ? 'W' : 'L';
  let streak    = 0;
  for (const r of rev) {
    if ((r > 0 && sType === 'W') || (r < 0 && sType === 'L')) streak++;
    else break;
  }

  return { net, n, buy, wins, losses, bw, bl, avg, wr, streak, sType, results };
}

// ── Draw P&L graph on canvas ──────────────────────────────
export function drawGraph(canvasEl, players, sessions, activePlayers) {
  const dpr = window.devicePixelRatio || 1;
  const W   = canvasEl.parentElement.clientWidth - 24;
  const H   = 200;
  canvasEl.style.width  = W + 'px';
  canvasEl.style.height = H + 'px';
  canvasEl.width  = W * dpr;
  canvasEl.height = H * dpr;

  const ctx = canvasEl.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const sorted = [...sessions].reverse();
  const N      = sorted.length;

  if (!N) {
    ctx.fillStyle = '#999';
    ctx.font      = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No sessions yet', W / 2, H / 2);
    return;
  }

  // Build series
  const series = {};
  activePlayers.forEach(name => {
    let cum = 0;
    series[name] = [0];
    sorted.forEach(s => {
      const e = s.entries.find(x => x.player_name === name);
      if (e) cum += e.result;
      series[name].push(cum);
    });
  });

  // Min/max
  let mn = 0, mx = 0;
  activePlayers.forEach(name =>
    series[name].forEach(v => { if (v < mn) mn = v; if (v > mx) mx = v; })
  );
  if (mn === mx) { mn -= 100; mx += 100; }

  const P  = { t: 18, b: 28, l: 52, r: 12 };
  const gW = W - P.l - P.r;
  const gH = H - P.t - P.b;
  const xOf = i => P.l + (i / N) * gW;
  const yOf = v => P.t + gH - ((v - mn) / (mx - mn)) * gH;

  // Grid lines
  for (let g = 0; g <= 4; g++) {
    const y   = P.t + (g / 4) * gH;
    const val = mx - (g / 4) * (mx - mn);
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(W - P.r, y); ctx.stroke();
    ctx.fillStyle   = '#aaa';
    ctx.font        = '9px DM Mono, monospace';
    ctx.textAlign   = 'right';
    ctx.fillText(Math.round(val / 100) * 100, P.l - 4, y + 3);
  }

  // Zero line
  if (mn < 0 && mx > 0) {
    const y0 = yOf(0);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(P.l, y0); ctx.lineTo(W - P.r, y0); ctx.stroke();
    ctx.setLineDash([]);
  }

  // X labels
  ctx.fillStyle   = '#aaa';
  ctx.font        = '9px DM Mono, monospace';
  ctx.textAlign   = 'center';
  for (let i = 1; i <= N; i++) {
    if (N <= 8 || i % Math.ceil(N / 6) === 0 || i === N)
      ctx.fillText('S' + i, xOf(i), H - P.b + 14);
  }

  // Draw each player line
  activePlayers.forEach((name, pi) => {
    const col = GRAPH_COLORS[players.findIndex(p => p.name === name) % GRAPH_COLORS.length];
    const pts = series[name];

    // Fill
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(pts[0]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(xOf(i), yOf(pts[i]));
    ctx.lineTo(xOf(pts.length - 1), yOf(0));
    ctx.lineTo(xOf(0), yOf(0));
    ctx.closePath();
    ctx.fillStyle = col + '18';
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(pts[0]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(xOf(i), yOf(pts[i]));
    ctx.strokeStyle = col;
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'round';
    ctx.stroke();

    // Dots
    pts.forEach((v, i) => {
      ctx.beginPath();
      ctx.arc(xOf(i), yOf(v), 3, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    });
  });

  return series;
}

export { GRAPH_COLORS };
