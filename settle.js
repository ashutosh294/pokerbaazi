// ══════════════════════════════════════════════════════════
//  SETTLE — Balance + minimum transactions algorithm
// ══════════════════════════════════════════════════════════

// Compute net balance per player from sessions
export function computeBalances(sessionList) {
  const bal = {};
  sessionList.forEach(s =>
    s.entries.forEach(e => {
      bal[e.player_name] = (bal[e.player_name] || 0) + e.result;
    })
  );
  return bal;
}

// Minimum transactions to settle all debts
export function minTransactions(balances) {
  const pos = [], neg = [];
  Object.entries(balances).forEach(([name, amt]) => {
    const r = Math.round(amt);
    if (r > 0) pos.push({ name, amt:  r });
    else if (r < 0) neg.push({ name, amt: -r });
  });

  pos.sort((a, b) => b.amt - a.amt);
  neg.sort((a, b) => b.amt - a.amt);

  const txns = [];
  let i = 0, j = 0;
  while (i < neg.length && j < pos.length) {
    const d = neg[i], c = pos[j];
    const a = Math.min(d.amt, c.amt);
    if (a > 0) txns.push({ from: d.name, to: c.name, amount: a });
    d.amt -= a;
    c.amt -= a;
    if (d.amt === 0) i++;
    if (c.amt === 0) j++;
  }
  return txns;
}

// WhatsApp copy text
export function settleText(txns, balances, src) {
  let txt = `♠ Poker Settle (${src === 'last' ? 'Last Session' : 'All-time'})\n${'─'.repeat(24)}\n`;
  if (!txns.length) {
    txt += '✅ Sab settled!\n';
  } else {
    txns.forEach(t => {
      txt += `💸 ${t.from} → ${t.to}: ₹${t.amount.toLocaleString('en-IN')}\n`;
    });
  }
  txt += `${'─'.repeat(24)}\n`;
  Object.entries(balances)
    .sort((a, b) => b[1] - a[1])
    .forEach(([n, a]) => {
      txt += `${a >= 0 ? '🟢' : '🔴'} ${n}: ${a > 0 ? '+' : ''}₹${Math.round(a).toLocaleString('en-IN')}\n`;
    });
  return txt;
}
