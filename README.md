# ♠ Poker Tracker v2

Clean, minimal poker session tracker. Mobile-first PWA.

---

## File Structure

```
poker-app/
├── index.html              ← Main app
├── manifest.json           ← PWA config
├── vercel.json             ← Deployment config
├── sw.js                   ← Service worker (offline)
├── favicon.svg             ← Spade icon
├── .env.example            ← Environment variables template
├── api/
│   └── env.js              ← Vercel function (serves config)
├── js/
│   ├── config.js           ← App constants
│   ├── db.js               ← Supabase REST wrapper
│   ├── auth.js             ← Phone login + admin PIN
│   ├── sync.js             ← Offline cache + realtime
│   ├── session.js          ← Session state + save
│   ├── settle.js           ← Settlement calculator
│   ├── stats.js            ← Stats + P&L graph
│   ├── trash.js            ← Recycle bin
│   ├── activity.js         ← Activity log
│   └── ui.js               ← All render functions
└── supabase/
    └── schema.sql          ← Complete DB schema
```

---

## Setup: Step by Step

### Step 1 — Supabase

1. [supabase.com](https://supabase.com) pe jaao → New project banao
2. **SQL Editor** mein `supabase/schema.sql` ka poora content paste karo → Run
3. Last line mein apna **naam aur phone number** update karo:
   ```sql
   INSERT INTO poker_players (name, phone, is_admin)
   VALUES ('Tumhara Naam', '9876543210', true)
   ```
4. **Settings → API** se copy karo:
   - `Project URL`
   - `anon / public` key

### Step 2 — Vercel

1. [vercel.com](https://vercel.com) → GitHub se project import karo
2. **Settings → Environment Variables** mein yeh teen add karo:

   | Key | Value |
   |-----|-------|
   | `POKER_SB_URL` | Supabase Project URL |
   | `POKER_SB_KEY` | Supabase anon key |
   | `POKER_ADMIN_PIN` | Admin ka PIN (e.g. `2025`) |

3. Deploy karo → Done!

### Step 3 — Pehli baar use

1. App kholo → Apna registered number daalo
2. Agar admin ho → Admin PIN maanga jaayega
3. More tab mein baki players add karo (naam + phone)
4. Players ko URL share karo — woh apna number daale, andar!

---

## Access Levels

| Role | Kya kar sakta hai |
|------|-------------------|
| **Admin** | Sab kuch — players add/delete, sessions, trash |
| **Member** | Session save karna, data dekhna |
| **Viewer** | Sirf read-only (bina login ke) |

### Rules
- **1 phone = 1 device** — dusre device pe login attempt block hoga
- Admin phone wale ko **Admin PIN** bhi daalna hoga
- Logout → profile bar mein button hai

---

## Features

- 🏆 **Leaderboard** — All-time standings
- 🃏 **Session** — Buyings + results record karo
- 📜 **History** — Past sessions
- 💸 **Settle** — Minimum transactions calculator + WhatsApp copy
- 📊 **Stats** — Per-player stats + P&L graph
- 🗑 **Trash** — Soft delete with restore (admin only)
- 📋 **Activity Log** — Auto-delete after 7 days
- 📵 **Offline** — localStorage cache, works without internet
- 🔄 **Realtime** — Changes sync across all devices instantly
- 📲 **PWA** — Install on home screen

---

## Supabase Free Plan — Limits

| Resource | Free Limit | This App Usage |
|----------|-----------|----------------|
| DB Size | 500 MB | ~1 MB for years |
| API Requests | Unlimited | Low |
| Realtime connections | 200 | Low |
| Activity logs | — | Auto-delete 7 din |

**Free plan pe saalon tak kaam karega.**

---

## Local Development

No build tools needed — vanilla JS modules.

```bash
# Simple HTTP server se chalao (modules ke liye HTTPS/localhost chahiye)
npx serve .
# ya
python3 -m http.server 3000
```

Fir `http://localhost:3000` kholo.

Env variables ke liye `api/env.js` ko temporarily edit karo:
```js
const config = {
  SB_URL:    'https://your-project.supabase.co',
  SB_KEY:    'your-anon-key',
  ADMIN_PIN: '2025',
};
```
